// Package middleware provides Fiber middleware for authentication, authorisation,
// rate-limiting, and workspace resolution.
package middleware

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/config"
	"github.com/socialforge/backend/internal/models"
	authsvc "github.com/socialforge/backend/internal/services/auth"
)

// ─── Context keys ─────────────────────────────────────────────────────────────

// Context key constants used to store and retrieve values from fiber.Ctx.Locals.
const (
	LocalsUser      = "user"
	LocalsWorkspace = "workspace"
	LocalsClaims    = "claims"
)

// ─── Constructor deps ─────────────────────────────────────────────────────────

// MiddlewareGroup holds shared dependencies for all middleware factories.
type MiddlewareGroup struct {
	Auth *authsvc.Service
	DB   *gorm.DB
	RDB  *redis.Client
	Cfg  *config.Config
	Log  *zap.Logger
}

// New constructs a MiddlewareGroup.
func New(authSvc *authsvc.Service, db *gorm.DB, rdb *redis.Client, cfg *config.Config, log *zap.Logger) *MiddlewareGroup {
	return &MiddlewareGroup{
		Auth: authSvc,
		DB:   db,
		RDB:  rdb,
		Cfg:  cfg,
		Log:  log,
	}
}

// ─── JWTAuth ──────────────────────────────────────────────────────────────────

// JWTAuth validates a Bearer JWT in the Authorization header.
// On success it sets LocalsClaims and LocalsUser in the fiber context.
// On failure it returns 401.
func (m *MiddlewareGroup) JWTAuth() fiber.Handler {
	return func(c *fiber.Ctx) error {
		tokenStr, err := extractBearerToken(c)
		if err != nil {
			return unauthorised(c, "missing or malformed Authorization header")
		}

		claims, err := m.Auth.ValidateAccessToken(tokenStr)
		if err != nil {
			return unauthorised(c, "invalid or expired access token")
		}

		// Load the user so handlers have a full model available.
		var user models.User
		if err := m.DB.WithContext(c.Context()).
			First(&user, "id = ?", claims.UserID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return unauthorised(c, "user not found")
			}
			m.Log.Error("JWTAuth: db lookup user", zap.Error(err))
			return serverError(c, "internal error")
		}

		if user.IsSuspended {
			return unauthorised(c, "account suspended")
		}

		c.Locals(LocalsClaims, claims)
		c.Locals(LocalsUser, &user)
		return c.Next()
	}
}

// ─── APIKeyAuth ───────────────────────────────────────────────────────────────

// APIKeyAuth validates the X-API-Key header against stored hashed keys.
// On success it loads the owning user and sets LocalsUser.
func (m *MiddlewareGroup) APIKeyAuth() fiber.Handler {
	return func(c *fiber.Ctx) error {
		rawKey := c.Get("X-API-Key")
		if rawKey == "" {
			return unauthorised(c, "X-API-Key header is required")
		}

		keyRecord, err := m.Auth.ValidateAPIKey(c.Context(), rawKey)
		if err != nil {
			return unauthorised(c, "invalid or inactive API key")
		}

		// Load owning user.
		var user models.User
		if err := m.DB.WithContext(c.Context()).
			First(&user, "id = ?", keyRecord.UserID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return unauthorised(c, "user not found")
			}
			m.Log.Error("APIKeyAuth: db lookup user", zap.Error(err))
			return serverError(c, "internal error")
		}

		// Resolve the workspace from the key record.
		var workspace models.Workspace
		if err := m.DB.WithContext(c.Context()).
			First(&workspace, "id = ?", keyRecord.WorkspaceID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return unauthorised(c, "workspace not found")
			}
			m.Log.Error("APIKeyAuth: db lookup workspace", zap.Error(err))
			return serverError(c, "internal error")
		}

		c.Locals(LocalsUser, &user)
		c.Locals(LocalsWorkspace, &workspace)
		return c.Next()
	}
}

// ─── WorkspaceAuth ────────────────────────────────────────────────────────────

// WorkspaceAuth resolves the :workspaceId URL parameter to a Workspace record
// and verifies that the authenticated user is a member.
// Must be used after JWTAuth or APIKeyAuth.
func (m *MiddlewareGroup) WorkspaceAuth() fiber.Handler {
	return func(c *fiber.Ctx) error {
		rawID := c.Params("workspaceId")
		if rawID == "" {
			return badRequest(c, "workspaceId parameter is required")
		}

		workspaceID, err := uuid.Parse(rawID)
		if err != nil {
			return badRequest(c, "workspaceId must be a valid UUID")
		}

		user, ok := c.Locals(LocalsUser).(*models.User)
		if !ok || user == nil {
			return unauthorised(c, "authentication required")
		}

		var workspace models.Workspace
		if err := m.DB.WithContext(c.Context()).
			First(&workspace, "id = ?", workspaceID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return notFound(c, "workspace not found")
			}
			m.Log.Error("WorkspaceAuth: db lookup workspace", zap.Error(err))
			return serverError(c, "internal error")
		}

		// Verify membership.
		var member models.WorkspaceMember
		err = m.DB.WithContext(c.Context()).
			Where("workspace_id = ? AND user_id = ?", workspaceID, user.ID).
			First(&member).Error
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return forbidden(c, "you are not a member of this workspace")
			}
			m.Log.Error("WorkspaceAuth: db lookup member", zap.Error(err))
			return serverError(c, "internal error")
		}

		c.Locals(LocalsWorkspace, &workspace)
		return c.Next()
	}
}

// ─── RequireRole ──────────────────────────────────────────────────────────────

// RequireRole returns a middleware that enforces a minimum workspace role.
// Roles are ordered: viewer < editor < admin < owner.
// Must be used after WorkspaceAuth.
func (m *MiddlewareGroup) RequireRole(minRole models.WorkspaceRole) fiber.Handler {
	return func(c *fiber.Ctx) error {
		workspace, ok := c.Locals(LocalsWorkspace).(*models.Workspace)
		if !ok || workspace == nil {
			return unauthorised(c, "workspace context not found")
		}
		user, ok := c.Locals(LocalsUser).(*models.User)
		if !ok || user == nil {
			return unauthorised(c, "user context not found")
		}

		var member models.WorkspaceMember
		if err := m.DB.WithContext(c.Context()).
			Where("workspace_id = ? AND user_id = ?", workspace.ID, user.ID).
			First(&member).Error; err != nil {
			return forbidden(c, "membership not found")
		}

		if roleLevel(member.Role) < roleLevel(minRole) {
			return forbidden(c, fmt.Sprintf("role %q required, you have %q", minRole, member.Role))
		}

		return c.Next()
	}
}

// roleLevel maps WorkspaceRole to an integer for ordering comparisons.
func roleLevel(r models.WorkspaceRole) int {
	switch r {
	case models.WorkspaceRoleOwner:
		return 4
	case models.WorkspaceRoleAdmin:
		return 3
	case models.WorkspaceRoleEditor:
		return 2
	case models.WorkspaceRoleViewer:
		return 1
	default:
		return 0
	}
}

// ─── RequireSuperAdmin ────────────────────────────────────────────────────────

// RequireSuperAdmin enforces that the authenticated user has is_super_admin = true.
// Must be used after JWTAuth. Any non-super-admin receives 403 Forbidden.
// Suspended accounts are also rejected even if they hold the flag.
func (m *MiddlewareGroup) RequireSuperAdmin() fiber.Handler {
	return func(c *fiber.Ctx) error {
		user, ok := c.Locals(LocalsUser).(*models.User)
		if !ok || user == nil {
			return unauthorised(c, "authentication required")
		}
		if user.IsSuspended {
			return forbidden(c, "account suspended")
		}
		if !user.IsSuperAdmin {
			return forbidden(c, "platform admin access required")
		}
		return c.Next()
	}
}

// ─── RateLimiter ─────────────────────────────────────────────────────────────

// RateLimiterConfig holds settings for the Redis-backed rate limiter.
type RateLimiterConfig struct {
	// Max number of requests allowed within the window.
	Max int
	// Duration of the sliding window.
	Window time.Duration
	// KeyFn returns the limiting key for the current request.
	// Defaults to per-IP limiting if nil.
	KeyFn func(c *fiber.Ctx) string
}

// RateLimiter returns a sliding-window rate limiter backed by Redis.
// It combines per-IP and (when authenticated) per-user buckets.
func (m *MiddlewareGroup) RateLimiter(cfg RateLimiterConfig) fiber.Handler {
	if cfg.Max == 0 {
		cfg.Max = 100
	}
	if cfg.Window == 0 {
		cfg.Window = time.Minute
	}

	keyFn := cfg.KeyFn
	if keyFn == nil {
		keyFn = func(c *fiber.Ctx) string {
			return "rl:ip:" + c.IP()
		}
	}

	return func(c *fiber.Ctx) error {
		keys := []string{keyFn(c)}

		// If the user is authenticated, also apply a per-user bucket.
		if user, ok := c.Locals(LocalsUser).(*models.User); ok && user != nil {
			keys = append(keys, "rl:user:"+user.ID.String())
		}

		for _, key := range keys {
			allowed, remaining, resetAt, err := m.slidingWindowCheck(c.Context(), key, cfg.Max, cfg.Window)
			if err != nil {
				m.Log.Warn("rate limiter redis error", zap.Error(err), zap.String("key", key))
				// Fail open on Redis errors.
				continue
			}

			c.Set("X-RateLimit-Limit", fmt.Sprintf("%d", cfg.Max))
			c.Set("X-RateLimit-Remaining", fmt.Sprintf("%d", remaining))
			c.Set("X-RateLimit-Reset", fmt.Sprintf("%d", resetAt.Unix()))

			if !allowed {
				c.Set("Retry-After", fmt.Sprintf("%d", int(time.Until(resetAt).Seconds())+1))
				return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
					"error":       "rate limit exceeded",
					"retry_after": int(time.Until(resetAt).Seconds()) + 1,
				})
			}
		}

		return c.Next()
	}
}

// slidingWindowCheck implements a Redis-based sliding window counter.
// Returns (allowed, remaining, resetAt, error).
func (m *MiddlewareGroup) slidingWindowCheck(
	ctx context.Context,
	key string,
	max int,
	window time.Duration,
) (allowed bool, remaining int, resetAt time.Time, err error) {
	now := time.Now()
	windowStart := now.Add(-window)
	resetAt = now.Add(window)

	pipe := m.RDB.Pipeline()

	// Remove expired entries.
	pipe.ZRemRangeByScore(ctx, key, "0", fmt.Sprintf("%d", windowStart.UnixMilli()))

	// Count current entries.
	countCmd := pipe.ZCard(ctx, key)

	// Add the current request.
	pipe.ZAdd(ctx, key, redis.Z{
		Score:  float64(now.UnixMilli()),
		Member: fmt.Sprintf("%d", now.UnixNano()),
	})

	// Set TTL on the key.
	pipe.Expire(ctx, key, window+time.Second)

	if _, err = pipe.Exec(ctx); err != nil {
		return false, 0, resetAt, fmt.Errorf("redis pipeline: %w", err)
	}

	count := int(countCmd.Val())
	remaining = max - count - 1
	if remaining < 0 {
		remaining = 0
	}

	if count >= max {
		return false, 0, resetAt, nil
	}

	return true, remaining, resetAt, nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func extractBearerToken(c *fiber.Ctx) (string, error) {
	auth := c.Get("Authorization")
	if auth == "" {
		return "", errors.New("Authorization header missing")
	}
	parts := strings.SplitN(auth, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return "", errors.New("Authorization header must be 'Bearer <token>'")
	}
	if parts[1] == "" {
		return "", errors.New("bearer token is empty")
	}
	return parts[1], nil
}

// ─── Standard JSON error responses ────────────────────────────────────────────

func unauthorised(c *fiber.Ctx, msg string) error {
	return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
		"error": msg,
	})
}

func forbidden(c *fiber.Ctx, msg string) error {
	return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
		"error": msg,
	})
}

func notFound(c *fiber.Ctx, msg string) error {
	return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
		"error": msg,
	})
}

func badRequest(c *fiber.Ctx, msg string) error {
	return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
		"error": msg,
	})
}

func serverError(c *fiber.Ctx, msg string) error {
	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
		"error": msg,
	})
}
