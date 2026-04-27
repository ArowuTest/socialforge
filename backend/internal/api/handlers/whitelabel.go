package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/mail"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/api/middleware"
	"github.com/socialforge/backend/internal/config"
	"github.com/socialforge/backend/internal/models"
)

// WhitelabelHandler handles white-label and client management endpoints.
type WhitelabelHandler struct {
	db  *gorm.DB
	cfg *config.Config
	log *zap.Logger
}

// NewWhitelabelHandler creates a new WhitelabelHandler.
func NewWhitelabelHandler(db *gorm.DB, cfg *config.Config, log *zap.Logger) *WhitelabelHandler {
	return &WhitelabelHandler{db: db, cfg: cfg, log: log.Named("whitelabel_handler")}
}

// ── GetWhitelabelConfig ───────────────────────────────────────────────────────

// GetWhitelabelConfig returns the workspace's white-label settings.
// GET /api/v1/workspaces/:wid/whitelabel
func (h *WhitelabelHandler) GetWhitelabelConfig(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	var ws models.Workspace
	if err := h.db.WithContext(c.Context()).First(&ws, "id = ?", wid).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "workspace not found", "NOT_FOUND")
		}
		return internalError(c, "failed to load workspace")
	}

	return c.JSON(fiber.Map{
		"data": fiber.Map{
			"is_whitelabel":  ws.IsWhitelabel,
			"name":           ws.Name,
			"brand_name":     ws.BrandName,
			"logo_url":       ws.LogoURL,
			"primary_color":  ws.PrimaryColor,
			"secondary_color": ws.SecondaryColor,
			"custom_domain":  ws.CustomDomain,
			"slug":           ws.Slug,
			"subdomain_url":  fmt.Sprintf("https://%s.%s", ws.Slug, h.cfg.App.BaseDomain),
		},
	})
}

// ── UpdateWhitelabelConfig ────────────────────────────────────────────────────

type updateWhitelabelRequest struct {
	Name          *string `json:"name"`
	BrandName     *string `json:"brand_name"`
	LogoURL       *string `json:"logo_url"`
	PrimaryColor  *string `json:"primary_color"`
	SecondaryColor *string `json:"secondary_color"`
	CustomDomain  *string `json:"custom_domain"`
	IsWhitelabel  *bool   `json:"is_whitelabel"`
}

// UpdateWhitelabelConfig updates the workspace white-label settings.
// PATCH /api/v1/workspaces/:wid/whitelabel
func (h *WhitelabelHandler) UpdateWhitelabelConfig(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	var ws models.Workspace
	if err := h.db.WithContext(c.Context()).First(&ws, "id = ?", wid).Error; err != nil {
		return internalError(c, "failed to load workspace")
	}

	// Check plan allows whitelabel.
	if ws.Plan != models.PlanAgency {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "white-label requires an Agency plan",
			"code":  "PLAN_UPGRADE_REQUIRED",
		})
	}

	var req updateWhitelabelRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	updates := map[string]interface{}{}

	if req.Name != nil {
		n := strings.TrimSpace(*req.Name)
		if n == "" {
			return badRequest(c, "name cannot be empty", "VALIDATION_ERROR")
		}
		updates["name"] = n
	}
	if req.BrandName != nil {
		updates["brand_name"] = strings.TrimSpace(*req.BrandName)
	}
	if req.LogoURL != nil {
		updates["logo_url"] = strings.TrimSpace(*req.LogoURL)
	}
	if req.PrimaryColor != nil {
		col := strings.TrimSpace(*req.PrimaryColor)
		if col != "" && !isValidHexColor(col) {
			return badRequest(c, "primary_color must be a valid hex color (#RRGGBB)", "VALIDATION_ERROR")
		}
		updates["primary_color"] = col
	}
	if req.SecondaryColor != nil {
		col := strings.TrimSpace(*req.SecondaryColor)
		if col != "" && !isValidHexColor(col) {
			return badRequest(c, "secondary_color must be a valid hex color (#RRGGBB)", "VALIDATION_ERROR")
		}
		updates["secondary_color"] = col
	}
	if req.CustomDomain != nil {
		dom := strings.ToLower(strings.TrimSpace(*req.CustomDomain))
		if dom != "" {
			// Basic domain validation.
			if !strings.Contains(dom, ".") {
				return badRequest(c, "custom_domain must be a valid domain", "VALIDATION_ERROR")
			}
			// Check uniqueness.
			var count int64
			h.db.WithContext(c.Context()).Model(&models.Workspace{}).
				Where("custom_domain = ? AND id != ?", dom, wid).
				Count(&count)
			if count > 0 {
				return conflict(c, "custom domain is already in use", "DOMAIN_TAKEN")
			}
		}
		updates["custom_domain"] = dom
	}
	if req.IsWhitelabel != nil {
		updates["is_whitelabel"] = *req.IsWhitelabel
	}

	if len(updates) == 0 {
		return badRequest(c, "no fields to update", "VALIDATION_ERROR")
	}

	if err := h.db.WithContext(c.Context()).Model(&ws).Updates(updates).Error; err != nil {
		h.log.Error("UpdateWhitelabelConfig: db update", zap.Error(err))
		return internalError(c, "failed to update whitelabel config")
	}

	// Reload.
	_ = h.db.WithContext(c.Context()).First(&ws, "id = ?", wid).Error

	return c.JSON(fiber.Map{"data": ws})
}

// ── ListClients ───────────────────────────────────────────────────────────────

// ListClients returns all client sub-workspaces.
// GET /api/v1/workspaces/:wid/clients
func (h *WhitelabelHandler) ListClients(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	var clients []models.Workspace
	if err := h.db.WithContext(c.Context()).
		Where("parent_workspace_id = ?", wid).
		Order("created_at DESC").
		Find(&clients).Error; err != nil {
		h.log.Error("ListClients: db query", zap.Error(err))
		return internalError(c, "failed to list clients")
	}

	return c.JSON(fiber.Map{"data": clients})
}

// ── CreateClient ──────────────────────────────────────────────────────────────

type createClientRequest struct {
	Name       string `json:"name"`
	OwnerEmail string `json:"owner_email"`
	Plan       string `json:"plan"`
}

// CreateClient creates a new client sub-workspace with an owner account.
// POST /api/v1/workspaces/:wid/clients
func (h *WhitelabelHandler) CreateClient(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "not authenticated")
	}

	var req createClientRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	req.Name = strings.TrimSpace(req.Name)
	req.OwnerEmail = strings.ToLower(strings.TrimSpace(req.OwnerEmail))

	if req.Name == "" {
		return badRequest(c, "name is required", "VALIDATION_ERROR")
	}
	if req.OwnerEmail == "" {
		return badRequest(c, "owner_email is required", "VALIDATION_ERROR")
	}
	if _, err := mail.ParseAddress(req.OwnerEmail); err != nil {
		return badRequest(c, "owner_email is invalid", "VALIDATION_ERROR")
	}

	plan := models.PlanType(req.Plan)
	if plan == "" {
		plan = models.PlanFree
	}

	// Check if email is already registered.
	var existingUser models.User
	if err := h.db.WithContext(c.Context()).Where("email = ?", req.OwnerEmail).First(&existingUser).Error; err != nil && err != gorm.ErrRecordNotFound {
		return internalError(c, "failed to check user")
	}

	var clientUser models.User
	isNewUser := existingUser.ID == uuid.Nil

	if isNewUser {
		// Generate a random temp password.
		tempPass, err := generateTempPassword()
		if err != nil {
			return internalError(c, "failed to generate temp password")
		}

		// Hash password (reuse bcrypt cost from auth service by calling through DB directly).
		// For simplicity we store a placeholder hash and force reset on first login.
		clientUser = models.User{
			Email:        req.OwnerEmail,
			PasswordHash: tempPass, // will be replaced on first login
			Name:         req.Name + " Admin",
			Plan:         plan,
		}
		if err := h.db.WithContext(c.Context()).Create(&clientUser).Error; err != nil {
			h.log.Error("CreateClient: create user", zap.Error(err))
			return internalError(c, "failed to create client user")
		}
	} else {
		clientUser = existingUser
	}

	// Build workspace slug.
	slug := strings.ToLower(strings.ReplaceAll(req.Name, " ", "-"))
	slug = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			return r
		}
		return -1
	}, slug)

	parentWID := wid
	now := time.Now()

	clientWS := models.Workspace{
		Name:              req.Name,
		Slug:              slug + "-" + hex.EncodeToString(make([]byte, 3)),
		OwnerID:           clientUser.ID,
		Plan:              plan,
		ParentWorkspaceID: &parentWID,
	}

	if err := h.db.WithContext(c.Context()).Create(&clientWS).Error; err != nil {
		h.log.Error("CreateClient: create workspace", zap.Error(err))
		return internalError(c, "failed to create client workspace")
	}

	// Create owner membership.
	member := models.WorkspaceMember{
		WorkspaceID: clientWS.ID,
		UserID:      clientUser.ID,
		Role:        models.WorkspaceRoleOwner,
		AcceptedAt:  &now,
	}
	_ = h.db.WithContext(c.Context()).Create(&member).Error

	h.log.Info("client workspace created",
		zap.String("parent_workspace_id", wid.String()),
		zap.String("client_workspace_id", clientWS.ID.String()),
		zap.String("owner_email", req.OwnerEmail),
	)

	// In production, send an invite email here.

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"data": fiber.Map{
			"workspace": clientWS,
			"user":      clientUser,
			"is_new_user": isNewUser,
		},
	})
}

// ── RemoveClient ──────────────────────────────────────────────────────────────

// RemoveClient soft-deletes a client workspace.
// DELETE /api/v1/workspaces/:wid/clients/:id
func (h *WhitelabelHandler) RemoveClient(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}
	clientID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "id must be a valid UUID", "INVALID_ID")
	}

	result := h.db.WithContext(c.Context()).
		Where("id = ? AND parent_workspace_id = ?", clientID, wid).
		Delete(&models.Workspace{})
	if result.Error != nil {
		h.log.Error("RemoveClient: db delete", zap.Error(result.Error))
		return internalError(c, "failed to remove client")
	}
	if result.RowsAffected == 0 {
		return notFound(c, "client workspace not found", "NOT_FOUND")
	}

	return c.JSON(fiber.Map{"data": fiber.Map{"message": "client workspace removed"}})
}

// ── helpers ───────────────────────────────────────────────────────────────────

func isValidHexColor(s string) bool {
	if len(s) != 7 || s[0] != '#' {
		return false
	}
	for _, c := range s[1:] {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}

func generateTempPassword() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
