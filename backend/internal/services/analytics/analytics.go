// Package analytics provides aggregated social-media post analytics for a
// SocialForge workspace, including dashboard stats and flexible date ranges.
package analytics

import (
	"context"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"golang.org/x/sync/errgroup"

	"github.com/socialforge/backend/internal/models"
	"github.com/socialforge/backend/internal/repository"
)

// ─── Service ──────────────────────────────────────────────────────────────────

// Service aggregates analytics data from the repository layer.
type Service struct {
	repo repository.AnalyticsRepository
	log  *zap.Logger
}

// NewService returns a ready-to-use analytics Service.
func NewService(repo repository.AnalyticsRepository, log *zap.Logger) *Service {
	return &Service{repo: repo, log: log.Named("analytics")}
}

// ─── DashboardStats ───────────────────────────────────────────────────────────

// DashboardStats is the composite analytics payload returned to the frontend.
type DashboardStats struct {
	TotalPosts           int64                           `json:"total_posts"`
	PostsByDay           []repository.DayCount           `json:"posts_by_day"`
	EngagementByPlatform []repository.PlatformEngagement `json:"engagement_by_platform"`
	ContentTypeBreakdown []repository.ContentTypeCount   `json:"content_type_breakdown"`
	TopPosts             []*models.Post                  `json:"top_posts"`
	PostsThisMonth       int64                           `json:"posts_this_month"`
	BestPlatform         string                          `json:"best_platform"` // platform with most posts
}

// ─── GetDashboardStats ────────────────────────────────────────────────────────

// GetDashboardStats fetches all analytics data in parallel and assembles a
// DashboardStats response. All repository calls run concurrently; the first
// error cancels the group and is returned immediately.
func (s *Service) GetDashboardStats(
	ctx context.Context,
	workspaceID uuid.UUID,
	from, to time.Time,
) (*DashboardStats, error) {
	var (
		postsByDay           []repository.DayCount
		engagementByPlatform []repository.PlatformEngagement
		contentTypeBreakdown []repository.ContentTypeCount
		topPosts             []*models.Post
		postsThisMonth       int64
	)

	eg, egCtx := errgroup.WithContext(ctx)

	eg.Go(func() error {
		var err error
		postsByDay, err = s.repo.GetPostCountByDay(egCtx, workspaceID, from, to)
		if err != nil {
			s.log.Error("analytics: GetPostCountByDay", zap.Error(err))
		}
		return err
	})

	eg.Go(func() error {
		var err error
		engagementByPlatform, err = s.repo.GetEngagementByPlatform(egCtx, workspaceID, from, to)
		if err != nil {
			s.log.Error("analytics: GetEngagementByPlatform", zap.Error(err))
		}
		return err
	})

	eg.Go(func() error {
		var err error
		contentTypeBreakdown, err = s.repo.GetContentTypeBreakdown(egCtx, workspaceID, from, to)
		if err != nil {
			s.log.Error("analytics: GetContentTypeBreakdown", zap.Error(err))
		}
		return err
	})

	eg.Go(func() error {
		var err error
		topPosts, err = s.repo.GetTopPosts(egCtx, workspaceID, from, to, 10)
		if err != nil {
			s.log.Error("analytics: GetTopPosts", zap.Error(err))
		}
		return err
	})

	eg.Go(func() error {
		var err error
		postsThisMonth, err = s.repo.GetPostsThisMonth(egCtx, workspaceID)
		if err != nil {
			s.log.Error("analytics: GetPostsThisMonth", zap.Error(err))
		}
		return err
	})

	if err := eg.Wait(); err != nil {
		return nil, err
	}

	// Derive total posts from the day-count series for the period.
	var totalPosts int64
	for _, dc := range postsByDay {
		totalPosts += dc.Count
	}

	bestPlatform := bestPlatformFromEngagement(engagementByPlatform)

	return &DashboardStats{
		TotalPosts:           totalPosts,
		PostsByDay:           postsByDay,
		EngagementByPlatform: engagementByPlatform,
		ContentTypeBreakdown: contentTypeBreakdown,
		TopPosts:             topPosts,
		PostsThisMonth:       postsThisMonth,
		BestPlatform:         bestPlatform,
	}, nil
}

// ─── GetTopPosts ──────────────────────────────────────────────────────────────

// GetTopPosts returns the top-performing posts in the given period.
func (s *Service) GetTopPosts(
	ctx context.Context,
	workspaceID uuid.UUID,
	from, to time.Time,
	limit int,
) ([]*models.Post, error) {
	if limit <= 0 {
		limit = 10
	}
	return s.repo.GetTopPosts(ctx, workspaceID, from, to, limit)
}

// ─── GetDateRange ─────────────────────────────────────────────────────────────

// GetDateRange converts a named period string ("7d", "30d", "90d") into
// concrete UTC from/to timestamps. Unrecognised periods default to 30 days.
func (s *Service) GetDateRange(period string) (from, to time.Time) {
	to = time.Now().UTC()

	switch period {
	case "7d":
		from = to.AddDate(0, 0, -7)
	case "90d":
		from = to.AddDate(0, 0, -90)
	default:
		// "30d" and anything else → 30 days
		from = to.AddDate(0, 0, -30)
	}

	return from, to
}

// ─── helpers ──────────────────────────────────────────────────────────────────

// bestPlatformFromEngagement returns the platform name with the highest post
// count. Returns an empty string if the slice is empty.
func bestPlatformFromEngagement(platforms []repository.PlatformEngagement) string {
	if len(platforms) == 0 {
		return ""
	}

	best := platforms[0]
	for _, p := range platforms[1:] {
		if p.Posts > best.Posts {
			best = p
		}
	}

	return best.Platform
}
