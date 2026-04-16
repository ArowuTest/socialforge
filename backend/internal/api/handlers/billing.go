package handlers

import (
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
// GET /api/v1/billing/plans
func (h *BillingHandler) GetPlans(c *fiber.Ctx) error {
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
				MaxSocialAccounts: 2,
				MaxScheduledPosts: 10,
				AICreditsPerMonth: 10,
				MaxTeamMembers:    1,
				CanWhiteLabel:     false,
			},
			Features: []string{
				"2 social accounts",
				"10 scheduled posts/month",
				"10 AI credits/month",
				"Basic analytics",
			},
		},
		{
			ID:           "starter",
			Name:         "Starter",
			Description:  "For creators and small businesses growing their presence.",
			MonthlyPrice: 29,
			YearlyPrice:  290,
			Limits: models.PlanLimits{
				MaxWorkspaces:     1,
				MaxSocialAccounts: 20,
				MaxScheduledPosts: 500,
				AICreditsPerMonth: 1250,
				MaxTeamMembers:    5,
				CanWhiteLabel:     false,
			},
			Features: []string{
				"20 social accounts",
				"500 scheduled posts/month",
				"1,250 AI credits/month",
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
			MonthlyPrice: 79,
			YearlyPrice:  790,
			Limits: models.PlanLimits{
				MaxWorkspaces:     5,
				MaxSocialAccounts: 40,
				MaxScheduledPosts: 2000,
				AICreditsPerMonth: 5000,
				MaxTeamMembers:    15,
				CanWhiteLabel:     false,
			},
			Features: []string{
				"40 social accounts",
				"2,000 scheduled posts/month",
				"5,000 AI credits/month",
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
			MonthlyPrice: 199,
			YearlyPrice:  1990,
			Limits: models.PlanLimits{
				MaxWorkspaces:     999,
				MaxSocialAccounts: 999,
				MaxScheduledPosts: 50000,
				AICreditsPerMonth: 28000,
				MaxTeamMembers:    100,
				CanWhiteLabel:     true,
			},
			Features: []string{
				"Unlimited social accounts",
				"Unlimited scheduled posts",
				"28,000 AI credits/month",
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
	PriceID string `json:"price_id"`
}

// CreateSubscription creates a Stripe Checkout session via the billing service.
// POST /api/v1/billing/subscribe
func (h *BillingHandler) CreateSubscription(c *fiber.Ctx) error {
	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "not authenticated")
	}

	var req createSubscriptionRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	if req.PriceID == "" {
		return badRequest(c, "price_id is required", "VALIDATION_ERROR")
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
