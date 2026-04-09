package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"github.com/socialforge/backend/internal/api/middleware"
	"github.com/socialforge/backend/internal/models"
	billingsvc "github.com/socialforge/backend/internal/services/billing"
)

// BillingHandler handles billing and Stripe webhook endpoints.
type BillingHandler struct {
	billing *billingsvc.Service
	svc     *billingsvc.Service
	rdb     *redis.Client
	log     *zap.Logger
}

// NewBillingHandler creates a new BillingHandler backed by the billing service.
func NewBillingHandler(billing *billingsvc.Service, log *zap.Logger, rdb *redis.Client) *BillingHandler {
	return &BillingHandler{
		billing: billing,
		svc:     billing,
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
func (h *BillingHandler) StripeWebhook(c *fiber.Ctx) error {
	body := c.Body()
	sig := c.Get("Stripe-Signature")

	if err := h.billing.HandleWebhook(c.Context(), body, sig); err != nil {
		if err == billingsvc.ErrInvalidWebhookSig {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "invalid webhook signature",
				"code":  "INVALID_SIGNATURE",
			})
		}
		h.log.Error("StripeWebhook: billing.HandleWebhook", zap.Error(err))
		// Return 200 to prevent Stripe from retrying on internal errors.
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

	// Resolve workspace ID from route param or fall back to user ID.
	workspaceID := user.ID
	if wid := c.Params("workspaceId"); wid != "" {
		if parsed, err := uuid.Parse(wid); err == nil {
			workspaceID = parsed
		}
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
