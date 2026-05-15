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
	Likes         int64   `json:"likes"`
	Comments      int64   `json:"comments"`
	Shares        int64   `json:"shares"`
	Impressions   int64   `json:"impressions"`
	Reach         int64   `json:"reach"`
	// Engagement is total interactions (likes+comments+shares) for the platform.
	Engagement    int64   `json:"engagement"`
	// EngagementRate is engagement / reach * 100, or 0 when reach is unknown.
	EngagementRate float64 `json:"engagement_rate"`
}

// ContentTypeCount holds a content type and its count.
type ContentTypeCount struct {
	PostType string `json:"post_type"`
	Count    int64  `json:"count"`
}

// HashtagPerformance holds aggregated metrics for a single hashtag across the
// workspace's published posts in the period. AvgEngagement = Engagement /
// PostCount, normalised so a tag used once with high reach doesn't
// over-dominate when sorted by raw totals.
type HashtagPerformance struct {
	Hashtag       string  `json:"hashtag"`
	PostCount     int64   `json:"post_count"`
	Engagement    int64   `json:"engagement"`
	Reach         int64   `json:"reach"`
	Impressions   int64   `json:"impressions"`
	AvgEngagement float64 `json:"avg_engagement"`
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

	// GetWorkspaceMetricTotals returns aggregate reach and engagement totals
	// (likes+comments+shares) across all published post_platforms in the period.
	GetWorkspaceMetricTotals(ctx context.Context, workspaceID uuid.UUID, from, to time.Time) (reach, engagement int64, err error)

	// GetHashtagPerformance returns aggregated metrics per hashtag for posts
	// published in the period, ordered by total engagement descending. Limit
	// caps the number of returned rows (defaults to 20).
	GetHashtagPerformance(ctx context.Context, workspaceID uuid.UUID, from, to time.Time, limit int) ([]HashtagPerformance, error)
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
	Platform    string
	Posts       int64
	Likes       int64
	Comments    int64
	Shares      int64
	Impressions int64
	Reach       int64
}

// GetEngagementByPlatform returns per-platform post counts and real engagement
// metrics aggregated from the post_platforms metrics columns. Metrics are only
// non-zero once the background metrics-sync job has run (~25h after publishing).
func (r *analyticsRepo) GetEngagementByPlatform(ctx context.Context, workspaceID uuid.UUID, from, to time.Time) ([]PlatformEngagement, error) {
	var rows []platformEngagementRow
	result := r.db.WithContext(ctx).
		Table("post_platforms pp").
		Select(
			"pp.platform, " +
				"COUNT(*) AS posts, " +
				"COALESCE(SUM(pp.likes), 0) AS likes, " +
				"COALESCE(SUM(pp.comments), 0) AS comments, " +
				"COALESCE(SUM(pp.shares), 0) AS shares, " +
				"COALESCE(SUM(pp.impressions), 0) AS impressions, " +
				"COALESCE(SUM(pp.reach), 0) AS reach",
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
		engagement := row.Likes + row.Comments + row.Shares
		var engRate float64
		if row.Reach > 0 {
			engRate = float64(engagement) / float64(row.Reach) * 100
		}
		out[i] = PlatformEngagement{
			Platform:       row.Platform,
			Posts:          row.Posts,
			Likes:          row.Likes,
			Comments:       row.Comments,
			Shares:         row.Shares,
			Impressions:    row.Impressions,
			Reach:          row.Reach,
			Engagement:     engagement,
			EngagementRate: engRate,
		}
	}
	return out, nil
}

// hashtagRow is the raw scan target for GetHashtagPerformance.
type hashtagRow struct {
	Hashtag     string
	PostCount   int64
	Engagement  int64
	Reach       int64
	Impressions int64
}

// GetHashtagPerformance unnests each post's hashtags JSON array and aggregates
// engagement/reach metrics per tag. Joins through post_platforms so we count
// the per-platform metrics that the metrics-sync job populates ~25h after
// publish. Drops the # prefix when present so "#travel" and "travel" merge.
func (r *analyticsRepo) GetHashtagPerformance(
	ctx context.Context,
	workspaceID uuid.UUID,
	from, to time.Time,
	limit int,
) ([]HashtagPerformance, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	var rows []hashtagRow
	// jsonb_array_elements_text safely unnests the JSON text array stored in
	// posts.hashtags. The CROSS JOIN LATERAL guarantees we get one row per
	// (post, platform, hashtag) tuple, which is exactly what we want for
	// per-tag aggregation. We strip the optional leading '#' to dedupe
	// "#travel" and "travel" into the same bucket.
	err := r.db.WithContext(ctx).Raw(
		`SELECT
		    LOWER(REGEXP_REPLACE(tag.value, '^#', '')) AS hashtag,
		    COUNT(DISTINCT p.id)                       AS post_count,
		    COALESCE(SUM(pp.likes), 0)
		    + COALESCE(SUM(pp.comments), 0)
		    + COALESCE(SUM(pp.shares), 0)              AS engagement,
		    COALESCE(SUM(pp.reach), 0)                 AS reach,
		    COALESCE(SUM(pp.impressions), 0)           AS impressions
		 FROM posts p
		 JOIN post_platforms pp ON pp.post_id = p.id
		 CROSS JOIN LATERAL jsonb_array_elements_text(
		    NULLIF(p.hashtags, '')::jsonb
		 ) AS tag(value)
		 WHERE p.workspace_id = ?
		   AND p.deleted_at IS NULL
		   AND p.published_at IS NOT NULL
		   AND p.published_at >= ?
		   AND p.published_at <= ?
		   AND p.hashtags IS NOT NULL
		   AND p.hashtags NOT IN ('', '[]')
		   AND tag.value <> ''
		 GROUP BY LOWER(REGEXP_REPLACE(tag.value, '^#', ''))
		 ORDER BY engagement DESC, reach DESC
		 LIMIT ?`,
		workspaceID, from, to, limit,
	).Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	out := make([]HashtagPerformance, len(rows))
	for i, row := range rows {
		var avg float64
		if row.PostCount > 0 {
			avg = float64(row.Engagement) / float64(row.PostCount)
		}
		out[i] = HashtagPerformance{
			Hashtag:       "#" + row.Hashtag, // re-add the # for display consistency
			PostCount:     row.PostCount,
			Engagement:    row.Engagement,
			Reach:         row.Reach,
			Impressions:   row.Impressions,
			AvgEngagement: avg,
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

// GetTopPosts returns the top posts for the given workspace ordered by total
// engagement (likes+comments+shares summed across platforms) descending, then
// by impressions descending as a tiebreaker. Posts with no metrics yet are
// ordered at the bottom by published_at DESC.
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
		// Subquery-based ordering: sum engagement from post_platforms for this post
		Order(
			"(SELECT COALESCE(SUM(pp.likes + pp.comments + pp.shares), 0) " +
				"FROM post_platforms pp WHERE pp.post_id = posts.id) DESC, " +
				"(SELECT COALESCE(SUM(pp.impressions), 0) " +
				"FROM post_platforms pp WHERE pp.post_id = posts.id) DESC, " +
				"published_at DESC",
		).
		Limit(limit).
		Find(&posts)
	if result.Error != nil {
		return nil, result.Error
	}
	return posts, nil
}

// GetWorkspaceMetricTotals returns aggregate totals for reach and engagement
// across all published posts in the workspace for the given date range.
func (r *analyticsRepo) GetWorkspaceMetricTotals(ctx context.Context, workspaceID uuid.UUID, from, to time.Time) (reach, engagement int64, err error) {
	type totalsRow struct {
		TotalReach      int64
		TotalEngagement int64
	}
	var row totalsRow
	result := r.db.WithContext(ctx).
		Table("post_platforms pp").
		Select(
			"COALESCE(SUM(pp.reach), 0) AS total_reach, " +
				"COALESCE(SUM(pp.likes + pp.comments + pp.shares), 0) AS total_engagement",
		).
		Joins("JOIN posts p ON p.id = pp.post_id").
		Where(
			"p.workspace_id = ? AND pp.status = ? AND pp.published_at >= ? AND pp.published_at <= ? AND p.deleted_at IS NULL",
			workspaceID, models.PostStatusPublished, from, to,
		).
		Scan(&row)
	if result.Error != nil {
		return 0, 0, result.Error
	}
	return row.TotalReach, row.TotalEngagement, nil
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
