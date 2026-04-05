package queue

import (
	"context"
	"fmt"
	"time"

	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/models"
)

// ─── Scheduler ────────────────────────────────────────────────────────────────

// Scheduler wraps asynq.Scheduler with the application's recurring job definitions.
type Scheduler struct {
	inner  *asynq.Scheduler
	client *asynq.Client
	db     *gorm.DB
	log    *zap.Logger
}

// NewScheduler creates and configures the asynq periodic scheduler.
// Call Start() to begin executing jobs and Stop() for graceful shutdown.
func NewScheduler(redisClient *redis.Client, db *gorm.DB, log *zap.Logger) (*Scheduler, error) {
	opt := asynq.RedisClientOpt{
		Addr:     redisClient.Options().Addr,
		Password: redisClient.Options().Password,
		DB:       redisClient.Options().DB,
	}

	inner := asynq.NewScheduler(opt, &asynq.SchedulerOpts{
		Location: time.UTC,
		// Log scheduler-level errors via zap.
		PostEnqueueFunc: func(info *asynq.TaskInfo, err error) {
			if err != nil {
				log.Error("scheduler: failed to enqueue task",
					zap.String("type", info.Type),
					zap.Error(err),
				)
			} else {
				log.Debug("scheduler: task enqueued",
					zap.String("type", info.Type),
					zap.String("id", info.ID),
				)
			}
		},
	})

	client := asynq.NewClient(opt)

	s := &Scheduler{
		inner:  inner,
		client: client,
		db:     db,
		log:    log,
	}

	if err := s.registerJobs(); err != nil {
		return nil, fmt.Errorf("scheduler: register jobs: %w", err)
	}

	return s, nil
}

// registerJobs wires all recurring tasks to their cron expressions.
func (s *Scheduler) registerJobs() error {
	// ── Every 5 minutes: enqueue posts that are due to be published ──────────
	{
		task, err := NewPublishDuePostsTask()
		if err != nil {
			return err
		}
		if _, err := s.inner.Register("*/5 * * * *", task,
			asynq.Queue("critical"),
			asynq.Unique(4*time.Minute), // de-duplicate concurrent runs
		); err != nil {
			return fmt.Errorf("register enqueue_due_posts: %w", err)
		}
	}

	// ── Every 1 hour: sweep OAuth tokens that are about to expire ───────────
	{
		task, err := NewRefreshTokensTask()
		if err != nil {
			return err
		}
		if _, err := s.inner.Register("0 * * * *", task,
			asynq.Queue("low"),
			asynq.Unique(55*time.Minute),
		); err != nil {
			return fmt.Errorf("register refresh_tokens: %w", err)
		}
	}

	// ── Every day at midnight UTC: clean up audit logs older than 90 days ───
	{
		task, err := NewCleanupAuditLogsTask()
		if err != nil {
			return err
		}
		if _, err := s.inner.Register("0 0 * * *", task,
			asynq.Queue("low"),
			asynq.Unique(23*time.Hour),
		); err != nil {
			return fmt.Errorf("register cleanup_audit_logs: %w", err)
		}
	}

	// ── Every 15 minutes: retry failed posts (up to max 3 attempts) ─────────
	{
		task, err := NewRetryFailedPostsTask()
		if err != nil {
			return err
		}
		if _, err := s.inner.Register("*/15 * * * *", task,
			asynq.Queue("default"),
			asynq.Unique(14*time.Minute),
		); err != nil {
			return fmt.Errorf("register retry_failed_posts: %w", err)
		}
	}

	s.log.Info("scheduler: all recurring jobs registered")
	return nil
}

// Start begins the scheduler loop. Blocks until Stop is called.
func (s *Scheduler) Start() error {
	s.log.Info("scheduler: starting")
	return s.inner.Run()
}

// Stop gracefully shuts down the scheduler.
func (s *Scheduler) Stop() {
	s.log.Info("scheduler: stopping")
	s.inner.Shutdown()
	_ = s.client.Close()
}

// ─── Inline handler tasks ─────────────────────────────────────────────────────
// These are lightweight "meta" tasks that the scheduler enqueues; the actual
// worker reads from the DB and fans out individual publish tasks.

// NewPublishDuePostsTask creates the meta-task that triggers due-post scanning.
func NewPublishDuePostsTask() (*asynq.Task, error) {
	return asynq.NewTask(TypeEnqueueDuePosts, nil), nil
}

// NewCleanupAuditLogsTask creates the maintenance cleanup task.
func NewCleanupAuditLogsTask() (*asynq.Task, error) {
	return asynq.NewTask(TypeCleanupAuditLogs, nil), nil
}

// NewRetryFailedPostsTask creates the retry-sweep meta-task.
func NewRetryFailedPostsTask() (*asynq.Task, error) {
	return asynq.NewTask(TypeRetryFailedPosts, nil), nil
}

// ─── SchedulerWorker ─────────────────────────────────────────────────────────
// Handles the meta-tasks emitted by the scheduler by performing DB queries and
// fanning out per-post/per-account tasks.

// SchedulerWorker processes the meta scheduler tasks.
type SchedulerWorker struct {
	db     *gorm.DB
	client *asynq.Client
	log    *zap.Logger
}

// NewSchedulerWorker creates the worker that handles scheduler meta-tasks.
func NewSchedulerWorker(redisClient *redis.Client, db *gorm.DB, log *zap.Logger) *SchedulerWorker {
	return &SchedulerWorker{
		db:  db,
		log: log,
		client: asynq.NewClient(asynq.RedisClientOpt{
			Addr:     redisClient.Options().Addr,
			Password: redisClient.Options().Password,
			DB:       redisClient.Options().DB,
		}),
	}
}

// RegisterHandlers wires the meta-task handlers into the provided mux.
func (sw *SchedulerWorker) RegisterHandlers(mux *asynq.ServeMux) {
	mux.HandleFunc(TypeEnqueueDuePosts, sw.handleEnqueueDuePosts)
	mux.HandleFunc(TypeCleanupAuditLogs, sw.handleCleanupAuditLogs)
	mux.HandleFunc(TypeRetryFailedPosts, sw.handleRetryFailedPosts)
}

// handleEnqueueDuePosts queries for posts with scheduled_at <= now and status =
// 'scheduled', then enqueues a TypePublishPost task for each.
func (sw *SchedulerWorker) handleEnqueueDuePosts(ctx context.Context, _ *asynq.Task) error {
	now := time.Now().UTC()
	sw.log.Info("enqueue_due_posts: scanning", zap.Time("at", now))

	var posts []models.Post
	if err := sw.db.WithContext(ctx).
		Where("scheduled_at <= ? AND status = 'scheduled'", now).
		Find(&posts).Error; err != nil {
		return fmt.Errorf("enqueue_due_posts: query: %w", err)
	}

	sw.log.Info("enqueue_due_posts: found due posts", zap.Int("count", len(posts)))
	var enqueueErrors int
	for _, post := range posts {
		task, err := NewPublishPostTask(PublishPostPayload{
			PostID:      post.ID,
			WorkspaceID: post.WorkspaceID,
		})
		if err != nil {
			sw.log.Error("enqueue_due_posts: create task", zap.Error(err))
			enqueueErrors++
			continue
		}

		info, err := sw.client.EnqueueContext(ctx, task,
			asynq.Queue("critical"),
			asynq.Unique(5*time.Minute),
		)
		if err != nil {
			sw.log.Error("enqueue_due_posts: enqueue task",
				zap.String("post_id", post.ID.String()),
				zap.Error(err),
			)
			enqueueErrors++
			continue
		}

		sw.log.Debug("enqueue_due_posts: enqueued",
			zap.String("post_id", post.ID.String()),
			zap.String("task_id", info.ID),
		)

		// Mark as "publishing" so we don't double-enqueue on the next tick.
		sw.db.WithContext(ctx).Model(&post).Updates(map[string]interface{}{"status": "publishing"})
	}

	if enqueueErrors > 0 {
		return fmt.Errorf("enqueue_due_posts: %d of %d enqueue operations failed", enqueueErrors, len(posts))
	}
	return nil
}

// handleCleanupAuditLogs deletes audit log entries older than 90 days.
func (sw *SchedulerWorker) handleCleanupAuditLogs(ctx context.Context, _ *asynq.Task) error {
	cutoff := time.Now().UTC().AddDate(0, 0, -90)
	sw.log.Info("cleanup_audit_logs: deleting records older than", zap.Time("cutoff", cutoff))

	result := sw.db.WithContext(ctx).
		Unscoped().
		Where("created_at < ?", cutoff).
		Delete(&models.AuditLog{})

	if result.Error != nil {
		return fmt.Errorf("cleanup_audit_logs: %w", result.Error)
	}
	sw.log.Info("cleanup_audit_logs: deleted rows", zap.Int64("count", result.RowsAffected))
	return nil
}

// handleRetryFailedPosts re-enqueues failed posts that have not exceeded the
// retry cap (3 attempts) and whose scheduled time is in the recent past.
func (sw *SchedulerWorker) handleRetryFailedPosts(ctx context.Context, _ *asynq.Task) error {
	const maxRetries = 3
	// Only retry posts that were supposed to go out in the last 2 hours.
	since := time.Now().UTC().Add(-2 * time.Hour)

	sw.log.Info("retry_failed_posts: scanning for retryable posts")

	var posts []models.Post
	if err := sw.db.WithContext(ctx).
		Where("status = 'failed' AND retry_count < ? AND scheduled_at >= ?", maxRetries, since).
		Find(&posts).Error; err != nil {
		return fmt.Errorf("retry_failed_posts: query: %w", err)
	}

	sw.log.Info("retry_failed_posts: found retryable posts", zap.Int("count", len(posts)))
	for _, post := range posts {
		task, err := NewPublishPostTask(PublishPostPayload{
			PostID:      post.ID,
			WorkspaceID: post.WorkspaceID,
		})
		if err != nil {
			continue
		}
		if _, err := sw.client.EnqueueContext(ctx, task,
			asynq.Queue("critical"),
			asynq.Unique(5*time.Minute),
		); err != nil {
			sw.log.Warn("retry_failed_posts: re-enqueue failed",
				zap.String("post_id", post.ID.String()),
				zap.Error(err),
			)
		}
	}
	return nil
}
