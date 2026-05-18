package handlers

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/api/middleware"
	"github.com/socialforge/backend/internal/models"
	billingsvc "github.com/socialforge/backend/internal/services/billing"
)

// BillingHandler handles billing and Stripe webhook endpoints.
type BillingHandler struct {
	billing *billingsvc.Service
	svc     *billingsvc.Service
	db      *gorm.DB
	rdb     *redis.Client
	log     *zap.Logger
}

// NewBillingHandler creates a new BillingHandler backed by the billing service.
func NewBillingHandler(billing *billingsvc.Service, log *zap.Logger, rdb *redis.Client, db *gorm.DB) *BillingHandler {
	return &BillingHandler{
		billing: billing,
		svc:     billing,
		db:      db,
		rdb:     rdb,
		log:     log.Named("billing_handler"),
	}
}

// ── Plan definitions ──────────────────────────────────────────────────────────

// GetPlans returns all available billing plans.
// Prices and per-plan limits are read from the platform_settings table so the
// platform admin can update them without a redeployment.  Hard-coded values are
// used as safe defaults when the corresponding key is absent from the DB.
//
// GET /api/v1/billing/plans
func (h *BillingHandler) GetPlans(c *fiber.Ctx) error {
	// ── Read relevant platform_settings rows ───────────────────────────────────
	type kv struct {
		Key   string `gorm:"column:key"`
		Value string `gorm:"column:value"`
	}
	var rows []kv
	h.db.WithContext(c.Context()).
		Raw(`SELECT key, value FROM platform_settings
		     WHERE key LIKE 'plan_%' OR key LIKE 'max_accounts_%'`).
		Scan(&rows)

	setting := make(map[string]string, len(rows))
	for _, r := range rows {
		setting[r.Key] = r.Value
	}

	// intSetting returns the int stored under key, or def if absent/invalid.
	intSetting := func(key string, def int) int {
		if v, ok := setting[key]; ok {
			if n, err := strconv.Atoi(v); err == nil && n > 0 {
				return n
			}
		}
		return def
	}
	// floatSetting returns the float64 stored under key, or def if absent/invalid.
	floatSetting := func(key string, def float64) float64 {
		if v, ok := setting[key]; ok {
			if f, err := strconv.ParseFloat(v, 64); err == nil && f >= 0 {
				return f
			}
		}
		return def
	}

	// ── Build plan list ────────────────────────────────────────────────────────
	starterAccounts := intSetting("max_accounts_starter", 20)
	proAccounts     := intSetting("max_accounts_pro", 40)
	agencyAccounts  := intSetting("max_accounts_agency", 999)
	freeAccounts    := intSetting("max_accounts_free", 2)

	starterCredits := intSetting("plan_credits_starter", 1250)
	proCredits     := intSetting("plan_credits_pro", 5000)
	agencyCredits  := intSetting("plan_credits_agency", 28000)
	freeCredits    := intSetting("plan_credits_free", 10)

	starterPosts := intSetting("plan_posts_starter", 500)
	proPosts     := intSetting("plan_posts_pro", 2000)
	agencyPosts  := intSetting("plan_posts_agency", 50000)
	freePosts    := intSetting("plan_posts_free", 10)

	starterPrice := floatSetting("plan_price_starter", 29)
	proPrice     := floatSetting("plan_price_pro", 79)
	agencyPrice  := floatSetting("plan_price_agency", 199)

	plans := []models.Plan{
		{
			ID:             "free",
			Name:           "Free",
			Description:    "Get started with social media management at no cost.",
			MonthlyPrice:   0,
			YearlyPrice:    0,
			MonthlyPriceID: "",
			YearlyPriceID:  "",
			Limits: models.PlanLimits{
				MaxWorkspaces:     1,
				MaxSocialAccounts: freeAccounts,
				MaxScheduledPosts: freePosts,
				AICreditsPerMonth: freeCredits,
				MaxTeamMembers:    1,
				CanWhiteLabel:     false,
			},
			Features: []string{
				strconv.Itoa(freeAccounts) + " social accounts",
				strconv.Itoa(freePosts) + " scheduled posts/month",
				strconv.Itoa(freeCredits) + " AI credits/month",
				"Basic analytics",
			},
		},
		{
			ID:           "starter",
			Name:         "Starter",
			Description:  "For creators and small businesses growing their presence.",
			MonthlyPrice: starterPrice,
			YearlyPrice:  floatSetting("plan_price_starter_yearly", starterPrice*10),
			Limits: models.PlanLimits{
				MaxWorkspaces:     1,
				MaxSocialAccounts: starterAccounts,
				MaxScheduledPosts: starterPosts,
				AICreditsPerMonth: starterCredits,
				MaxTeamMembers:    5,
				CanWhiteLabel:     false,
			},
			Features: []string{
				strconv.Itoa(starterAccounts) + " social accounts",
				strconv.Itoa(starterPosts) + " scheduled posts/month",
				strconv.Itoa(starterCredits) + " AI credits/month",
				"Advanced analytics",
				"5 team members",
				"API access",
				"Priority support",
			},
		},
		{
			ID:           "pro",
			Name:         "Pro",
			Description:  "For marketing teams that need powerful automation.",
			MonthlyPrice: proPrice,
			YearlyPrice:  floatSetting("plan_price_pro_yearly", proPrice*10),
			Limits: models.PlanLimits{
				MaxWorkspaces:     5,
				MaxSocialAccounts: proAccounts,
				MaxScheduledPosts: proPosts,
				AICreditsPerMonth: proCredits,
				MaxTeamMembers:    15,
				CanWhiteLabel:     false,
			},
			Features: []string{
				strconv.Itoa(proAccounts) + " social accounts",
				strconv.Itoa(proPosts) + " scheduled posts/month",
				strconv.Itoa(proCredits) + " AI credits/month",
				"Advanced analytics & reports",
				"15 team members",
				"5 workspaces",
				"API access",
				"Priority support",
			},
		},
		{
			ID:           "agency",
			Name:         "Agency",
			Description:  "For agencies managing multiple clients with white-label options.",
			MonthlyPrice: agencyPrice,
			YearlyPrice:  floatSetting("plan_price_agency_yearly", agencyPrice*10),
			Limits: models.PlanLimits{
				MaxWorkspaces:     999,
				MaxSocialAccounts: agencyAccounts,
				MaxScheduledPosts: agencyPosts,
				AICreditsPerMonth: agencyCredits,
				MaxTeamMembers:    100,
				CanWhiteLabel:     true,
			},
			Features: []string{
				"Unlimited social accounts",
				"Unlimited scheduled posts",
				strconv.Itoa(agencyCredits) + " AI credits/month",
				"Custom analytics dashboards",
				"Unlimited team members",
				"Unlimited workspaces",
				"White-label option",
				"Client management",
				"Dedicated support",
			},
		},
	}
	return c.JSON(fiber.Map{"data": plans})
}

// ── CreateSubscription ────────────────────────────────────────────────────────

type createSubscriptionRequest struct {
	PriceID  string `json:"price_id"`
	PlanType string `json:"planType"` // optional alias: pro / starter / agency
	Interval string `json:"interval"` // optional: monthly / yearly (default monthly)
	Currency string `json:"currency"` // optional: USD (default) or NGN — picks Paystack when NGN
}

// CreateSubscription creates a Stripe Checkout session via the billing service.
// POST /api/v1/billing/subscribe
//
// Accepts either:
//   - {"price_id": "<stripe_price_id>"}  (direct)
//   - {"planType": "pro", "interval": "monthly"} (resolved against platform_settings)
func (h *BillingHandler) CreateSubscription(c *fiber.Ctx) error {
	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "not authenticated")
	}

	var req createSubscriptionRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	// ── NGN / Paystack branch ─────────────────────────────────────────────
	// Currency=NGN routes the subscription through Paystack (auto-recurring
	// via Paystack Plans). Requires planType + interval; price_id is ignored.
	if strings.EqualFold(req.Currency, "NGN") {
		if req.PlanType == "" {
			return badRequest(c, "planType is required for NGN subscriptions", "VALIDATION_ERROR")
		}
		workspaceID := user.ID
		if wid := c.Params("workspaceId"); wid != "" {
			if parsed, err := uuid.Parse(wid); err == nil {
				workspaceID = parsed
			}
		}
		checkoutURL, err := h.billing.InitializePaystackSubscription(
			c.Context(), user.ID, workspaceID, req.PlanType, req.Interval, user.Email,
		)
		if err != nil {
			h.log.Error("paystack subscription init", zap.Error(err))
			return badRequest(c, err.Error(), "PAYSTACK_PLAN_NOT_CONFIGURED")
		}
		writeAudit(c, h.db, h.log, workspaceID, "subscription.checkout_initiated", "subscription", req.PlanType, map[string]any{
			"provider":  "paystack",
			"plan_type": req.PlanType,
			"interval":  req.Interval,
			"currency":  "NGN",
		})
		return c.JSON(fiber.Map{"data": fiber.Map{"checkout_url": checkoutURL, "provider": "paystack"}})
	}

	// Resolve price_id from planType + interval if not given directly.
	if req.PriceID == "" && req.PlanType != "" {
		interval := strings.ToLower(req.Interval)
		if interval == "" {
			interval = "monthly"
		}
		key := fmt.Sprintf("stripe_price_%s_%s", strings.ToLower(req.PlanType), interval)
		var val string
		h.db.WithContext(c.Context()).
			Raw(`SELECT value FROM platform_settings WHERE key = ?`, key).
			Scan(&val)
		if val == "" {
			return badRequest(c,
				fmt.Sprintf("Plan upgrades aren't fully configured yet (missing %s). Contact support to subscribe.", key),
				"STRIPE_NOT_CONFIGURED")
		}
		req.PriceID = val
	}

	if req.PriceID == "" {
		return badRequest(c, "price_id or planType is required", "VALIDATION_ERROR")
	}

	// Resolve workspace: use the workspace param if present, otherwise fall
	// back to the user's ID as a placeholder — the billing service will look
	// it up via owner_id on the webhook side.
	workspaceID := user.ID
	if wid := c.Params("workspaceId"); wid != "" {
		if parsed, err := uuid.Parse(wid); err == nil {
			workspaceID = parsed
		}
	}

	checkoutURL, err := h.billing.CreateCheckoutSession(c.Context(), user.ID, workspaceID, req.PriceID)
	if err != nil {
		h.log.Error("CreateSubscription: billing.CreateCheckoutSession", zap.Error(err))
		return internalError(c, "failed to create checkout session")
	}

	writeAudit(c, h.db, h.log, workspaceID, "subscription.checkout_initiated", "subscription", req.PriceID, map[string]any{
		"price_id": req.PriceID,
	})

	return c.JSON(fiber.Map{"data": fiber.Map{"checkout_url": checkoutURL}})
}

// resolveWorkspaceID returns the workspace ID from the route param if present,
// otherwise looks up the authenticated user's first owned workspace.
func (h *BillingHandler) resolveWorkspaceID(c *fiber.Ctx, userID uuid.UUID) (uuid.UUID, error) {
	// Prefer explicit workspace context set by WorkspaceAuth middleware.
	if ws, ok := c.Locals(middleware.LocalsWorkspace).(*models.Workspace); ok && ws != nil {
		return ws.ID, nil
	}
	// Then try the URL param.
	if wid := c.Params("workspaceId"); wid != "" {
		if parsed, err := uuid.Parse(wid); err == nil {
			return parsed, nil
		}
	}
	// Fall back to the user's first owned workspace.
	var ws models.Workspace
	if err := h.db.WithContext(c.Context()).
		Where("owner_id = ?", userID).
		Order("created_at ASC").
		First(&ws).Error; err != nil {
		return uuid.Nil, err
	}
	return ws.ID, nil
}

// ── GetSubscription ───────────────────────────────────────────────────────────

// GetSubscription returns the subscription state for the authenticated user's
// workspace. Supports both /billing/subscription and
// /workspaces/:workspaceId/billing/subscription.
// GET /api/v1/billing/subscription
func (h *BillingHandler) GetSubscription(c *fiber.Ctx) error {
	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "not authenticated")
	}

	workspaceID, err := h.resolveWorkspaceID(c, user.ID)
	if err != nil {
		h.log.Error("GetSubscription: resolve workspace", zap.Error(err))
		return internalError(c, "could not determine workspace")
	}

	sub, err := h.billing.GetSubscription(c.Context(), workspaceID)
	if err != nil {
		if err == billingsvc.ErrWorkspaceNotFound {
			return notFound(c, "workspace not found", "NOT_FOUND")
		}
		h.log.Error("GetSubscription: billing.GetSubscription", zap.Error(err))
		return internalError(c, "failed to load subscription")
	}

	return c.JSON(fiber.Map{"data": sub})
}

// ── CustomerPortal ────────────────────────────────────────────────────────────

// CustomerPortal creates a Stripe billing portal session via the billing service.
// POST /api/v1/billing/portal
func (h *BillingHandler) CustomerPortal(c *fiber.Ctx) error {
	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "not authenticated")
	}

	portalURL, err := h.billing.CreatePortalSession(c.Context(), user.ID)
	if err != nil {
		if err == billingsvc.ErrNoStripeCustomer {
			return badRequest(c, "no active subscription found", "NO_SUBSCRIPTION")
		}
		h.log.Error("CustomerPortal: billing.CreatePortalSession", zap.Error(err))
		return internalError(c, "failed to create billing portal session")
	}

	return c.JSON(fiber.Map{"data": fiber.Map{"portal_url": portalURL}})
}

// ── StripeWebhook ─────────────────────────────────────────────────────────────

// StripeWebhook handles Stripe event webhooks via the billing service.
// POST /api/v1/billing/webhook
//
// We ALWAYS log the full event body on error so failed credit grants and
// subscription updates can be reconciled manually. We still return 200 on
// internal errors (so Stripe doesn't hammer us), but the alert must fire.
func (h *BillingHandler) StripeWebhook(c *fiber.Ctx) error {
	body := c.Body()
	sig := c.Get("Stripe-Signature")

	if err := h.billing.HandleWebhook(c.Context(), body, sig); err != nil {
		if err == billingsvc.ErrInvalidWebhookSig {
			h.log.Warn("StripeWebhook: invalid signature",
				zap.Int("body_size", len(body)),
				zap.String("remote_ip", c.IP()),
			)
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "invalid webhook signature",
				"code":  "INVALID_SIGNATURE",
			})
		}
		// Critical: this is a failed Stripe webhook that will NOT be retried.
		// Must be surfaced to on-call and reconciled manually.
		h.log.Error("StripeWebhook: billing.HandleWebhook FAILED — manual reconciliation required",
			zap.Error(err),
			zap.Int("body_size", len(body)),
			zap.String("signature", sig),
			zap.String("remote_ip", c.IP()),
		)
		writeAuditAs(c, h.db, h.log, uuid.Nil, uuid.Nil, "payment.webhook_failed", "stripe_webhook", "", map[string]any{
			"error":     err.Error(),
			"body_size": len(body),
		})
	} else {
		writeAuditAs(c, h.db, h.log, uuid.Nil, uuid.Nil, "payment.webhook_received", "stripe_webhook", "", map[string]any{
			"provider":  "stripe",
			"body_size": len(body),
		})
	}

	return c.SendStatus(fiber.StatusOK)
}

// ── GetUsage ──────────────────────────────────────────────────────────────────

// GetUsage returns current plan usage for the authenticated workspace.
// GET /api/v1/billing/usage   (also callable as GET /api/v1/workspaces/:wid/billing/usage)
func (h *BillingHandler) GetUsage(c *fiber.Ctx) error {
	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "not authenticated")
	}

	workspaceID, err := h.resolveWorkspaceID(c, user.ID)
	if err != nil {
		h.log.Error("GetUsage: resolve workspace", zap.Error(err))
		return internalError(c, "could not determine workspace")
	}

	usage, err := h.billing.GetUsage(c.Context(), workspaceID)
	if err != nil {
		if err == billingsvc.ErrWorkspaceNotFound {
			return notFound(c, "workspace not found", "NOT_FOUND")
		}
		h.log.Error("GetUsage: billing.GetUsage", zap.Error(err))
		return internalError(c, "failed to load usage")
	}

	return c.JSON(fiber.Map{"data": usage})
}
