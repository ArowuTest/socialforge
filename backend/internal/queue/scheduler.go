package queue

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"
	"github.com/robfig/cron/v3"
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
		Addr:      redisClient.Options().Addr,
		Password:  redisClient.Options().Password,
		DB:        redisClient.Options().DB,
		TLSConfig: redisClient.Options().TLSConfig, // required for rediss:// (Upstash)
	}

	inner := asynq.NewScheduler(opt, &asynq.SchedulerOpts{
		Location: time.UTC,
		// Log scheduler-level errors via zap.
		PostEnqueueFunc: func(info *asynq.TaskInfo, err error) {
			if err != nil {
				taskType := ""
				if info != nil {
					taskType = info.Type
				}
				log.Error("scheduler: failed to enqueue task",
					zap.String("type", taskType),
					zap.Error(err),
				)
			} else if info != nil {
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
	// ── Every minute: enqueue posts that are due to be published ────────────
	{
		task, err := NewPublishDuePostsTask()
		if err != nil {
			return err
		}
		if _, err := s.inner.Register("* * * * *", task,
			asynq.Queue("critical"),
			asynq.Unique(55*time.Second), // de-duplicate — only one in flight per minute
			asynq.Timeout(50*time.Second), // kill stale tasks from backlog on restart
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

	// ── Every 10 minutes: mark stuck AI jobs as failed ──────────────────────
	{
		task := asynq.NewTask(TypeExpireAIJobs, nil)
		if _, err := s.inner.Register("*/10 * * * *", task,
			asynq.Queue("low"),
			asynq.Unique(9*time.Minute),
		); err != nil {
			return fmt.Errorf("register expire_ai_jobs: %w", err)
		}
	}

	// ── Every minute: check for schedule-based automation triggers ───────────
	{
		task, err := NewCheckScheduledAutomationsTask()
		if err != nil {
			return err
		}
		if _, err := s.inner.Register("* * * * *", task,
			asynq.Queue("default"),
			asynq.Unique(55*time.Second),
		); err != nil {
			return fmt.Errorf("register check_scheduled_automations: %w", err)
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
			Addr:      redisClient.Options().Addr,
			Password:  redisClient.Options().Password,
			DB:        redisClient.Options().DB,
			TLSConfig: redisClient.Options().TLSConfig,
		}),
	}
}

// RegisterHandlers wires the meta-task handlers into the provided mux.
func (sw *SchedulerWorker) RegisterHandlers(mux *asynq.ServeMux) {
	mux.HandleFunc(TypeEnqueueDuePosts, sw.handleEnqueueDuePosts)
	mux.HandleFunc(TypeCleanupAuditLogs, sw.handleCleanupAuditLogs)
	mux.HandleFunc(TypeRetryFailedPosts, sw.handleRetryFailedPosts)
	mux.HandleFunc(TypeExpireAIJobs, sw.handleExpireAIJobs)
	mux.HandleFunc(TypeCheckScheduledAutomations, sw.handleCheckScheduledAutomations)
}

// handleExpireAIJobs marks AI jobs that have been stuck in pending/processing
// for more than 30 minutes as failed. Covers crashed workers and orphaned jobs.
func (sw *SchedulerWorker) handleExpireAIJobs(ctx context.Context, _ *asynq.Task) error {
	cutoff := time.Now().UTC().Add(-30 * time.Minute)
	sw.log.Info("expire_ai_jobs: scanning", zap.Time("cutoff", cutoff))

	result := sw.db.WithContext(ctx).
		Model(&models.AIJob{}).
		Where("status IN ? AND updated_at < ?",
			[]models.AIJobStatus{models.AIJobStatusPending, models.AIJobStatusProcessing},
			cutoff).
		Updates(map[string]interface{}{
			"status":        models.AIJobStatusFailed,
			"error_message": "job timed out after 30 minutes",
		})

	if result.Error != nil {
		return fmt.Errorf("expire_ai_jobs: %w", result.Error)
	}
	if result.RowsAffected > 0 {
		sw.log.Warn("expire_ai_jobs: marked stuck jobs as failed", zap.Int64("count", result.RowsAffected))
	}
	return nil
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
			// ErrDuplicateTask means the unique lock is active — the task is
			// already queued or being processed. This is expected behaviour when
			// multiple scheduler ticks overlap; treat it as a no-op, not an error.
			if errors.Is(err, asynq.ErrDuplicateTask) || errors.Is(err, asynq.ErrTaskIDConflict) {
				sw.log.Debug("enqueue_due_posts: task already queued, skipping",
					zap.String("post_id", post.ID.String()),
				)
				continue
			}
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

// handleCheckScheduledAutomations fires all enabled schedule-based automations
// whose trigger_config matches the current UTC time. Runs every minute.
//
// trigger_config schema (all optional):
//
//	interval    : "hourly" | "daily" | "weekly" | "custom"  (default "daily")
//	hour        : 0-23   — UTC hour to fire (used for daily/weekly)
//	minute      : 0-59   — UTC minute to fire (default 0)
//	day_of_week : 0-6    — 0=Sunday … 6=Saturday (used for weekly only)
func (sw *SchedulerWorker) handleCheckScheduledAutomations(ctx context.Context, _ *asynq.Task) error {
	now := time.Now().UTC()
	sw.log.Info("check_scheduled_automations: scanning", zap.Time("at", now))

	var automations []models.Automation
	if err := sw.db.WithContext(ctx).
		Where("trigger_type = ? AND is_enabled = true", models.TriggerSchedule).
		Find(&automations).Error; err != nil {
		return fmt.Errorf("check_scheduled_automations: query: %w", err)
	}

	sw.log.Info("check_scheduled_automations: evaluating automations", zap.Int("count", len(automations)))
	var enqueued int
	for _, a := range automations {
		if !scheduledAutomationFires(a, now) {
			continue
		}

		payload := RunAutomationPayload{
			AutomationID: a.ID,
			WorkspaceID:  a.WorkspaceID,
			TriggerData: map[string]interface{}{
				"trigger_type": "schedule",
				"fired_at":     now.Format(time.RFC3339),
			},
		}
		task, err := NewRunAutomationTask(payload,
			// De-duplicate: at most one fire per automation per minute.
			asynq.Unique(55*time.Second),
		)
		if err != nil {
			sw.log.Error("check_scheduled_automations: create task", zap.String("automation_id", a.ID.String()), zap.Error(err))
			continue
		}
		if _, err := sw.client.EnqueueContext(ctx, task, asynq.Queue("default")); err != nil {
			if !errors.Is(err, asynq.ErrDuplicateTask) && !errors.Is(err, asynq.ErrTaskIDConflict) {
				sw.log.Warn("check_scheduled_automations: enqueue failed",
					zap.String("automation_id", a.ID.String()),
					zap.Error(err),
				)
			}
			continue
		}
		enqueued++
		sw.log.Info("check_scheduled_automations: automation enqueued",
			zap.String("automation_id", a.ID.String()),
			zap.String("name", a.Name),
		)
	}

	sw.log.Info("check_scheduled_automations: done", zap.Int("enqueued", enqueued))
	return nil
}

// scheduledAutomationFires returns true if the automation's schedule matches the
// given UTC time (truncated to the current minute). It supports two formats:
//
//  1. trigger_config.cron: a standard 5-field cron expression (preferred — used by
//     the frontend). Evaluated using robfig/cron so users get the full cron spec.
//
//  2. Legacy key-based config:
//     interval    : "hourly" | "daily" | "weekly"
//     hour        : 0-23
//     minute      : 0-59
//     day_of_week : 0-6  (Sunday=0)
func scheduledAutomationFires(a models.Automation, now time.Time) bool {
	cfg := a.TriggerConfig

	// ── cron expression (primary format) ────────────────────────────────────
	if cronExpr, ok := cfg["cron"].(string); ok && cronExpr != "" {
		return cronExpressionFires(cronExpr, now)
	}

	// ── Legacy interval-based format ─────────────────────────────────────────
	interval := "daily"
	if v, ok := cfg["interval"].(string); ok && v != "" {
		interval = v
	}

	wantMinute := 0
	if v, ok := cfg["minute"]; ok {
		switch m := v.(type) {
		case float64:
			wantMinute = int(m)
		case int:
			wantMinute = m
		}
	}

	switch interval {
	case "hourly":
		return now.Minute() == wantMinute

	case "daily":
		wantHour := 9
		if v, ok := cfg["hour"]; ok {
			switch h := v.(type) {
			case float64:
				wantHour = int(h)
			case int:
				wantHour = h
			}
		}
		return now.Hour() == wantHour && now.Minute() == wantMinute

	case "weekly":
		wantHour := 9
		if v, ok := cfg["hour"]; ok {
			switch h := v.(type) {
			case float64:
				wantHour = int(h)
			case int:
				wantHour = h
			}
		}
		wantDOW := 1
		if v, ok := cfg["day_of_week"]; ok {
			switch d := v.(type) {
			case float64:
				wantDOW = int(d)
			case int:
				wantDOW = d
			}
		}
		return int(now.Weekday()) == wantDOW && now.Hour() == wantHour && now.Minute() == wantMinute

	default:
		return false
	}
}

// cronExpressionFires returns true when the given 5-field cron expression would
// have fired during the minute containing `now`. It works by checking whether
// the scheduler would schedule a run in the interval [truncatedNow, truncatedNow+1min).
func cronExpressionFires(expr string, now time.Time) bool {
	parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
	schedule, err := parser.Parse(expr)
	if err != nil {
		// Malformed expression — don't fire.
		return false
	}
	// The canonical check: the next scheduled time after (now - 1 minute) must
	// fall within the current minute window.
	minuteStart := now.Truncate(time.Minute)
	prev := minuteStart.Add(-time.Second) // one second before this minute
	next := schedule.Next(prev)
	return !next.IsZero() && next.Before(minuteStart.Add(time.Minute))
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
