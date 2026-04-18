// Package billing provides Stripe-backed subscription and usage management for
// SocialForge workspaces.
package billing

import "github.com/socialforge/backend/internal/models"

// PlanLimits defines the feature caps for a given plan tier.
// This is the authoritative in-service limit definition used by billing logic.
// The models.PlanLimits type carries the same fields but is used for DB storage.
type PlanLimits struct {
	MaxSocialAccounts  int
	AICreditsMonthly   int
	MaxWorkspaces      int
	MaxScheduledPosts  int
	HasAPIAccess       bool
	HasWhitelabel      bool
	HasAnalytics       bool
}

// PlanLimitMap maps every known PlanType to its corresponding limits.
var PlanLimitMap = map[models.PlanType]PlanLimits{
	models.PlanFree: {
		MaxSocialAccounts: 2,
		AICreditsMonthly:  100,
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
		MaxScheduledPosts: 100,
		HasAPIAccess:      true,
		HasWhitelabel:     false,
		HasAnalytics:      true,
	},
	models.PlanPro: {
		MaxSocialAccounts: 40,
		AICreditsMonthly:  5000,
		MaxWorkspaces:     5,
		MaxScheduledPosts: 500,
		HasAPIAccess:      true,
		HasWhitelabel:     false,
		HasAnalytics:      true,
	},
	models.PlanAgency: {
		MaxSocialAccounts: 999,
		AICreditsMonthly:  28000,
		MaxWorkspaces:     999,
		MaxScheduledPosts: 9999,
		HasAPIAccess:      true,
		HasWhitelabel:     true,
		HasAnalytics:      true,
	},
}

// GetLimits returns the PlanLimits for the given plan type.
// Falls back to the free-plan limits for any unrecognised plan value.
func GetLimits(plan models.PlanType) PlanLimits {
	if l, ok := PlanLimitMap[plan]; ok {
		return l
	}
	return PlanLimitMap[models.PlanFree]
}
