package handlers

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
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

// PlatformOAuthClient mirrors the interface from the api package to avoid
// an import cycle. Each platform adapter satisfies this interface.
type PlatformOAuthClient interface {
	GetAuthURL(workspaceID uuid.UUID, state string) string
	ExchangeCode(ctx context.Context, code, state string, workspaceID uuid.UUID) (*models.SocialAccount, error)
}

// BlueskyConnector is the interface for Bluesky app-password auth.
// Bluesky does not use OAuth — it uses the AT Protocol session API.
type BlueskyConnector interface {
	ConnectWithAppPassword(ctx context.Context, workspaceID uuid.UUID, identifier, appPassword string) (*models.SocialAccount, error)
}

// AccountsHandler handles social account management endpoints.
type AccountsHandler struct {
	db              *gorm.DB
	platformClients map[string]PlatformOAuthClient
	bluesky         BlueskyConnector
	cfg             *config.Config
	log             *zap.Logger
}

// NewAccountsHandler creates a new AccountsHandler.
func NewAccountsHandler(
	db *gorm.DB,
	clients map[string]PlatformOAuthClient,
	bluesky BlueskyConnector,
	cfg *config.Config,
	log *zap.Logger,
) *AccountsHandler {
	return &AccountsHandler{
		db:              db,
		platformClients: clients,
		bluesky:         bluesky,
		cfg:             cfg,
		log:             log.Named("accounts_handler"),
	}
}

// ── ListAccounts ──────────────────────────────────────────────────────────────

// ListAccounts returns all social accounts for the workspace grouped by platform.
// GET /api/v1/workspaces/:wid/accounts
func (h *AccountsHandler) ListAccounts(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	var accounts []models.SocialAccount
	if err := h.db.WithContext(c.Context()).
		Where("workspace_id = ?", wid).
		Order("platform, account_name").
		Find(&accounts).Error; err != nil {
		h.log.Error("ListAccounts: db query", zap.Error(err))
		return internalError(c, "failed to list accounts")
	}

	// Group by platform and enrich with expiry status.
	type accountView struct {
		models.SocialAccount
		TokenExpired bool `json:"token_expired"`
		TokenExpiringSoon bool `json:"token_expiring_soon"`
	}

	grouped := make(map[string][]accountView)
	for _, acc := range accounts {
		view := accountView{SocialAccount: acc}
		if acc.TokenExpiresAt != nil {
			view.TokenExpired = acc.TokenExpiresAt.Before(time.Now())
			view.TokenExpiringSoon = !view.TokenExpired && acc.TokenExpiresAt.Before(time.Now().Add(7*24*time.Hour))
		}
		grouped[string(acc.Platform)] = append(grouped[string(acc.Platform)], view)
	}

	return c.JSON(fiber.Map{"data": grouped})
}

// ── DisconnectAccount ─────────────────────────────────────────────────────────

// DisconnectAccount removes a social account from the workspace.
// DELETE /api/v1/workspaces/:wid/accounts/:id
func (h *AccountsHandler) DisconnectAccount(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}
	accountID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "id must be a valid UUID", "INVALID_ID")
	}

	var account models.SocialAccount
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", accountID, wid).
		First(&account).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "account not found", "NOT_FOUND")
		}
		return internalError(c, "failed to fetch account")
	}

	// Attempt token revocation (best-effort, platform-specific).
	h.tryRevokeToken(c.Context(), &account)

	result := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", accountID, wid).
		Delete(&models.SocialAccount{})
	if result.Error != nil {
		h.log.Error("DisconnectAccount: db delete", zap.Error(result.Error))
		return internalError(c, "failed to disconnect account")
	}

	return c.JSON(fiber.Map{"data": fiber.Map{"message": "account disconnected"}})
}

// tryRevokeToken attempts to revoke the access token for platforms that support it.
// This is best-effort: failures are logged but do not block the disconnect.
func (h *AccountsHandler) tryRevokeToken(_ context.Context, account *models.SocialAccount) {
	// Currently revocation is supported for Facebook/Instagram via the Graph API.
	// Other platforms can be added here.
	switch account.Platform {
	case models.PlatformFacebook, models.PlatformInstagram:
		// Token revocation would happen here using the crypto package to decrypt
		// the stored token and call the revoke endpoint. Skipped to avoid circular
		// dependency without the crypto helper being wired in here.
		h.log.Debug("token revocation skipped (best-effort)",
			zap.String("platform", string(account.Platform)),
			zap.String("account_id", account.ID.String()),
		)
	default:
		// Most platforms don't expose a public token revocation endpoint.
	}
}

// ── RefreshAccount ────────────────────────────────────────────────────────────

// RefreshAccount returns an OAuth URL the user can visit to re-authorise
// the given social account. It builds the same connect URL used by
// InitiateOAuth so expired tokens can be refreshed by re-connecting.
// POST /api/v1/workspaces/:workspaceId/accounts/:id/refresh
func (h *AccountsHandler) RefreshAccount(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}
	accountID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "id must be a valid UUID", "INVALID_ID")
	}

	var account models.SocialAccount
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", accountID, wid).
		First(&account).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "account not found", "NOT_FOUND")
		}
		return internalError(c, "failed to fetch account")
	}

	platform := strings.ToLower(string(account.Platform))
	client, ok := h.platformClients[platform]
	if !ok {
		return badRequest(c, fmt.Sprintf("unsupported platform: %s", platform), "UNSUPPORTED_PLATFORM")
	}

	state, err := buildOAuthState(wid)
	if err != nil {
		h.log.Error("RefreshAccount: buildOAuthState", zap.Error(err))
		return internalError(c, "failed to build oauth state")
	}

	authURL := client.GetAuthURL(wid, state)
	return c.JSON(fiber.Map{
		"data": fiber.Map{
			"url":     authURL,
			"message": "Re-connect the account to refresh the access token",
		},
	})
}

// ── InitiateOAuth ─────────────────────────────────────────────────────────────

// InitiateOAuth starts the OAuth flow for the given platform.
// GET /api/v1/oauth/:platform/connect
func (h *AccountsHandler) InitiateOAuth(c *fiber.Ctx) error {
	platform := strings.ToLower(c.Params("platform"))

	client, ok := h.platformClients[platform]
	if !ok {
		return badRequest(c, fmt.Sprintf("unsupported platform: %s", platform), "UNSUPPORTED_PLATFORM")
	}

	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "not authenticated")
	}

	// Get workspace from query param or user's default workspace.
	widStr := c.Query("workspace_id")
	var wid uuid.UUID
	if widStr != "" {
		id, err := uuid.Parse(widStr)
		if err != nil {
			return badRequest(c, "workspace_id must be a valid UUID", "INVALID_ID")
		}
		wid = id
	} else {
		// Fall back to first workspace.
		var ws models.Workspace
		if err := h.db.WithContext(c.Context()).
			Where("owner_id = ?", user.ID).
			First(&ws).Error; err != nil {
			return badRequest(c, "workspace_id is required", "VALIDATION_ERROR")
		}
		wid = ws.ID
	}

	// Generate state token that encodes workspace_id + CSRF random.
	state, err := buildOAuthState(wid)
	if err != nil {
		h.log.Error("InitiateOAuth: buildOAuthState", zap.Error(err))
		return internalError(c, "failed to generate state")
	}

	authURL := client.GetAuthURL(wid, state)

	return c.JSON(fiber.Map{"data": fiber.Map{"url": authURL}})
}

// ── OAuthCallback ─────────────────────────────────────────────────────────────

// OAuthCallback handles the OAuth provider redirect and stores the social account.
// GET /api/v1/oauth/:platform/callback
func (h *AccountsHandler) OAuthCallback(c *fiber.Ctx) error {
	platform := strings.ToLower(c.Params("platform"))

	client, ok := h.platformClients[platform]
	if !ok {
		return badRequest(c, fmt.Sprintf("unsupported platform: %s", platform), "UNSUPPORTED_PLATFORM")
	}

	code := c.Query("code")
	state := c.Query("state")
	errParam := c.Query("error")

	if errParam != "" {
		errDesc := c.Query("error_description", errParam)
		h.log.Warn("OAuthCallback: provider returned error",
			zap.String("platform", platform),
			zap.String("error", errParam),
		)
		redirectURL := fmt.Sprintf("%s/dashboard/accounts?error=%s",
			h.cfg.App.FrontendURL, errParam+": "+errDesc)
		return c.Redirect(redirectURL, fiber.StatusFound)
	}

	if code == "" || state == "" {
		return badRequest(c, "code and state are required", "MISSING_PARAMS")
	}

	// Extract workspace_id from state.
	wid, err := parseOAuthState(state)
	if err != nil {
		h.log.Warn("OAuthCallback: invalid state", zap.Error(err), zap.String("state", state))
		return badRequest(c, "invalid state parameter", "INVALID_STATE")
	}

	account, err := client.ExchangeCode(c.Context(), code, state, wid)
	if err != nil {
		h.log.Error("OAuthCallback: ExchangeCode failed",
			zap.String("platform", platform),
			zap.Error(err),
		)
		redirectURL := fmt.Sprintf("%s/dashboard/accounts?error=oauth_failed", h.cfg.App.FrontendURL)
		return c.Redirect(redirectURL, fiber.StatusFound)
	}

	h.log.Info("OAuthCallback: account connected",
		zap.String("platform", platform),
		zap.String("account_id", account.ID.String()),
		zap.String("workspace_id", wid.String()),
	)

	redirectURL := fmt.Sprintf("%s/dashboard/accounts?success=true&platform=%s",
		h.cfg.App.FrontendURL, platform)
	return c.Redirect(redirectURL, fiber.StatusFound)
}

// ── ConnectBluesky ────────────────────────────────────────────────────────────

type connectBlueskyRequest struct {
	Handle      string `json:"handle"`      // e.g. user.bsky.social
	AppPassword string `json:"appPassword"` // Bluesky app password (not account password)
	WorkspaceID string `json:"workspace_id"` // optional — falls back to user's first workspace
}

// ConnectBluesky connects a Bluesky account using the AT Protocol app-password flow.
// Bluesky does not use OAuth; this is a dedicated non-OAuth endpoint.
// POST /api/v1/oauth/bluesky/connect
func (h *AccountsHandler) ConnectBluesky(c *fiber.Ctx) error {
	if h.bluesky == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"error": "Bluesky integration is not configured",
			"code":  "BLUESKY_NOT_CONFIGURED",
		})
	}

	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "not authenticated")
	}

	var req connectBlueskyRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	if strings.TrimSpace(req.Handle) == "" {
		return badRequest(c, "handle is required", "VALIDATION_ERROR")
	}
	if strings.TrimSpace(req.AppPassword) == "" {
		return badRequest(c, "appPassword is required", "VALIDATION_ERROR")
	}

	// Resolve workspace_id from request or fall back to user's first workspace.
	var wid uuid.UUID
	if req.WorkspaceID != "" {
		id, err := uuid.Parse(req.WorkspaceID)
		if err != nil {
			return badRequest(c, "workspace_id must be a valid UUID", "INVALID_ID")
		}
		wid = id
	} else {
		var ws models.Workspace
		if err := h.db.WithContext(c.Context()).
			Where("owner_id = ?", user.ID).
			First(&ws).Error; err != nil {
			return badRequest(c, "workspace_id is required", "VALIDATION_ERROR")
		}
		wid = ws.ID
	}

	account, err := h.bluesky.ConnectWithAppPassword(c.Context(), wid, req.Handle, req.AppPassword)
	if err != nil {
		h.log.Error("ConnectBluesky: ConnectWithAppPassword failed",
			zap.String("handle", req.Handle),
			zap.Error(err),
		)
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Failed to connect Bluesky account: " + err.Error(),
			"code":  "BLUESKY_AUTH_FAILED",
		})
	}

	h.log.Info("Bluesky account connected",
		zap.String("handle", req.Handle),
		zap.String("workspace_id", wid.String()),
		zap.String("account_id", account.ID.String()),
	)

	return c.JSON(fiber.Map{"data": account})
}

// ── OAuth state helpers ───────────────────────────────────────────────────────

// buildOAuthState produces a URL-safe state token embedding the workspace ID.
// Format: <workspaceID>|<random>  (base64-encoded)
func buildOAuthState(workspaceID uuid.UUID) (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	raw := fmt.Sprintf("%s|%s", workspaceID.String(), base64.RawURLEncoding.EncodeToString(b))
	return base64.RawURLEncoding.EncodeToString([]byte(raw)), nil
}

// parseOAuthState decodes a state token and returns the embedded workspace ID.
func parseOAuthState(state string) (uuid.UUID, error) {
	raw, err := base64.RawURLEncoding.DecodeString(state)
	if err != nil {
		return uuid.Nil, fmt.Errorf("base64 decode: %w", err)
	}
	parts := strings.SplitN(string(raw), "|", 2)
	if len(parts) != 2 {
		return uuid.Nil, fmt.Errorf("malformed state: %s", state)
	}
	wid, err := uuid.Parse(parts[0])
	if err != nil {
		return uuid.Nil, fmt.Errorf("parse workspace_id: %w", err)
	}
	return wid, nil
}
