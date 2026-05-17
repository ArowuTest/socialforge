// Package handlers — Workspace insights.
//
// Surfaces data-driven scheduling recommendations to the compose page. The
// underlying data lives on post_platforms (per-platform engagement metrics
// populated ~25h after publish by the metrics-sync worker).
//
// Endpoints are read-only and require workspace membership (no specific role
// gate — even viewers benefit from "best time" guidance).
package handlers

import (
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// InsightsHandler holds dependencies for insights endpoints.
type InsightsHandler struct {
	db  *gorm.DB
	log *zap.Logger
}

func NewInsightsHandler(db *gorm.DB, log *zap.Logger) *InsightsHandler {
	return &InsightsHandler{db: db, log: log.Named("insights")}
}

// BestTimesResponse is the shape returned by GetBestTimes. Each recommendation
// is "post at <hour> on <day> for ~Nx avg engagement". The window field tells
// the frontend whether to mention "based on last 90 days" or similar.
type bestTimeSlot struct {
	DayOfWeek   int     `json:"day_of_week"`    // 0=Sun..6=Sat
	HourOfDay   int     `json:"hour_of_day"`    // 0..23 (UTC)
	AvgEngage   float64 `json:"avg_engagement"` // avg likes+comments+shares for this slot
	SampleSize  int     `json:"sample_size"`    // number of posts in this slot
	Multiplier  float64 `json:"multiplier"`     // avg_engagement / workspace_overall_avg
}

// GetBestTimes returns the workspace's best posting times based on historical
// engagement data. Filters by platform when ?platform= is provided. Falls back
// to an empty list + explanation when there's not enough data yet.
//
// GET /api/v1/workspaces/:wid/insights/best-times?platform=instagram&days=90
func (h *InsightsHandler) GetBestTimes(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	platform := strings.ToLower(strings.TrimSpace(c.Query("platform")))
	days := c.QueryInt("days", 90)
	if days < 7 {
		days = 7
	}
	if days > 365 {
		days = 365
	}
	since := time.Now().UTC().AddDate(0, 0, -days)

	// Compute per-slot engagement averages. Slot = (day_of_week, hour_of_day)
	// in UTC. We require sample_size >= 2 to avoid one-shot outliers driving
	// recommendations. Limit to top 5 slots by engagement.
	type row struct {
		DayOfWeek  int     `json:"day_of_week"`
		HourOfDay  int     `json:"hour_of_day"`
		AvgEngage  float64 `json:"avg_engagement"`
		SampleSize int     `json:"sample_size"`
	}
	var rows []row

	query := `
		SELECT
		  EXTRACT(DOW  FROM p.published_at)::INT AS day_of_week,
		  EXTRACT(HOUR FROM p.published_at)::INT AS hour_of_day,
		  AVG(pp.likes + pp.comments + pp.shares)::FLOAT AS avg_engage,
		  COUNT(*)::INT                                   AS sample_size
		FROM posts p
		JOIN post_platforms pp ON pp.post_id = p.id
		WHERE p.workspace_id = ?
		  AND p.status = 'published'
		  AND p.published_at >= ?
		  AND p.deleted_at IS NULL
		  AND pp.metrics_fetched_at IS NOT NULL`
	args := []any{wid, since}
	if platform != "" {
		query += ` AND pp.platform = ?`
		args = append(args, platform)
	}
	query += `
		GROUP BY day_of_week, hour_of_day
		HAVING COUNT(*) >= 2
		ORDER BY avg_engage DESC
		LIMIT 5`

	if err := h.db.WithContext(c.Context()).Raw(query, args...).Scan(&rows).Error; err != nil {
		h.log.Error("GetBestTimes: query", zap.Error(err))
		return internalError(c, "failed to compute best times")
	}

	// Compute workspace-wide average for the same window so we can report
	// each slot's multiplier ("3.2x average").
	var overallAvg float64
	overallQ := `
		SELECT COALESCE(AVG(pp.likes + pp.comments + pp.shares), 0)::FLOAT
		FROM posts p
		JOIN post_platforms pp ON pp.post_id = p.id
		WHERE p.workspace_id = ?
		  AND p.status = 'published'
		  AND p.published_at >= ?
		  AND p.deleted_at IS NULL
		  AND pp.metrics_fetched_at IS NOT NULL`
	overallArgs := []any{wid, since}
	if platform != "" {
		overallQ += ` AND pp.platform = ?`
		overallArgs = append(overallArgs, platform)
	}
	if err := h.db.WithContext(c.Context()).Raw(overallQ, overallArgs...).Scan(&overallAvg).Error; err != nil {
		h.log.Warn("GetBestTimes: overall avg failed (continuing)", zap.Error(err))
	}

	slots := make([]bestTimeSlot, 0, len(rows))
	for _, r := range rows {
		mult := 0.0
		if overallAvg > 0 {
			mult = r.AvgEngage / overallAvg
		}
		slots = append(slots, bestTimeSlot{
			DayOfWeek:  r.DayOfWeek,
			HourOfDay:  r.HourOfDay,
			AvgEngage:  r.AvgEngage,
			SampleSize: r.SampleSize,
			Multiplier: mult,
		})
	}

	// Build a useful response shape so the frontend doesn't have to compute
	// fallback messaging.
	note := ""
	if len(slots) == 0 {
		note = "Not enough engagement data yet to recommend times. Publish a few posts and check back in ~24h once metrics have synced."
	}

	return c.JSON(fiber.Map{"data": fiber.Map{
		"slots":            slots,
		"window_days":      days,
		"platform":         platform, // empty = all platforms
		"overall_avg_engagement": overallAvg,
		"note":             note,
	}})
}
