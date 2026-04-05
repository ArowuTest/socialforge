// Package handlers contains all HTTP request handlers for the SocialForge API.
package handlers

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/api/middleware"
	"github.com/socialforge/backend/internal/models"
	authsvc "github.com/socialforge/backend/internal/services/auth"
)

// AuthHandler handles authentication-related endpoints.
type AuthHandler struct {
	db   *gorm.DB
	auth *authsvc.Service
	log  *zap.Logger
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(db *gorm.DB, auth *authsvc.Service, log *zap.Logger) *AuthHandler {
	return &AuthHandler{db: db, auth: auth, log: log.Named("auth_handler")}
}

// ── Register ──────────────────────────────────────────────────────────────────

type registerRequest struct {
	Email         string `json:"email"`
	Password      string `json:"password"`
	Name          string `json:"name"`
	WorkspaceName string `json:"workspace_name"`
}

// Register creates a new user and workspace.
// POST /api/v1/auth/register
func (h *AuthHandler) Register(c *fiber.Ctx) error {
	var req registerRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.Name = strings.TrimSpace(req.Name)
	req.WorkspaceName = strings.TrimSpace(req.WorkspaceName)

	switch {
	case req.Email == "":
		return badRequest(c, "email is required", "VALIDATION_ERROR")
	case !strings.Contains(req.Email, "@"):
		return badRequest(c, "email is invalid", "VALIDATION_ERROR")
	case len(req.Password) < 8:
		return badRequest(c, "password must be at least 8 characters", "VALIDATION_ERROR")
	case req.Name == "":
		return badRequest(c, "name is required", "VALIDATION_ERROR")
	case req.WorkspaceName == "":
		return badRequest(c, "workspace_name is required", "VALIDATION_ERROR")
	}

	user, pair, err := h.auth.Register(c.Context(), authsvc.RegisterInput{
		Email:         req.Email,
		Password:      req.Password,
		Name:          req.Name,
		WorkspaceName: req.WorkspaceName,
	})
	if err != nil {
		if errors.Is(err, authsvc.ErrUserAlreadyExists) {
			return conflict(c, "a user with that email already exists", "USER_EXISTS")
		}
		h.log.Error("Register: auth.Register", zap.Error(err))
		return internalError(c, "registration failed")
	}

	// Fetch default workspace.
	var workspace models.Workspace
	_ = h.db.WithContext(c.Context()).Where("owner_id = ?", user.ID).First(&workspace).Error

	setRefreshCookie(c, pair.RefreshToken)

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"data": fiber.Map{
			"user":          user,
			"workspace":     workspace,
			"access_token":  pair.AccessToken,
			"refresh_token": pair.RefreshToken,
			"expires_at":    pair.ExpiresAt,
		},
	})
}

// ── Login ─────────────────────────────────────────────────────────────────────

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// Login authenticates a user and returns tokens.
// POST /api/v1/auth/login
func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req loginRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || req.Password == "" {
		return badRequest(c, "email and password are required", "VALIDATION_ERROR")
	}

	user, pair, err := h.auth.Login(c.Context(), req.Email, req.Password)
	if err != nil {
		if errors.Is(err, authsvc.ErrInvalidCredentials) {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "invalid email or password",
				"code":  "INVALID_CREDENTIALS",
			})
		}
		h.log.Error("Login: auth.Login", zap.Error(err))
		return internalError(c, "login failed")
	}

	// Load the user's primary workspace.
	var workspace models.Workspace
	_ = h.db.WithContext(c.Context()).
		Joins("JOIN workspace_members ON workspace_members.workspace_id = workspaces.id").
		Where("workspace_members.user_id = ? AND workspace_members.role = 'owner'", user.ID).
		First(&workspace).Error

	setRefreshCookie(c, pair.RefreshToken)

	return c.JSON(fiber.Map{
		"data": fiber.Map{
			"user":         user,
			"workspace":    workspace,
			"access_token": pair.AccessToken,
			"expires_at":   pair.ExpiresAt,
		},
	})
}

// ── RefreshToken ──────────────────────────────────────────────────────────────

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// RefreshToken issues a new token pair from a valid refresh token.
// POST /api/v1/auth/refresh
func (h *AuthHandler) RefreshToken(c *fiber.Ctx) error {
	// Accept token from cookie first, then body.
	rawToken := c.Cookies("refresh_token")
	if rawToken == "" {
		var req refreshRequest
		_ = c.BodyParser(&req)
		rawToken = req.RefreshToken
	}

	if rawToken == "" {
		return badRequest(c, "refresh token is required", "MISSING_TOKEN")
	}

	pair, err := h.auth.RefreshToken(c.Context(), rawToken)
	if err != nil {
		if errors.Is(err, authsvc.ErrTokenNotFound) || errors.Is(err, authsvc.ErrInvalidToken) {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "refresh token is invalid or expired",
				"code":  "INVALID_REFRESH_TOKEN",
			})
		}
		h.log.Error("RefreshToken: auth.RefreshToken", zap.Error(err))
		return internalError(c, "token refresh failed")
	}

	setRefreshCookie(c, pair.RefreshToken)

	return c.JSON(fiber.Map{
		"data": fiber.Map{
			"access_token":  pair.AccessToken,
			"refresh_token": pair.RefreshToken,
			"expires_at":    pair.ExpiresAt,
		},
	})
}

// ── Logout ────────────────────────────────────────────────────────────────────

// Logout invalidates the refresh token.
// POST /api/v1/auth/logout
func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	rawToken := c.Cookies("refresh_token")
	if rawToken == "" {
		var req refreshRequest
		_ = c.BodyParser(&req)
		rawToken = req.RefreshToken
	}

	if rawToken != "" {
		if err := h.auth.Logout(c.Context(), rawToken); err != nil {
			h.log.Warn("Logout: auth.Logout", zap.Error(err))
		}
	}

	// Clear the cookie regardless.
	c.Cookie(&fiber.Cookie{
		Name:     "refresh_token",
		Value:    "",
		MaxAge:   -1,
		HTTPOnly: true,
		Secure:   true,
		SameSite: "Strict",
		Path:     "/",
	})

	return c.JSON(fiber.Map{"data": fiber.Map{"message": "logged out"}})
}

// ── GetCurrentUser ────────────────────────────────────────────────────────────

// GetCurrentUser returns the authenticated user with their workspaces.
// GET /api/v1/auth/me
func (h *AuthHandler) GetCurrentUser(c *fiber.Ctx) error {
	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "not authenticated")
	}

	// Load workspaces for the user.
	var memberships []models.WorkspaceMember
	_ = h.db.WithContext(c.Context()).
		Preload("Workspace").
		Where("user_id = ?", user.ID).
		Find(&memberships).Error

	workspaces := make([]fiber.Map, 0, len(memberships))
	for _, m := range memberships {
		workspaces = append(workspaces, fiber.Map{
			"workspace": m.Workspace,
			"role":      m.Role,
		})
	}

	return c.JSON(fiber.Map{
		"data": fiber.Map{
			"user":       user,
			"workspaces": workspaces,
		},
	})
}

// ── CreateAPIKey ──────────────────────────────────────────────────────────────

type createAPIKeyRequest struct {
	Name        string `json:"name"`
	WorkspaceID string `json:"workspace_id"`
}

// CreateAPIKey generates a new API key for the authenticated user.
// POST /api/v1/auth/api-keys
func (h *AuthHandler) CreateAPIKey(c *fiber.Ctx) error {
	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "not authenticated")
	}

	var req createAPIKeyRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return badRequest(c, "name is required", "VALIDATION_ERROR")
	}

	// Resolve workspace.
	var workspaceID uuid.UUID
	if req.WorkspaceID != "" {
		id, err := uuid.Parse(req.WorkspaceID)
		if err != nil {
			return badRequest(c, "workspace_id must be a valid UUID", "VALIDATION_ERROR")
		}
		workspaceID = id
	} else {
		// Use first owned workspace.
		var ws models.Workspace
		if err := h.db.WithContext(c.Context()).
			Where("owner_id = ?", user.ID).
			First(&ws).Error; err != nil {
			return badRequest(c, "workspace_id is required", "VALIDATION_ERROR")
		}
		workspaceID = ws.ID
	}

	rawKey, record, err := h.auth.GenerateAPIKey(c.Context(), workspaceID, user.ID, req.Name)
	if err != nil {
		h.log.Error("CreateAPIKey: auth.GenerateAPIKey", zap.Error(err))
		return internalError(c, "failed to create API key")
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"data": fiber.Map{
			"id":         record.ID,
			"name":       record.Name,
			"key":        rawKey, // shown once only
			"key_prefix": record.KeyPrefix,
			"created_at": record.CreatedAt,
		},
	})
}

// ── ListAPIKeys ───────────────────────────────────────────────────────────────

// ListAPIKeys returns all API keys for the authenticated user (never the key hash).
// GET /api/v1/auth/api-keys
func (h *AuthHandler) ListAPIKeys(c *fiber.Ctx) error {
	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "not authenticated")
	}

	var keys []models.ApiKey
	if err := h.db.WithContext(c.Context()).
		Where("user_id = ? AND is_active = true", user.ID).
		Order("created_at DESC").
		Find(&keys).Error; err != nil {
		h.log.Error("ListAPIKeys: db query", zap.Error(err))
		return internalError(c, "failed to list API keys")
	}

	return c.JSON(fiber.Map{"data": keys})
}

// ── DeleteAPIKey ──────────────────────────────────────────────────────────────

// DeleteAPIKey hard-deletes an API key.
// DELETE /api/v1/auth/api-keys/:id
func (h *AuthHandler) DeleteAPIKey(c *fiber.Ctx) error {
	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "not authenticated")
	}

	keyID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "id must be a valid UUID", "INVALID_ID")
	}

	result := h.db.WithContext(c.Context()).
		Where("id = ? AND user_id = ?", keyID, user.ID).
		Delete(&models.ApiKey{})
	if result.Error != nil {
		h.log.Error("DeleteAPIKey: db delete", zap.Error(result.Error))
		return internalError(c, "failed to delete API key")
	}
	if result.RowsAffected == 0 {
		return notFound(c, "API key not found", "NOT_FOUND")
	}

	return c.JSON(fiber.Map{"data": fiber.Map{"message": "API key deleted"}})
}

// ── helpers ───────────────────────────────────────────────────────────────────

func setRefreshCookie(c *fiber.Ctx, token string) {
	c.Cookie(&fiber.Cookie{
		Name:     "refresh_token",
		Value:    token,
		MaxAge:   30 * 24 * 60 * 60, // 30 days
		HTTPOnly: true,
		Secure:   true,
		SameSite: "Strict",
		Path:     "/",
	})
}

// ── Shared handler helpers ────────────────────────────────────────────────────

func badRequest(c *fiber.Ctx, msg, code string) error {
	return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
		"error": msg,
		"code":  code,
	})
}

func unauthorised(c *fiber.Ctx, msg string) error {
	return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
		"error": msg,
		"code":  "UNAUTHORIZED",
	})
}

func forbidden(c *fiber.Ctx, msg string) error {
	return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
		"error": msg,
		"code":  "FORBIDDEN",
	})
}

func notFound(c *fiber.Ctx, msg, code string) error {
	return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
		"error": msg,
		"code":  code,
	})
}

func conflict(c *fiber.Ctx, msg, code string) error {
	return c.Status(fiber.StatusConflict).JSON(fiber.Map{
		"error": msg,
		"code":  code,
	})
}

func internalError(c *fiber.Ctx, msg string) error {
	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
		"error": msg,
		"code":  "INTERNAL_ERROR",
	})
}
