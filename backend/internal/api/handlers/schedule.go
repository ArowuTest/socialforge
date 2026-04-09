package handlers

import (
	"errors"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	scheduling "github.com/socialforge/backend/internal/services/scheduling"
)

// ScheduleHandler handles schedule slot and calendar endpoints.
type ScheduleHandler struct {
	db       *gorm.DB
	schedule *scheduling.Service
	log      *zap.Logger
}

// NewScheduleHandler creates a new ScheduleHandler.
func NewScheduleHandler(db *gorm.DB, schedule *scheduling.Service, log *zap.Logger) *ScheduleHandler {
	return &ScheduleHandler{db: db, schedule: schedule, log: log.Named("schedule_handler")}
}

// ── ListSlots ─────────────────────────────────────────────────────────────────

// ListSlots returns all schedule slots for the workspace.
// GET /api/v1/workspaces/:wid/schedule/slots
func (h *ScheduleHandler) ListSlots(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	platform := c.Query("platform")
	slots, err := h.schedule.ListScheduleSlots(wid, platform)
	if err != nil {
		h.log.Error("ListSlots: schedule.ListScheduleSlots", zap.Error(err))
		return internalError(c, "failed to list schedule slots")
	}

	return c.JSON(fiber.Map{"data": slots})
}

// ── CreateSlot ────────────────────────────────────────────────────────────────

type createSlotRequest struct {
	Platform string `json:"platform"`
	// Accept both snake_case and camelCase so the Go backend and TS frontend
	// agree regardless of which casing the client picks.
	DayOfWeek    *int   `json:"day_of_week,omitempty"`
	DayOfWeekCC  *int   `json:"dayOfWeek,omitempty"`
	TimeOfDay    string `json:"time_of_day,omitempty"`
	TimeCC       string `json:"time,omitempty"`
	TimeOfDayCC  string `json:"timeOfDay,omitempty"`
	Timezone     string `json:"timezone"`
}

// CreateSlot creates a new recurring schedule slot.
// POST /api/v1/workspaces/:wid/schedule/slots
func (h *ScheduleHandler) CreateSlot(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	var req createSlotRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	if req.Platform == "" {
		return badRequest(c, "platform is required", "VALIDATION_ERROR")
	}
	// Resolve day + time from either casing.
	var dayOfWeek int
	switch {
	case req.DayOfWeek != nil:
		dayOfWeek = *req.DayOfWeek
	case req.DayOfWeekCC != nil:
		dayOfWeek = *req.DayOfWeekCC
	default:
		return badRequest(c, "day_of_week is required", "VALIDATION_ERROR")
	}
	if dayOfWeek < 0 || dayOfWeek > 6 {
		return badRequest(c, "day_of_week must be 0–6 (0=Sunday)", "VALIDATION_ERROR")
	}
	timeOfDay := req.TimeOfDay
	if timeOfDay == "" {
		timeOfDay = req.TimeCC
	}
	if timeOfDay == "" {
		timeOfDay = req.TimeOfDayCC
	}
	if len(timeOfDay) != 5 || timeOfDay[2] != ':' {
		return badRequest(c, "time_of_day must be HH:MM format", "VALIDATION_ERROR")
	}
	if req.Timezone == "" {
		req.Timezone = "UTC"
	}

	slot, err := h.schedule.CreateScheduleSlot(wid, req.Platform, dayOfWeek, timeOfDay, req.Timezone)
	if err != nil {
		h.log.Error("CreateSlot: schedule.CreateScheduleSlot", zap.Error(err))
		return internalError(c, err.Error())
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": slot})
}

// ── DeleteSlot ────────────────────────────────────────────────────────────────

// DeleteSlot removes a schedule slot.
// DELETE /api/v1/workspaces/:wid/schedule/slots/:id
func (h *ScheduleHandler) DeleteSlot(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}
	slotID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "id must be a valid UUID", "INVALID_ID")
	}

	if err := h.schedule.DeleteScheduleSlot(slotID, wid); err != nil {
		if errors.Is(err, scheduling.ErrSlotNotFound) {
			return notFound(c, "schedule slot not found", "NOT_FOUND")
		}
		h.log.Error("DeleteSlot: schedule.DeleteScheduleSlot", zap.Error(err))
		return internalError(c, "failed to delete slot")
	}

	return c.JSON(fiber.Map{"data": fiber.Map{"message": "slot deleted"}})
}

// ── GetNextFreeSlot ───────────────────────────────────────────────────────────

// GetNextFreeSlot returns the next available slot time for a platform.
// GET /api/v1/workspaces/:wid/schedule/next-slot?platform=instagram
func (h *ScheduleHandler) GetNextFreeSlot(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	platform := c.Query("platform")
	if platform == "" {
		return badRequest(c, "platform query param is required", "VALIDATION_ERROR")
	}

	slotTime, err := h.schedule.GetNextFreeSlot(wid, platform)
	if err != nil {
		if errors.Is(err, scheduling.ErrNoFreeSlot) {
			return notFound(c, "no free schedule slot available for platform "+platform, "NO_FREE_SLOT")
		}
		h.log.Error("GetNextFreeSlot: schedule.GetNextFreeSlot", zap.Error(err))
		return internalError(c, "failed to find next slot")
	}

	return c.JSON(fiber.Map{
		"data": fiber.Map{
			"slot_time": slotTime.Format(time.RFC3339),
			"platform":  platform,
		},
	})
}

// ── GetCalendar ───────────────────────────────────────────────────────────────

// GetCalendar returns posts grouped by date for a date range.
// GET /api/v1/workspaces/:wid/schedule/calendar?from=2024-01-01&to=2024-01-31
func (h *ScheduleHandler) GetCalendar(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	fromStr := c.Query("from")
	toStr := c.Query("to")

	if fromStr == "" || toStr == "" {
		return badRequest(c, "from and to query params are required (YYYY-MM-DD)", "VALIDATION_ERROR")
	}

	fromDate, err := time.Parse("2006-01-02", fromStr)
	if err != nil {
		return badRequest(c, "from must be YYYY-MM-DD format", "VALIDATION_ERROR")
	}
	toDate, err := time.Parse("2006-01-02", toStr)
	if err != nil {
		return badRequest(c, "to must be YYYY-MM-DD format", "VALIDATION_ERROR")
	}
	toDate = toDate.AddDate(0, 0, 1) // make inclusive

	if !toDate.After(fromDate) {
		return badRequest(c, "to must be after from", "VALIDATION_ERROR")
	}

	// Limit range to 90 days to prevent excessive DB queries.
	if toDate.Sub(fromDate) > 90*24*time.Hour {
		return badRequest(c, "calendar range cannot exceed 90 days", "VALIDATION_ERROR")
	}

	calendar, err := h.schedule.GetCalendar(wid, fromDate, toDate)
	if err != nil {
		h.log.Error("GetCalendar: schedule.GetCalendar", zap.Error(err))
		return internalError(c, "failed to get calendar")
	}

	return c.JSON(fiber.Map{"data": calendar})
}
