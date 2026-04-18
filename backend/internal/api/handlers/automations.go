package handlers

import (
	"math"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/models"
)

// AutomationsHandler handles automation CRUD endpoints.
type AutomationsHandler struct {
	db  *gorm.DB
	log *zap.Logger
}

// NewAutomationsHandler creates a new AutomationsHandler.
func NewAutomationsHandler(db *gorm.DB, log *zap.Logger) *AutomationsHandler {
	return &AutomationsHandler{db: db, log: log.Named("automations_handler")}
}

// ─── request/response types ───────────────────────────────────────────────────

type createAutomationRequest struct {
	Name          string                       `json:"name"`
	Description   string                       `json:"description,omitempty"`
	TriggerType   models.AutomationTriggerType `json:"trigger_type"`
	TriggerConfig models.JSONMap               `json:"trigger_config"`
	ActionType    models.AutomationActionType  `json:"action_type"`
	ActionConfig  models.JSONMap               `json:"action_config"`
}

type updateAutomationRequest struct {
	Name          *string                       `json:"name,omitempty"`
	Description   *string                       `json:"description,omitempty"`
	TriggerType   *models.AutomationTriggerType `json:"trigger_type,omitempty"`
	TriggerConfig models.JSONMap                `json:"trigger_config,omitempty"`
	ActionType    *models.AutomationActionType  `json:"action_type,omitempty"`
	ActionConfig  models.JSONMap                `json:"action_config,omitempty"`
	IsEnabled     *bool                         `json:"is_enabled,omitempty"`
}

// validTriggerTypes is the set of accepted trigger_type values.
var validTriggerTypes = map[models.AutomationTriggerType]bool{
	models.TriggerPostPublished: true,
	models.TriggerPostFailed:    true,
	models.TriggerSchedule:      true,
}

// validActionTypes is the set of accepted action_type values.
var validActionTypes = map[models.AutomationActionType]bool{
	models.ActionSendNotification:    true,
	models.ActionAutoRepurpose:       true,
	models.ActionRepublishAfterDelay: true,
}

// ─── ListAutomations ──────────────────────────────────────────────────────────

// ListAutomations returns a paginated list of automations for the workspace.
// GET /api/v1/workspaces/:workspaceId/automations
func (h *AutomationsHandler) ListAutomations(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 20)
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	var automations []models.Automation
	var total int64

	base := h.db.WithContext(c.Context()).Model(&models.Automation{}).
		Where("workspace_id = ?", wid)

	if err := base.Count(&total).Error; err != nil {
		h.log.Error("ListAutomations: count", zap.Error(err))
		return internalError(c, "failed to list automations")
	}

	if err := base.Order("created_at DESC").Offset(offset).Limit(limit).
		Find(&automations).Error; err != nil {
		h.log.Error("ListAutomations: find", zap.Error(err))
		return internalError(c, "failed to list automations")
	}

	totalPages := int(math.Ceil(float64(total) / float64(limit)))

	return c.JSON(fiber.Map{
		"data": automations,
		"meta": fiber.Map{
			"total":       total,
			"page":        page,
			"limit":       limit,
			"total_pages": totalPages,
		},
	})
}

// ─── CreateAutomation ─────────────────────────────────────────────────────────

// CreateAutomation creates a new automation rule.
// POST /api/v1/workspaces/:workspaceId/automations
func (h *AutomationsHandler) CreateAutomation(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	user := currentUser(c)
	if user == nil {
		return unauthorised(c, "not authenticated")
	}

	var req createAutomationRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	if req.Name == "" {
		return badRequest(c, "name is required", "VALIDATION_ERROR")
	}
	if !validTriggerTypes[req.TriggerType] {
		return badRequest(c, "trigger_type must be one of: post_published, post_failed, schedule", "VALIDATION_ERROR")
	}
	if !validActionTypes[req.ActionType] {
		return badRequest(c, "action_type must be one of: send_notification, auto_repurpose, republish_after_delay", "VALIDATION_ERROR")
	}

	if req.TriggerConfig == nil {
		req.TriggerConfig = models.JSONMap{}
	}
	if req.ActionConfig == nil {
		req.ActionConfig = models.JSONMap{}
	}

	automation := models.Automation{
		WorkspaceID:   wid,
		CreatedBy:     user.ID,
		Name:          req.Name,
		Description:   req.Description,
		TriggerType:   req.TriggerType,
		TriggerConfig: req.TriggerConfig,
		ActionType:    req.ActionType,
		ActionConfig:  req.ActionConfig,
		IsEnabled:     true,
	}

	if err := h.db.WithContext(c.Context()).Create(&automation).Error; err != nil {
		h.log.Error("CreateAutomation: create", zap.Error(err))
		return internalError(c, "failed to create automation")
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": automation})
}

// ─── GetAutomation ────────────────────────────────────────────────────────────

// GetAutomation returns a single automation by ID.
// GET /api/v1/workspaces/:workspaceId/automations/:id
func (h *AutomationsHandler) GetAutomation(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "automation id must be a valid UUID", "INVALID_ID")
	}

	var automation models.Automation
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", id, wid).
		First(&automation).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "automation not found", "NOT_FOUND")
		}
		h.log.Error("GetAutomation: find", zap.Error(err))
		return internalError(c, "failed to get automation")
	}

	return c.JSON(fiber.Map{"data": automation})
}

// ─── UpdateAutomation ─────────────────────────────────────────────────────────

// UpdateAutomation patches mutable fields on an automation.
// PATCH /api/v1/workspaces/:workspaceId/automations/:id
func (h *AutomationsHandler) UpdateAutomation(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "automation id must be a valid UUID", "INVALID_ID")
	}

	var req updateAutomationRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	// Validate enum values if provided.
	if req.TriggerType != nil && !validTriggerTypes[*req.TriggerType] {
		return badRequest(c, "trigger_type must be one of: post_published, post_failed, schedule", "VALIDATION_ERROR")
	}
	if req.ActionType != nil && !validActionTypes[*req.ActionType] {
		return badRequest(c, "action_type must be one of: send_notification, auto_repurpose, republish_after_delay", "VALIDATION_ERROR")
	}

	var automation models.Automation
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", id, wid).
		First(&automation).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "automation not found", "NOT_FOUND")
		}
		h.log.Error("UpdateAutomation: find", zap.Error(err))
		return internalError(c, "failed to update automation")
	}

	updates := map[string]interface{}{}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.TriggerType != nil {
		updates["trigger_type"] = *req.TriggerType
	}
	if req.TriggerConfig != nil {
		updates["trigger_config"] = req.TriggerConfig
	}
	if req.ActionType != nil {
		updates["action_type"] = *req.ActionType
	}
	if req.ActionConfig != nil {
		updates["action_config"] = req.ActionConfig
	}
	if req.IsEnabled != nil {
		updates["is_enabled"] = *req.IsEnabled
	}

	if len(updates) == 0 {
		return c.JSON(fiber.Map{"data": automation})
	}

	if err := h.db.WithContext(c.Context()).Model(&automation).Updates(updates).Error; err != nil {
		h.log.Error("UpdateAutomation: update", zap.Error(err))
		return internalError(c, "failed to update automation")
	}

	return c.JSON(fiber.Map{"data": automation})
}

// ─── DeleteAutomation ─────────────────────────────────────────────────────────

// DeleteAutomation soft-deletes an automation.
// DELETE /api/v1/workspaces/:workspaceId/automations/:id
func (h *AutomationsHandler) DeleteAutomation(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "automation id must be a valid UUID", "INVALID_ID")
	}

	result := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", id, wid).
		Delete(&models.Automation{})
	if result.Error != nil {
		h.log.Error("DeleteAutomation: delete", zap.Error(result.Error))
		return internalError(c, "failed to delete automation")
	}
	if result.RowsAffected == 0 {
		return notFound(c, "automation not found", "NOT_FOUND")
	}

	return c.SendStatus(fiber.StatusNoContent)
}

// ─── ToggleAutomation ─────────────────────────────────────────────────────────

// ToggleAutomation flips the is_enabled flag on an automation.
// POST /api/v1/workspaces/:workspaceId/automations/:id/toggle
func (h *AutomationsHandler) ToggleAutomation(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "automation id must be a valid UUID", "INVALID_ID")
	}

	var automation models.Automation
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", id, wid).
		First(&automation).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "automation not found", "NOT_FOUND")
		}
		h.log.Error("ToggleAutomation: find", zap.Error(err))
		return internalError(c, "failed to toggle automation")
	}

	newEnabled := !automation.IsEnabled
	if err := h.db.WithContext(c.Context()).Model(&automation).
		Update("is_enabled", newEnabled).Error; err != nil {
		h.log.Error("ToggleAutomation: update", zap.Error(err))
		return internalError(c, "failed to toggle automation")
	}

	return c.JSON(fiber.Map{"data": automation})
}
