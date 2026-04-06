package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/socialforge/backend/internal/models"
	"gorm.io/gorm"
)

// ─── Value types returned by analytics queries ───────────────────────────────

// DayCount holds a post count for a single calendar day.
type DayCount struct {
	Date  time.Time `json:"date"`
	Count int64     `json:"count"`
}

// PlatformEngagement holds platform-level engagement metrics.
type PlatformEngagement struct {
	Platform      string  `json:"platform"`
	Posts         int64   `json:"posts"`
	AvgEngagement float64 `json:"avg_engagement"`
}

// ContentTypeCount holds a content type and its count.
type ContentTypeCount struct {
	PostType string `json:"post_type"`
	Count    int64  `json:"count"`
}

// ─── AnalyticsRepository ─────────────────────────────────────────────────────

// AnalyticsRepository defines the data-access operations needed by the
// analytics service. Implementations live in the database layer and use GORM.
type AnalyticsRepository interface {
	// GetPostCountByDay returns a daily breakdown of post counts within [from, to].
	GetPostCountByDay(ctx context.Context, workspaceID uuid.UUID, from, to time.Time) ([]DayCount, error)

	// GetEngagementByPlatform returns per-platform post counts and publish stats.
	GetEngagementByPlatform(ctx context.Context, workspaceID uuid.UUID, from, to time.Time) ([]PlatformEngagement, error)

	// GetContentTypeBreakdown returns how many posts belong to each content type.
	GetContentTypeBreakdown(ctx context.Context, workspaceID uuid.UUID, from, to time.Time) ([]ContentTypeCount, error)

	// GetTopPosts returns the most recently published posts for a workspace,
	// limited to the given count.
	GetTopPosts(ctx context.Context, workspaceID uuid.UUID, from, to time.Time, limit int) ([]*models.Post, error)

	// GetPostsThisMonth returns the number of published posts created since the
	// start of the current UTC calendar month.
	GetPostsThisMonth(ctx context.Context, workspaceID uuid.UUID) (int64, error)
}

// ─── analyticsRepo ───────────────────────────────────────────────────────────

// analyticsRepo is the GORM-backed implementation of AnalyticsRepository.
type analyticsRepo struct {
	db *gorm.DB
}

// NewAnalyticsRepo constructs an analyticsRepo backed by the given *gorm.DB.
func NewAnalyticsRepo(db *gorm.DB) AnalyticsRepository {
	return &analyticsRepo{db: db}
}

// dayCountRow is the raw scan target for GetPostCountByDay.
type dayCountRow struct {
	Day   time.Time
	Count int64
}

// GetPostCountByDay returns the number of published posts per calendar day for
// the given workspace within the inclusive [from, to] date range.
// Results are ordered chronologically.
func (r *analyticsRepo) GetPostCountByDay(ctx context.Context, workspaceID uuid.UUID, from, to time.Time) ([]DayCount, error) {
	var rows []dayCountRow
	result := r.db.WithContext(ctx).
		Model(&models.Post{}).
		Select("DATE(published_at) AS day, COUNT(*) AS count").
		Where(
			"workspace_id = ? AND status = ? AND published_at >= ? AND published_at <= ?",
			workspaceID, models.PostStatusPublished, from, to,
		).
		Group("DATE(published_at)").
		Order("day ASC").
		Scan(&rows)
	if result.Error != nil {
		return nil, result.Error
	}

	out := make([]DayCount, len(rows))
	for i, row := range rows {
		out[i] = DayCount{Date: row.Day, Count: row.Count}
	}
	return out, nil
}

// platformEngagementRow is the raw scan target for GetEngagementByPlatform.
type platformEngagementRow struct {
	Platform      string
	Posts         int64
	AvgEngagement float64
}

// GetEngagementByPlatform returns per-platform post counts from the
// post_platforms table for posts in the given workspace and date range.
// AvgEngagement is the ratio of published posts to total posts attempted on
// each platform; real engagement signals (likes, comments) would be stored
// separately once fetched from platform APIs.
func (r *analyticsRepo) GetEngagementByPlatform(ctx context.Context, workspaceID uuid.UUID, from, to time.Time) ([]PlatformEngagement, error) {
	var rows []platformEngagementRow
	result := r.db.WithContext(ctx).
		Table("post_platforms pp").
		Select(
			"pp.platform, " +
				"COUNT(*) AS posts, " +
				"COALESCE(AVG(CASE WHEN pp.status = 'published' THEN 1.0 ELSE 0.0 END), 0) AS avg_engagement",
		).
		Joins("JOIN posts p ON p.id = pp.post_id").
		Where(
			"p.workspace_id = ? AND p.created_at >= ? AND p.created_at <= ? AND p.deleted_at IS NULL",
			workspaceID, from, to,
		).
		Group("pp.platform").
		Order("posts DESC").
		Scan(&rows)
	if result.Error != nil {
		return nil, result.Error
	}

	out := make([]PlatformEngagement, len(rows))
	for i, row := range rows {
		out[i] = PlatformEngagement{
			Platform:      row.Platform,
			Posts:         row.Posts,
			AvgEngagement: row.AvgEngagement,
		}
	}
	return out, nil
}

// contentTypeCountRow is the raw scan target for GetContentTypeBreakdown.
type contentTypeCountRow struct {
	PostType string
	Count    int64
}

// GetContentTypeBreakdown returns a count of posts grouped by their type
// (text, image, video, carousel, etc.) for the given workspace and date range.
func (r *analyticsRepo) GetContentTypeBreakdown(ctx context.Context, workspaceID uuid.UUID, from, to time.Time) ([]ContentTypeCount, error) {
	var rows []contentTypeCountRow
	result := r.db.WithContext(ctx).
		Model(&models.Post{}).
		Select("type AS post_type, COUNT(*) AS count").
		Where(
			"workspace_id = ? AND created_at >= ? AND created_at <= ?",
			workspaceID, from, to,
		).
		Group("type").
		Order("count DESC").
		Scan(&rows)
	if result.Error != nil {
		return nil, result.Error
	}

	out := make([]ContentTypeCount, len(rows))
	for i, row := range rows {
		out[i] = ContentTypeCount{PostType: row.PostType, Count: row.Count}
	}
	return out, nil
}

// GetTopPosts returns the top posts for the given workspace ordered by
// published_at descending (most recently published first) within the date
// range, up to the provided limit. When real engagement signals (likes,
// shares) are ingested from platform APIs they can replace this ordering.
func (r *analyticsRepo) GetTopPosts(ctx context.Context, workspaceID uuid.UUID, from, to time.Time, limit int) ([]*models.Post, error) {
	if limit < 1 {
		limit = 10
	}
	var posts []*models.Post
	result := r.db.WithContext(ctx).
		Where(
			"workspace_id = ? AND status = ? AND published_at >= ? AND published_at <= ?",
			workspaceID, models.PostStatusPublished, from, to,
		).
		Preload("PostPlatforms").
		Order("published_at DESC").
		Limit(limit).
		Find(&posts)
	if result.Error != nil {
		return nil, result.Error
	}
	return posts, nil
}

// GetPostsThisMonth returns the count of posts with status 'published' for the
// given workspace in the current calendar month (UTC).
func (r *analyticsRepo) GetPostsThisMonth(ctx context.Context, workspaceID uuid.UUID) (int64, error) {
	now := time.Now().UTC()
	firstDay := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)

	var count int64
	result := r.db.WithContext(ctx).
		Model(&models.Post{}).
		Where(
			"workspace_id = ? AND status = ? AND published_at >= ?",
			workspaceID, models.PostStatusPublished, firstDay,
		).
		Count(&count)
	if result.Error != nil {
		return 0, result.Error
	}
	return count, nil
}
