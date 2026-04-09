// Package handlers contains all HTTP request handlers for the SocialForge API.
package handlers

import (
	"context"
	"errors"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/socialforge/backend/internal/api/middleware"
	"github.com/socialforge/backend/internal/models"
	"github.com/socialforge/backend/internal/repository"
	authsvc "github.com/socialforge/backend/internal/services/auth"
	"github.com/socialforge/backend/internal/services/notifications"
)

// AuthHandler handles authentication-related endpoints.
type AuthHandler struct {
	users         repository.UserRepository
	workspaces    repository.WorkspaceRepository
	apiKeys       repository.APIKeyRepository
	auth          *authsvc.Service
	notifications *notifications.Service
	log           *zap.Logger
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(
	users repository.UserRepository,
	workspaces repository.WorkspaceRepository,
	apiKeys repository.APIKeyRepository,
	auth *authsvc.Service,
	notif *notifications.Service,
	log *zap.Logger,
) *AuthHandler {
	return &AuthHandler{
		users:         users,
		workspaces:    workspaces,
		apiKeys:       apiKeys,
		auth:          auth,
		notifications: notif,
		log:           log.Named("auth_handler"),
	}
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

	// Fetch default workspace owned by this user.
	workspaces, err := h.workspaces.ListByOwner(c.Context(), user.ID)
	var workspace *models.Workspace
	if err == nil && len(workspaces) > 0 {
		workspace = workspaces[0]
	}

	// Fire-and-forget welcome email (no-op if Resend isn't configured).
	if h.notifications != nil && workspace != nil {
		go func(u *models.User, w *models.Workspace) {
			if err := h.notifications.SendWelcome(context.Background(), u, w); err != nil {
				h.log.Warn("SendWelcome failed", zap.Error(err), zap.String("user_id", u.ID.String()))
			}
		}(user, workspace)
	}

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

	// Load the user's primary owned workspace.
	workspaces, err := h.workspaces.ListByOwner(c.Context(), user.ID)
	var workspace *models.Workspace
	if err == nil && len(workspaces) > 0 {
		workspace = workspaces[0]
	}

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

	// Load workspace memberships for this user.
	memberships, err := h.workspaces.ListMembers(c.Context(), uuid.Nil)
	if err != nil {
		// ListMembers is per-workspace; instead list workspaces the user owns
		// plus any they are a member of via a targeted lookup approach.
		memberships = nil
	}
	// The WorkspaceRepository does not expose a cross-workspace membership query,
	// so we list owned workspaces and build the response from those.
	_ = memberships

	ownedWorkspaces, err := h.workspaces.ListByOwner(c.Context(), user.ID)
	if err != nil {
		h.log.Error("GetCurrentUser: workspaces.ListByOwner", zap.Error(err))
		ownedWorkspaces = []*models.Workspace{}
	}

	workspaces := make([]fiber.Map, 0, len(ownedWorkspaces))
	for _, ws := range ownedWorkspaces {
		workspaces = append(workspaces, fiber.Map{
			"workspace": ws,
			"role":      models.WorkspaceRoleOwner,
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
		ownedWorkspaces, err := h.workspaces.ListByOwner(c.Context(), user.ID)
		if err != nil || len(ownedWorkspaces) == 0 {
			return badRequest(c, "workspace_id is required", "VALIDATION_ERROR")
		}
		workspaceID = ownedWorkspaces[0].ID
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

	// Retrieve the user's first owned workspace, then list keys for that workspace.
	// The APIKeyRepository.ListByWorkspace lists keys per workspace; we look up
	// all owned workspaces and aggregate.
	ownedWorkspaces, err := h.workspaces.ListByOwner(c.Context(), user.ID)
	if err != nil {
		h.log.Error("ListAPIKeys: workspaces.ListByOwner", zap.Error(err))
		return internalError(c, "failed to list API keys")
	}

	var allKeys []*models.ApiKey
	for _, ws := range ownedWorkspaces {
		keys, err := h.apiKeys.ListByWorkspace(c.Context(), ws.ID)
		if err != nil {
			h.log.Error("ListAPIKeys: apiKeys.ListByWorkspace", zap.Error(err), zap.String("workspace_id", ws.ID.String()))
			continue
		}
		// Filter to the requesting user's keys only.
		for _, k := range keys {
			if k.UserID == user.ID && k.IsActive {
				allKeys = append(allKeys, k)
			}
		}
	}

	if allKeys == nil {
		allKeys = []*models.ApiKey{}
	}

	return c.JSON(fiber.Map{"data": allKeys})
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

	// Verify the key exists and belongs to this user before deleting.
	key, err := h.apiKeys.GetByID(c.Context(), keyID)
	if err != nil {
		if repository.IsNotFound(err) {
			return notFound(c, "API key not found", "NOT_FOUND")
		}
		h.log.Error("DeleteAPIKey: apiKeys.GetByID", zap.Error(err))
		return internalError(c, "failed to fetch API key")
	}
	if key.UserID != user.ID {
		return notFound(c, "API key not found", "NOT_FOUND")
	}

	if err := h.apiKeys.Delete(c.Context(), keyID); err != nil {
		h.log.Error("DeleteAPIKey: apiKeys.Delete", zap.Error(err))
		return internalError(c, "failed to delete API key")
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
