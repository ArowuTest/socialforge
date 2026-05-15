package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"

	analyticssvc "github.com/socialforge/backend/internal/services/analytics"
)

// AnalyticsHandler handles workspace analytics endpoints.
type AnalyticsHandler struct {
	analytics *analyticssvc.Service
	log       *zap.Logger
}

// NewAnalyticsHandler creates an AnalyticsHandler backed by the analytics service.
func NewAnalyticsHandler(analytics *analyticssvc.Service, log *zap.Logger) *AnalyticsHandler {
	return &AnalyticsHandler{
		analytics: analytics,
		log:       log.Named("analytics_handler"),
	}
}

// GetDashboard returns aggregated analytics stats for a workspace, including
// a "previous period" snapshot so the UI can show period-over-period deltas
// ("+24% vs last week"-style indicators).
//
// GET /api/v1/workspaces/:wid/analytics?period=7d|30d|90d
func (h *AnalyticsHandler) GetDashboard(c *fiber.Ctx) error {
	widStr := c.Params("workspaceId")
	wid, err := uuid.Parse(widStr)
	if err != nil {
		return badRequest(c, "invalid workspace id", "INVALID_WORKSPACE_ID")
	}

	period := c.Query("period", "30d")
	from, to := h.analytics.GetDateRange(period)

	stats, err := h.analytics.GetDashboardStats(c.Context(), wid, from, to)
	if err != nil {
		h.log.Error("GetDashboard: analytics.GetDashboardStats",
			zap.String("workspace_id", widStr),
			zap.String("period", period),
			zap.Error(err),
		)
		return internalError(c, "failed to load analytics")
	}

	// Previous period of the same length, immediately before `from`.
	periodLen := to.Sub(from)
	prevFrom := from.Add(-periodLen)
	prevTo := from
	prevStats, prevErr := h.analytics.GetDashboardStats(c.Context(), wid, prevFrom, prevTo)
	if prevErr != nil {
		// Previous period is a best-effort enrichment — never fail the request
		// if the comparison can't be computed.
		h.log.Warn("GetDashboard: previous period failed", zap.Error(prevErr))
	}

	return c.JSON(fiber.Map{
		"data": stats,
		"meta": fiber.Map{
			"period":          period,
			"current_from":    from,
			"current_to":      to,
			"previous_from":   prevFrom,
			"previous_to":     prevTo,
			"previous":        prevStats, // may be nil on error
		},
	})
}

// GetHashtagPerformance returns the top hashtags by engagement for a workspace.
// GET /api/v1/workspaces/:workspaceId/analytics/hashtags?period=30d&limit=20
//
// Powers the Analytics page's "What's working" panel and feeds the Compose
// AI hashtag suggestor with tags the user's own audience responds to.
func (h *AnalyticsHandler) GetHashtagPerformance(c *fiber.Ctx) error {
	widStr := c.Params("workspaceId")
	wid, err := uuid.Parse(widStr)
	if err != nil {
		return badRequest(c, "invalid workspace id", "INVALID_WORKSPACE_ID")
	}

	period := c.Query("period", "30d")
	limit := c.QueryInt("limit", 20)
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	from, to := h.analytics.GetDateRange(period)

	rows, err := h.analytics.GetHashtagPerformance(c.Context(), wid, from, to, limit)
	if err != nil {
		h.log.Error("GetHashtagPerformance: analytics.GetHashtagPerformance",
			zap.String("workspace_id", widStr),
			zap.String("period", period),
			zap.Error(err),
		)
		return internalError(c, "failed to load hashtag performance")
	}

	return c.JSON(fiber.Map{
		"data": rows,
		"meta": fiber.Map{
			"period": period,
			"from":   from,
			"to":     to,
			"limit":  limit,
		},
	})
}

// GetTopPosts returns the top-performing posts for a workspace in a date range.
// GET /api/v1/workspaces/:workspaceId/analytics/top-posts?startDate=...&endDate=...&limit=10
func (h *AnalyticsHandler) GetTopPosts(c *fiber.Ctx) error {
	widStr := c.Params("workspaceId")
	wid, err := uuid.Parse(widStr)
	if err != nil {
		return badRequest(c, "invalid workspace id", "INVALID_WORKSPACE_ID")
	}

	limit := c.QueryInt("limit", 10)
	if limit <= 0 || limit > 100 {
		limit = 10
	}

	var from, to time.Time
	startStr := c.Query("startDate")
	endStr := c.Query("endDate")
	if startStr != "" && endStr != "" {
		if fs, err1 := time.Parse(time.RFC3339, startStr); err1 == nil {
			from = fs
		} else if fs, err1 := time.Parse("2006-01-02", startStr); err1 == nil {
			from = fs
		}
		if ts, err1 := time.Parse(time.RFC3339, endStr); err1 == nil {
			to = ts
		} else if ts, err1 := time.Parse("2006-01-02", endStr); err1 == nil {
			to = ts
		}
	}
	if from.IsZero() || to.IsZero() {
		from, to = h.analytics.GetDateRange(c.Query("period", "30d"))
	}

	posts, err := h.analytics.GetTopPosts(c.Context(), wid, from, to, limit)
	if err != nil {
		h.log.Error("GetTopPosts: analytics.GetTopPosts",
			zap.String("workspace_id", widStr),
			zap.Error(err),
		)
		return internalError(c, "failed to load top posts")
	}

	return c.JSON(fiber.Map{"data": posts})
}
