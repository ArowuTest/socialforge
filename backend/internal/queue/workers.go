package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/models"
)

// ─── Publisher interface ──────────────────────────────────────────────────────

// Publisher is the interface each platform-specific publisher must implement.
type Publisher interface {
	PublishPost(ctx context.Context, post *models.Post, account *models.SocialAccount) (externalID string, externalURL string, err error)
}

// ─── AIService interface ──────────────────────────────────────────────────────

// AIService is the interface the queue worker uses to invoke AI jobs.
type AIService interface {
	ProcessJob(ctx context.Context, payload interface{}) (map[string]interface{}, error)
}

// RepurposeService is the interface the queue worker uses for repurposing.
type RepurposeService interface {
	ProcessRepurpose(ctx context.Context, payload RepurposeContentPayload) (map[string]interface{}, error)
}

// ─── OAuthRefresher interface ─────────────────────────────────────────────────

// OAuthRefresher refreshes a single social account's access token in-place.
type OAuthRefresher interface {
	RefreshToken(ctx context.Context, account *models.SocialAccount) error
}

// ─── WorkerDeps ───────────────────────────────────────────────────────────────

// WorkerDeps bundles all dependencies needed by the queue handlers.
type WorkerDeps struct {
	DB               *gorm.DB
	Logger           *zap.Logger
	Publisher        Publisher
	AIService        AIService
	RepurposeService RepurposeService
	OAuthRefresher   OAuthRefresher
}

// ─── PublishPostHandler ───────────────────────────────────────────────────────

type PublishPostHandler struct {
	deps WorkerDeps
}

func (h *PublishPostHandler) ProcessTask(ctx context.Context, t *asynq.Task) error {
	var p PublishPostPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("publishPostHandler: unmarshal payload: %w", err)
	}

	log := h.deps.Logger.With(
		zap.String("post_id", p.PostID.String()),
		zap.String("workspace_id", p.WorkspaceID.String()),
	)
	log.Info("publishing post")

	// Fetch post. No Preload needed — the publisher resolves social accounts
	// via PostPlatforms internally.
	var post models.Post
	if err := h.deps.DB.WithContext(ctx).
		First(&post, "id = ? AND workspace_id = ?", p.PostID, p.WorkspaceID).Error; err != nil {
		return fmt.Errorf("publishPostHandler: fetch post %s: %w", p.PostID, err)
	}

	// Guard: skip if already published or cancelled.
	if post.Status == "published" || post.Status == "cancelled" {
		log.Info("post already in terminal state, skipping", zap.String("status", string(post.Status)))
		return nil
	}

	// Mark as publishing.
	if err := h.deps.DB.WithContext(ctx).Model(&post).
		Updates(map[string]interface{}{"status": "publishing"}).Error; err != nil {
		return fmt.Errorf("publishPostHandler: set status publishing: %w", err)
	}

	// Call platform publisher with no social account (account lookup via PostPlatforms).
	externalID, externalURL, err := h.deps.Publisher.PublishPost(ctx, &post, nil)
	if err != nil {
		log.Error("platform publish failed", zap.Error(err))
		return h.failPost(ctx, &post, err.Error())
	}

	// Mark as published.
	now := time.Now().UTC()
	if err := h.deps.DB.WithContext(ctx).Model(&post).Updates(map[string]interface{}{
		"status":       "published",
		"published_at": now,
		"external_id":  externalID,
		"external_url": externalURL,
		"failure_reason": "",
	}).Error; err != nil {
		return fmt.Errorf("publishPostHandler: set status published: %w", err)
	}

	log.Info("post published successfully",
		zap.String("external_id", externalID),
		zap.String("external_url", externalURL),
	)
	return nil
}

// failPost marks a post as failed and returns the original error wrapped so asynq
// can decide whether to retry.
func (h *PublishPostHandler) failPost(ctx context.Context, post *models.Post, reason string) error {
	retryCount := post.RetryCount + 1
	h.deps.DB.WithContext(ctx).Model(post).Updates(map[string]interface{}{
		"status":         "failed",
		"failure_reason": reason,
		"retry_count":    retryCount,
	})
	return fmt.Errorf("publishPostHandler: %s", reason)
}

// ─── AIGenerateHandler ────────────────────────────────────────────────────────

type AIGenerateHandler struct {
	deps WorkerDeps
}

func (h *AIGenerateHandler) ProcessTask(ctx context.Context, t *asynq.Task) error {
	var p AIGeneratePayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("aiGenerateHandler: unmarshal payload: %w", err)
	}

	log := h.deps.Logger.With(
		zap.String("job_id", p.JobID.String()),
		zap.String("job_type", string(p.JobType)),
	)
	log.Info("processing AI job")

	// Mark job as processing.
	if err := h.deps.DB.WithContext(ctx).Model(&models.AIJob{}).
		Where("id = ?", p.JobID).
		Updates(map[string]interface{}{"status": "processing"}).Error; err != nil {
		log.Warn("failed to mark AI job processing", zap.Error(err))
	}

	// Call the AI service.
	output, err := h.deps.AIService.ProcessJob(ctx, p)
	now := time.Now().UTC()
	if err != nil {
		log.Error("AI job failed", zap.Error(err))
		h.deps.DB.WithContext(ctx).Model(&models.AIJob{}).Where("id = ?", p.JobID).
			Updates(map[string]interface{}{
				"status":        "failed",
				"error_message": err.Error(),
				"completed_at":  now,
			})
		return fmt.Errorf("aiGenerateHandler: %w", err)
	}

	// Persist output.
	if err := h.deps.DB.WithContext(ctx).Model(&models.AIJob{}).Where("id = ?", p.JobID).
		Updates(map[string]interface{}{
			"status":       "completed",
			"output":       models.JSONMap(output),
			"completed_at": now,
		}).Error; err != nil {
		return fmt.Errorf("aiGenerateHandler: persist output: %w", err)
	}

	log.Info("AI job completed")
	return nil
}

// ─── RepurposeHandler ─────────────────────────────────────────────────────────

type RepurposeHandler struct {
	deps WorkerDeps
}

func (h *RepurposeHandler) ProcessTask(ctx context.Context, t *asynq.Task) error {
	var p RepurposeContentPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("repurposeHandler: unmarshal payload: %w", err)
	}

	log := h.deps.Logger.With(
		zap.String("job_id", p.JobID.String()),
		zap.String("source", string(p.Source)),
	)
	log.Info("processing repurpose job")

	// Mark job as processing.
	h.deps.DB.WithContext(ctx).Model(&models.AIJob{}).Where("id = ?", p.JobID).
		Updates(map[string]interface{}{"status": "processing"})

	output, err := h.deps.RepurposeService.ProcessRepurpose(ctx, p)
	now := time.Now().UTC()
	if err != nil {
		log.Error("repurpose job failed", zap.Error(err))
		h.deps.DB.WithContext(ctx).Model(&models.AIJob{}).Where("id = ?", p.JobID).
			Updates(map[string]interface{}{
				"status":        "failed",
				"error_message": err.Error(),
				"completed_at":  now,
			})
		return fmt.Errorf("repurposeHandler: %w", err)
	}

	if err := h.deps.DB.WithContext(ctx).Model(&models.AIJob{}).Where("id = ?", p.JobID).
		Updates(map[string]interface{}{
			"status":       "completed",
			"output":       models.JSONMap(output),
			"completed_at": now,
		}).Error; err != nil {
		return fmt.Errorf("repurposeHandler: persist output: %w", err)
	}

	log.Info("repurpose job completed")
	return nil
}

// ─── RefreshTokensHandler ─────────────────────────────────────────────────────

type RefreshTokensHandler struct {
	deps WorkerDeps
}

func (h *RefreshTokensHandler) ProcessTask(ctx context.Context, _ *asynq.Task) error {
	log := h.deps.Logger.With(zap.String("handler", "RefreshTokens"))
	log.Info("starting token refresh sweep")

	// Find accounts whose tokens expire within the next 24 hours.
	horizon := time.Now().UTC().Add(24 * time.Hour)
	var accounts []models.SocialAccount
	if err := h.deps.DB.WithContext(ctx).
		Where("token_expires_at <= ? AND is_active = true AND refresh_token != ''", horizon).
		Find(&accounts).Error; err != nil {
		return fmt.Errorf("refreshTokensHandler: query accounts: %w", err)
	}

	log.Info("accounts needing token refresh", zap.Int("count", len(accounts)))
	var refreshErrors int
	for i := range accounts {
		acc := &accounts[i]
		if err := h.deps.OAuthRefresher.RefreshToken(ctx, acc); err != nil {
			log.Error("failed to refresh token",
				zap.String("account_id", acc.ID.String()),
				zap.String("platform", string(acc.Platform)),
				zap.Error(err),
			)
			refreshErrors++
			// Mark account as needing re-auth.
			h.deps.DB.WithContext(ctx).Model(acc).Updates(map[string]interface{}{"is_active": false})
			continue
		}
		// Persist refreshed tokens.
		if err := h.deps.DB.WithContext(ctx).Save(acc).Error; err != nil {
			log.Error("failed to save refreshed token",
				zap.String("account_id", acc.ID.String()),
				zap.Error(err),
			)
		}
	}

	if refreshErrors > 0 {
		log.Warn("token refresh sweep completed with errors",
			zap.Int("errors", refreshErrors),
			zap.Int("total", len(accounts)),
		)
	} else {
		log.Info("token refresh sweep completed successfully", zap.Int("total", len(accounts)))
	}
	return nil
}

// ─── NewServer ────────────────────────────────────────────────────────────────

// ServerConfig holds asynq server tuning parameters.
type ServerConfig struct {
	Concurrency int
	// Queues maps queue name → priority weight.
	Queues map[string]int
}

// DefaultServerConfig returns sensible production defaults.
func DefaultServerConfig() ServerConfig {
	return ServerConfig{
		Concurrency: 20,
		Queues: map[string]int{
			"critical": 6,
			"default":  3,
			"low":      1,
		},
	}
}

// NewServer creates an asynq.Server wired to Redis and registers all task
// handlers. It does NOT call Run(); the caller is responsible for lifecycle.
func NewServer(redisClient *redis.Client, deps WorkerDeps, cfg ServerConfig) (*asynq.Server, *asynq.ServeMux) {
	srv := asynq.NewServer(
		asynq.RedisClientOpt{
			Addr:      redisClient.Options().Addr,
			Password:  redisClient.Options().Password,
			DB:        redisClient.Options().DB,
			TLSConfig: redisClient.Options().TLSConfig, // required for rediss:// (Upstash)
		},
		asynq.Config{
			Concurrency: cfg.Concurrency,
			Queues:      cfg.Queues,
			ErrorHandler: asynq.ErrorHandlerFunc(func(ctx context.Context, task *asynq.Task, err error) {
				deps.Logger.Error("task failed permanently",
					zap.String("type", task.Type()),
					zap.Error(err),
				)
			}),
			Logger: newAsynqZapLogger(deps.Logger),
		},
	)

	mux := asynq.NewServeMux()

	publishHandler := &PublishPostHandler{deps: deps}
	aiGenHandler := &AIGenerateHandler{deps: deps}
	repurposeHandler := &RepurposeHandler{deps: deps}
	refreshHandler := &RefreshTokensHandler{deps: deps}

	mux.HandleFunc(TypePublishPost, publishHandler.ProcessTask)
	mux.HandleFunc(TypeAIGenerate, aiGenHandler.ProcessTask)
	mux.HandleFunc(TypeRepurposeContent, repurposeHandler.ProcessTask)
	mux.HandleFunc(TypeRefreshTokens, refreshHandler.ProcessTask)

	return srv, mux
}

// ─── asynq → zap logger adapter ──────────────────────────────────────────────

type asynqZapLogger struct {
	log *zap.Logger
}

func newAsynqZapLogger(log *zap.Logger) *asynqZapLogger {
	return &asynqZapLogger{log: log.With(zap.String("component", "asynq"))}
}

func (l *asynqZapLogger) Debug(args ...interface{}) {
	l.log.Sugar().Debug(args...)
}
func (l *asynqZapLogger) Info(args ...interface{}) {
	l.log.Sugar().Info(args...)
}
func (l *asynqZapLogger) Warn(args ...interface{}) {
	l.log.Sugar().Warn(args...)
}
func (l *asynqZapLogger) Error(args ...interface{}) {
	l.log.Sugar().Error(args...)
}
func (l *asynqZapLogger) Fatal(args ...interface{}) {
	l.log.Sugar().Fatal(args...)
}
