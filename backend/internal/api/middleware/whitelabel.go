package middleware

import (
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/models"
)

const (
	LocalsWhitelabelWorkspace = "whitelabel_workspace"
	socialforgeBaseDomain     = "socialforge.io"
)

// WhitelabelResolver is a middleware that inspects the Host header.
// If it matches a workspace's custom_domain OR the pattern <slug>.socialforge.io,
// it loads that workspace and stores it in fiber context locals.
// Requests to the main app domain pass through without a workspace set.
func (m *MiddlewareGroup) WhitelabelResolver() fiber.Handler {
	return func(c *fiber.Ctx) error {
		host := c.Hostname() // strips port if present

		if host == "" {
			return c.Next()
		}

		// Strip trailing dot (some DNS tooling adds it).
		host = strings.TrimSuffix(host, ".")

		var workspace models.Workspace
		var found bool

		// Check slug subdomain pattern: <slug>.socialforge.io
		if strings.HasSuffix(host, "."+socialforgeBaseDomain) {
			slug := strings.TrimSuffix(host, "."+socialforgeBaseDomain)
			if slug != "" && slug != "www" && slug != "api" {
				err := m.DB.WithContext(c.Context()).
					Where("slug = ?", slug).
					First(&workspace).Error
				if err == nil {
					found = true
				} else if err != gorm.ErrRecordNotFound {
					m.Log.Warn("WhitelabelResolver: db lookup by slug", zap.Error(err), zap.String("slug", slug))
				}
			}
		}

		// Check custom domain (takes priority if both match somehow).
		if !found {
			err := m.DB.WithContext(c.Context()).
				Where("custom_domain = ?", host).
				First(&workspace).Error
			if err == nil {
				found = true
			} else if err != gorm.ErrRecordNotFound {
				m.Log.Warn("WhitelabelResolver: db lookup by custom_domain", zap.Error(err), zap.String("host", host))
			}
		}

		if found {
			c.Locals(LocalsWhitelabelWorkspace, &workspace)
			m.Log.Debug("whitelabel workspace resolved",
				zap.String("host", host),
				zap.String("workspace_id", workspace.ID.String()),
				zap.String("workspace_slug", workspace.Slug),
			)
		}

		return c.Next()
	}
}

// RequireWhitelabel returns a 403 if the resolved workspace does not have
// white-label enabled on their plan. Must run after WhitelabelResolver.
func (m *MiddlewareGroup) RequireWhitelabel() fiber.Handler {
	return func(c *fiber.Ctx) error {
		ws, ok := c.Locals(LocalsWhitelabelWorkspace).(*models.Workspace)
		if !ok || ws == nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "white-label access not configured for this domain",
				"code":  "WHITELABEL_NOT_CONFIGURED",
			})
		}

		if !ws.IsWhitelabel {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": fmt.Sprintf("workspace %q does not have white-label enabled", ws.Slug),
				"code":  "WHITELABEL_NOT_ENABLED",
			})
		}

		// Verify the workspace's plan supports white-label.
		limits := planLimits(ws.Plan)
		if !limits.CanWhiteLabel {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "white-label requires an Agency plan",
				"code":  "PLAN_UPGRADE_REQUIRED",
			})
		}

		return c.Next()
	}
}

// planLimits returns the PlanLimits for the given plan tier.
// This mirrors the billing handler's plan definitions without importing it.
func planLimits(plan models.PlanType) models.PlanLimits {
	switch plan {
	case models.PlanAgency:
		return models.PlanLimits{
			MaxWorkspaces:     50,
			MaxSocialAccounts: 100,
			MaxScheduledPosts: 10000,
			AICreditsPerMonth: 2000,
			MaxTeamMembers:    25,
			CanWhiteLabel:     true,
		}
	case models.PlanPro:
		return models.PlanLimits{
			MaxWorkspaces:     5,
			MaxSocialAccounts: 25,
			MaxScheduledPosts: 1000,
			AICreditsPerMonth: 500,
			MaxTeamMembers:    10,
			CanWhiteLabel:     false,
		}
	case models.PlanStarter:
		return models.PlanLimits{
			MaxWorkspaces:     1,
			MaxSocialAccounts: 5,
			MaxScheduledPosts: 100,
			AICreditsPerMonth: 100,
			MaxTeamMembers:    3,
			CanWhiteLabel:     false,
		}
	default: // free
		return models.PlanLimits{
			MaxWorkspaces:     1,
			MaxSocialAccounts: 2,
			MaxScheduledPosts: 10,
			AICreditsPerMonth: 10,
			MaxTeamMembers:    1,
			CanWhiteLabel:     false,
		}
	}
}
