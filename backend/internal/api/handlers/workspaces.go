package handlers

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v2"
	"go.uber.org/zap"

	"github.com/socialforge/backend/internal/repository"
)

// WorkspaceHandler handles workspace CRUD endpoints.
type WorkspaceHandler struct {
	workspaces repository.WorkspaceRepository
	log        *zap.Logger
}

// NewWorkspaceHandler constructs a WorkspaceHandler.
func NewWorkspaceHandler(workspaces repository.WorkspaceRepository, log *zap.Logger) *WorkspaceHandler {
	return &WorkspaceHandler{workspaces: workspaces, log: log.Named("workspace_handler")}
}

// GetWorkspace returns the full workspace record.
// GET /api/v1/workspaces/:workspaceId
func (h *WorkspaceHandler) GetWorkspace(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	ws, err := h.workspaces.GetByID(c.Context(), wid)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return notFound(c, "workspace not found", "NOT_FOUND")
		}
		h.log.Error("GetWorkspace", zap.Error(err))
		return internalError(c, "failed to load workspace")
	}
	return c.JSON(fiber.Map{"data": ws})
}

// UpdateWorkspace patches mutable workspace fields (name, branding, custom
// domain, whitelabel toggle).
// PATCH /api/v1/workspaces/:workspaceId
func (h *WorkspaceHandler) UpdateWorkspace(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	type body struct {
		Name           *string `json:"name,omitempty"`
		LogoURL        *string `json:"logo_url,omitempty"`
		PrimaryColor   *string `json:"primary_color,omitempty"`
		SecondaryColor *string `json:"secondary_color,omitempty"`
		BrandName      *string `json:"brand_name,omitempty"`
		CustomDomain   *string `json:"custom_domain,omitempty"`
		IsWhitelabel   *bool   `json:"is_whitelabel,omitempty"`
	}
	var req body
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	ws, err := h.workspaces.GetByID(c.Context(), wid)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return notFound(c, "workspace not found", "NOT_FOUND")
		}
		h.log.Error("UpdateWorkspace: GetByID", zap.Error(err))
		return internalError(c, "failed to load workspace")
	}

	if req.Name != nil {
		ws.Name = strings.TrimSpace(*req.Name)
	}
	if req.LogoURL != nil {
		ws.LogoURL = *req.LogoURL
	}
	if req.PrimaryColor != nil {
		ws.PrimaryColor = *req.PrimaryColor
	}
	if req.SecondaryColor != nil {
		ws.SecondaryColor = *req.SecondaryColor
	}
	if req.BrandName != nil {
		ws.BrandName = *req.BrandName
	}
	if req.CustomDomain != nil {
		ws.CustomDomain = strings.TrimSpace(*req.CustomDomain)
	}
	if req.IsWhitelabel != nil {
		ws.IsWhitelabel = *req.IsWhitelabel
	}

	if err := h.workspaces.Update(c.Context(), ws); err != nil {
		h.log.Error("UpdateWorkspace: Update", zap.Error(err))
		return internalError(c, "failed to update workspace")
	}
	return c.JSON(fiber.Map{"data": ws})
}
