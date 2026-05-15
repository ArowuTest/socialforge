// Package billing provides Stripe-backed subscription and usage management for
// SocialForge workspaces.
package billing

import (
	"context"
	"strconv"
	"sync"
	"time"

	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/models"
)

// PlanLimits defines the feature caps for a given plan tier.
// This is the authoritative in-service limit definition used by billing logic.
// The models.PlanLimits type carries the same fields but is used for DB storage.
type PlanLimits struct {
	MaxSocialAccounts int
	AICreditsMonthly  int
	MaxWorkspaces     int
	MaxScheduledPosts int
	HasAPIAccess      bool
	HasWhitelabel     bool
	HasAnalytics      bool
}

// defaultPlanLimits holds the hardcoded fallback values used when the DB is
// unreachable or platform_settings rows are missing. These match the values
// shown on the public /billing/plans endpoint in handlers/billing.go so the
// marketing page and the quota enforcer never diverge silently.
var defaultPlanLimits = map[models.PlanType]PlanLimits{
	models.PlanFree: {
		MaxSocialAccounts: 2,
		AICreditsMonthly:  10,
		MaxWorkspaces:     1,
		MaxScheduledPosts: 10,
		HasAPIAccess:      false,
		HasWhitelabel:     false,
		HasAnalytics:      false,
	},
	models.PlanStarter: {
		MaxSocialAccounts: 20,
		AICreditsMonthly:  1250,
		MaxWorkspaces:     1,
		MaxScheduledPosts: 500,
		HasAPIAccess:      true,
		HasWhitelabel:     false,
		HasAnalytics:      true,
	},
	models.PlanPro: {
		MaxSocialAccounts: 40,
		AICreditsMonthly:  5000,
		MaxWorkspaces:     5,
		MaxScheduledPosts: 2000,
		HasAPIAccess:      true,
		HasWhitelabel:     false,
		HasAnalytics:      true,
	},
	models.PlanAgency: {
		MaxSocialAccounts: 999,
		AICreditsMonthly:  28000,
		MaxWorkspaces:     999,
		MaxScheduledPosts: 50000,
		HasAPIAccess:      true,
		HasWhitelabel:     true,
		HasAnalytics:      true,
	},
}

// PlanLimitMap is kept for backwards compatibility with callers that don't
// have a DB context. New code should use Service.LoadPlanLimits which reads
// admin-configurable overrides from platform_settings.
var PlanLimitMap = defaultPlanLimits

// ─── platform_settings-backed loader ─────────────────────────────────────────

// planLimitCache holds the merged (DB overrides + fallback defaults) limits
// for ~30 seconds to avoid hammering platform_settings on every quota check.
type planLimitCache struct {
	mu       sync.RWMutex
	loadedAt time.Time
	limits   map[models.PlanType]PlanLimits
}

var globalPlanLimitCache = &planLimitCache{}

// loadPlanLimitsFromDB reads platform_settings keys (max_accounts_<plan>,
// plan_credits_<plan>, plan_posts_<plan>, plan_workspaces_<plan>,
// plan_whitelabel_<plan>, plan_api_<plan>, plan_analytics_<plan>) and merges
// over the hardcoded defaults. Missing keys keep their default values, so the
// platform never breaks if an admin forgets to seed a setting.
func loadPlanLimitsFromDB(ctx context.Context, db *gorm.DB) map[models.PlanType]PlanLimits {
	out := make(map[models.PlanType]PlanLimits, len(defaultPlanLimits))
	for plan, def := range defaultPlanLimits {
		out[plan] = def
	}
	if db == nil {
		return out
	}

	// Pull every plan-related setting in one query.
	var rows []struct {
		Key   string
		Value string
	}
	if err := db.WithContext(ctx).
		Raw(`SELECT key, value FROM platform_settings
		     WHERE key LIKE 'max_accounts_%'
		        OR key LIKE 'plan_credits_%'
		        OR key LIKE 'plan_posts_%'
		        OR key LIKE 'plan_workspaces_%'
		        OR key LIKE 'plan_whitelabel_%'
		        OR key LIKE 'plan_api_%'
		        OR key LIKE 'plan_analytics_%'`).
		Scan(&rows).Error; err != nil {
		// Fall back to defaults silently — admin will see stale values rather
		// than a 500 response. Logged elsewhere via the GORM logger.
		return out
	}

	asInt := func(s string) (int, bool) {
		if s == "" {
			return 0, false
		}
		v, err := strconv.Atoi(s)
		if err != nil {
			return 0, false
		}
		return v, true
	}
	asBool := func(s string) (bool, bool) {
		switch s {
		case "true", "1", "yes":
			return true, true
		case "false", "0", "no":
			return false, true
		}
		return false, false
	}

	for _, r := range rows {
		// Detect which plan + which field. Suffix is always one of
		// free/starter/pro/agency.
		var plan models.PlanType
		var prefix string
		for _, p := range []models.PlanType{models.PlanFree, models.PlanStarter, models.PlanPro, models.PlanAgency} {
			suffix := "_" + string(p)
			if len(r.Key) > len(suffix) && r.Key[len(r.Key)-len(suffix):] == suffix {
				plan = p
				prefix = r.Key[:len(r.Key)-len(suffix)]
				break
			}
		}
		if plan == "" {
			continue
		}
		cur := out[plan]
		switch prefix {
		case "max_accounts":
			if v, ok := asInt(r.Value); ok {
				cur.MaxSocialAccounts = v
			}
		case "plan_credits":
			if v, ok := asInt(r.Value); ok {
				cur.AICreditsMonthly = v
			}
		case "plan_posts":
			if v, ok := asInt(r.Value); ok {
				cur.MaxScheduledPosts = v
			}
		case "plan_workspaces":
			if v, ok := asInt(r.Value); ok {
				cur.MaxWorkspaces = v
			}
		case "plan_whitelabel":
			if v, ok := asBool(r.Value); ok {
				cur.HasWhitelabel = v
			}
		case "plan_api":
			if v, ok := asBool(r.Value); ok {
				cur.HasAPIAccess = v
			}
		case "plan_analytics":
			if v, ok := asBool(r.Value); ok {
				cur.HasAnalytics = v
			}
		}
		out[plan] = cur
	}
	return out
}

// LoadPlanLimits returns the platform_settings-backed limits for the given
// plan. Results are cached for 30s to keep quota checks cheap. Use this on the
// Service so quota enforcement reflects admin edits without redeploy.
func (s *Service) LoadPlanLimits(ctx context.Context, plan models.PlanType) PlanLimits {
	globalPlanLimitCache.mu.RLock()
	fresh := time.Since(globalPlanLimitCache.loadedAt) < 30*time.Second &&
		globalPlanLimitCache.limits != nil
	cached := globalPlanLimitCache.limits
	globalPlanLimitCache.mu.RUnlock()

	if !fresh {
		loaded := loadPlanLimitsFromDB(ctx, s.db)
		globalPlanLimitCache.mu.Lock()
		globalPlanLimitCache.limits = loaded
		globalPlanLimitCache.loadedAt = time.Now()
		globalPlanLimitCache.mu.Unlock()
		cached = loaded
	}

	if l, ok := cached[plan]; ok {
		return l
	}
	return cached[models.PlanFree]
}

// InvalidatePlanLimitsCache wipes the cached limits so the next LoadPlanLimits
// call rereads from the DB. Admin handlers should call this after writing a
// new plan_* row to platform_settings.
func InvalidatePlanLimitsCache() {
	globalPlanLimitCache.mu.Lock()
	globalPlanLimitCache.limits = nil
	globalPlanLimitCache.loadedAt = time.Time{}
	globalPlanLimitCache.mu.Unlock()
}

// GetLimits returns the PlanLimits for the given plan type from the hardcoded
// fallback table. Prefer Service.LoadPlanLimits for anywhere with a DB
// context; this exists only for callers without one (e.g. tests).
//
// Deprecated: use Service.LoadPlanLimits.
func GetLimits(plan models.PlanType) PlanLimits {
	if l, ok := defaultPlanLimits[plan]; ok {
		return l
	}
	return defaultPlanLimits[models.PlanFree]
}
