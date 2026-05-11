package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/hibiken/asynq"
	"go.uber.org/zap"

	"github.com/socialforge/backend/internal/models"
)

// ─── MetricsFetcher interface ─────────────────────────────────────────────────

// MetricsFetcher is implemented by platform clients that support fetching
// engagement metrics for a published post.
type MetricsFetcher interface {
	// FetchMetrics returns engagement metrics for the given platform post ID.
	// account provides the decrypted access token needed for the API call.
	FetchMetrics(ctx context.Context, account *models.SocialAccount, platformPostID string) (*models.PlatformMetrics, error)
}

// ─── MetricsSyncHandler ───────────────────────────────────────────────────────

// MetricsSyncHandler handles the TypeSyncPostMetrics task. For each
// PostPlatform record that belongs to the post, it calls the corresponding
// platform's FetchMetrics method (if implemented) and stores the result.
type MetricsSyncHandler struct {
	deps     WorkerDeps
	fetchers map[string]MetricsFetcher // platform name → fetcher
}

// NewMetricsSyncHandler creates a handler with the given platform fetchers.
// Platforms without a fetcher implementation gracefully skip metrics fetching.
func NewMetricsSyncHandler(deps WorkerDeps, fetchers map[string]MetricsFetcher) *MetricsSyncHandler {
	return &MetricsSyncHandler{deps: deps, fetchers: fetchers}
}

func (h *MetricsSyncHandler) ProcessTask(ctx context.Context, t *asynq.Task) error {
	var p SyncPostMetricsPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("metricsSyncHandler: unmarshal payload: %w", err)
	}

	log := h.deps.Logger.With(
		zap.String("post_id", p.PostID.String()),
		zap.String("workspace_id", p.WorkspaceID.String()),
	)
	log.Info("syncing post metrics")

	// Load PostPlatforms for the post.
	var postPlatforms []models.PostPlatform
	if err := h.deps.DB.WithContext(ctx).
		Where("post_id = ? AND status = ? AND platform_post_id != ''", p.PostID, models.PostStatusPublished).
		Find(&postPlatforms).Error; err != nil {
		return fmt.Errorf("metricsSyncHandler: fetch post_platforms: %w", err)
	}

	if len(postPlatforms) == 0 {
		log.Debug("no published post_platforms found, skipping metrics sync")
		return nil
	}

	for _, pp := range postPlatforms {
		fetcher, ok := h.fetchers[string(pp.Platform)]
		if !ok {
			log.Debug("no metrics fetcher for platform, skipping",
				zap.String("platform", string(pp.Platform)))
			continue
		}

		// Load the associated social account (needed for access token).
		var account models.SocialAccount
		if err := h.deps.DB.WithContext(ctx).
			First(&account, "id = ?", pp.SocialAccountID).Error; err != nil {
			log.Warn("metricsSyncHandler: load social account failed",
				zap.String("account_id", pp.SocialAccountID.String()),
				zap.Error(err),
			)
			continue
		}

		metrics, err := fetcher.FetchMetrics(ctx, &account, pp.PlatformPostID)
		if err != nil {
			log.Warn("metricsSyncHandler: FetchMetrics failed",
				zap.String("platform", string(pp.Platform)),
				zap.String("platform_post_id", pp.PlatformPostID),
				zap.Error(err),
			)
			continue
		}

		now := time.Now().UTC()
		updates := map[string]interface{}{
			"likes":              metrics.Likes,
			"comments":           metrics.Comments,
			"shares":             metrics.Shares,
			"impressions":        metrics.Impressions,
			"reach":              metrics.Reach,
			"saved":              metrics.Saved,
			"video_views":        metrics.VideoViews,
			"metrics_fetched_at": now,
		}
		if err := h.deps.DB.WithContext(ctx).Model(&models.PostPlatform{}).
			Where("id = ?", pp.ID).
			Updates(updates).Error; err != nil {
			log.Error("metricsSyncHandler: save metrics failed",
				zap.String("post_platform_id", pp.ID.String()),
				zap.Error(err),
			)
			continue
		}

		log.Info("metrics synced",
			zap.String("platform", string(pp.Platform)),
			zap.String("platform_post_id", pp.PlatformPostID),
			zap.Int("impressions", metrics.Impressions),
			zap.Int("reach", metrics.Reach),
			zap.Int("likes", metrics.Likes),
		)
	}

	return nil
}
