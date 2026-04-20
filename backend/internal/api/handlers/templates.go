package handlers

import (
	"math"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/models"
)

// TemplatesHandler handles template CRUD operations.
type TemplatesHandler struct {
	db  *gorm.DB
	log *zap.Logger
}

// NewTemplatesHandler creates a new TemplatesHandler.
func NewTemplatesHandler(db *gorm.DB, log *zap.Logger) *TemplatesHandler {
	return &TemplatesHandler{db: db, log: log.Named("templates_handler")}
}

type createTemplateRequest struct {
	Name          string `json:"name"`
	Platform      string `json:"platform"`
	Type          string `json:"type"`
	Prompt        string `json:"prompt"`
	ExampleOutput string `json:"example_output"`
	IsPublic      bool   `json:"is_public"`
}

type updateTemplateRequest struct {
	Name          *string `json:"name,omitempty"`
	Platform      *string `json:"platform,omitempty"`
	Type          *string `json:"type,omitempty"`
	Prompt        *string `json:"prompt,omitempty"`
	ExampleOutput *string `json:"example_output,omitempty"`
	IsPublic      *bool   `json:"is_public,omitempty"`
}

// ListTemplates returns all templates for the workspace, newest first.
// GET /api/v1/workspaces/:workspaceId/templates
func (h *TemplatesHandler) ListTemplates(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 50)
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 50
	}
	offset := (page - 1) * limit

	var total int64
	base := h.db.WithContext(c.Context()).Model(&models.Template{}).Where("workspace_id = ?", wid)
	if err := base.Count(&total).Error; err != nil {
		h.log.Error("ListTemplates: count", zap.Error(err))
		return internalError(c, "failed to list templates")
	}

	var items []models.Template
	if err := base.Order("created_at DESC").Limit(limit).Offset(offset).Find(&items).Error; err != nil {
		h.log.Error("ListTemplates: find", zap.Error(err))
		return internalError(c, "failed to list templates")
	}

	return c.JSON(fiber.Map{
		"data": items,
		"meta": fiber.Map{
			"total":       total,
			"page":        page,
			"limit":       limit,
			"total_pages": int(math.Ceil(float64(total) / float64(limit))),
		},
	})
}

// CreateTemplate creates a new template in the workspace.
// POST /api/v1/workspaces/:workspaceId/templates
func (h *TemplatesHandler) CreateTemplate(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	user := currentUser(c)
	if user == nil {
		return unauthorised(c, "not authenticated")
	}

	var req createTemplateRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}
	if req.Name == "" {
		return badRequest(c, "name is required", "VALIDATION_ERROR")
	}

	tpl := models.Template{
		WorkspaceID:   wid,
		CreatedBy:     user.ID,
		Name:          req.Name,
		Platform:      req.Platform,
		TemplateType:  req.Type,
		Prompt:        req.Prompt,
		ExampleOutput: req.ExampleOutput,
		IsPublic:      req.IsPublic,
	}
	if tpl.TemplateType == "" {
		tpl.TemplateType = "Caption"
	}

	if err := h.db.WithContext(c.Context()).Create(&tpl).Error; err != nil {
		h.log.Error("CreateTemplate", zap.Error(err))
		return internalError(c, "failed to create template")
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": tpl})
}

// UpdateTemplate updates mutable fields of a template.
// PATCH /api/v1/workspaces/:workspaceId/templates/:id
func (h *TemplatesHandler) UpdateTemplate(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "id must be a valid UUID", "INVALID_ID")
	}

	var req updateTemplateRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	var tpl models.Template
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", id, wid).
		First(&tpl).Error; err != nil {
		return notFound(c, "template not found", "NOT_FOUND")
	}

	updates := map[string]interface{}{}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.Platform != nil {
		updates["platform"] = *req.Platform
	}
	if req.Type != nil {
		updates["template_type"] = *req.Type
	}
	if req.Prompt != nil {
		updates["prompt"] = *req.Prompt
	}
	if req.ExampleOutput != nil {
		updates["example_output"] = *req.ExampleOutput
	}
	if req.IsPublic != nil {
		updates["is_public"] = *req.IsPublic
	}

	if len(updates) > 0 {
		if err := h.db.WithContext(c.Context()).Model(&tpl).Updates(updates).Error; err != nil {
			h.log.Error("UpdateTemplate", zap.Error(err))
			return internalError(c, "failed to update template")
		}
		// Reload so returned record reflects DB state (GORM map-updates don't refresh the struct).
		h.db.WithContext(c.Context()).First(&tpl, "id = ?", tpl.ID)
	}

	return c.JSON(fiber.Map{"data": tpl})
}

// DeleteTemplate removes a template from the workspace.
// DELETE /api/v1/workspaces/:workspaceId/templates/:id
func (h *TemplatesHandler) DeleteTemplate(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "id must be a valid UUID", "INVALID_ID")
	}

	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", id, wid).
		Delete(&models.Template{}).Error; err != nil {
		h.log.Error("DeleteTemplate", zap.Error(err))
		return internalError(c, "failed to delete template")
	}

	return c.SendStatus(fiber.StatusNoContent)
}

// UseTemplate increments the usage counter and records last_used_at.
// POST /api/v1/workspaces/:workspaceId/templates/:id/use
func (h *TemplatesHandler) UseTemplate(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "id must be a valid UUID", "INVALID_ID")
	}

	now := time.Now()
	if err := h.db.WithContext(c.Context()).Model(&models.Template{}).
		Where("id = ? AND workspace_id = ?", id, wid).
		Updates(map[string]interface{}{
			"used_count":  gorm.Expr("used_count + 1"),
			"last_used_at": now,
		}).Error; err != nil {
		h.log.Error("UseTemplate", zap.Error(err))
		return internalError(c, "failed to record template use")
	}

	return c.SendStatus(fiber.StatusNoContent)
}
