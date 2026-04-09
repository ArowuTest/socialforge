package handlers

import (
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

// GetDashboard returns aggregated analytics stats for a workspace.
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

	return c.JSON(fiber.Map{"data": stats})
}
