package handlers

import (
	"encoding/json"
	"io"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/stripe/stripe-go/v76"
	"github.com/stripe/stripe-go/v76/billingportal/session"
	"github.com/stripe/stripe-go/v76/checkout/sess"
	"github.com/stripe/stripe-go/v76/webhook"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/api/middleware"
	"github.com/socialforge/backend/internal/config"
	"github.com/socialforge/backend/internal/models"
)

// BillingHandler handles billing and Stripe webhook endpoints.
type BillingHandler struct {
	db  *gorm.DB
	cfg *config.Config
	log *zap.Logger
}

// NewBillingHandler creates a new BillingHandler.
func NewBillingHandler(db *gorm.DB, cfg *config.Config, log *zap.Logger) *BillingHandler {
	stripe.Key = cfg.Stripe.SecretKey
	return &BillingHandler{db: db, cfg: cfg, log: log.Named("billing_handler")}
}

// ── Plan definitions ──────────────────────────────────────────────────────────

func (h *BillingHandler) buildPlans() []models.Plan {
	return []models.Plan{
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
			ID:             "starter",
			Name:           "Starter",
			Description:    "For creators and small businesses growing their presence.",
			MonthlyPrice:   29,
			YearlyPrice:    290,
			MonthlyPriceID: h.cfg.Stripe.Prices.StarterMonthly,
			YearlyPriceID:  h.cfg.Stripe.Prices.StarterYearly,
			Limits: models.PlanLimits{
				MaxWorkspaces:     1,
				MaxSocialAccounts: 5,
				MaxScheduledPosts: 100,
				AICreditsPerMonth: 100,
				MaxTeamMembers:    3,
				CanWhiteLabel:     false,
			},
			Features: []string{
				"5 social accounts",
				"100 scheduled posts/month",
				"100 AI credits/month",
				"Advanced analytics",
				"3 team members",
				"Priority support",
			},
		},
		{
			ID:             "pro",
			Name:           "Pro",
			Description:    "For marketing teams that need powerful automation.",
			MonthlyPrice:   79,
			YearlyPrice:    790,
			MonthlyPriceID: h.cfg.Stripe.Prices.ProMonthly,
			YearlyPriceID:  h.cfg.Stripe.Prices.ProYearly,
			Limits: models.PlanLimits{
				MaxWorkspaces:     5,
				MaxSocialAccounts: 25,
				MaxScheduledPosts: 1000,
				AICreditsPerMonth: 500,
				MaxTeamMembers:    10,
				CanWhiteLabel:     false,
			},
			Features: []string{
				"25 social accounts",
				"1,000 scheduled posts/month",
				"500 AI credits/month",
				"Advanced analytics & reports",
				"10 team members",
				"5 workspaces",
				"API access",
				"Priority support",
			},
		},
		{
			ID:             "agency",
			Name:           "Agency",
			Description:    "For agencies managing multiple clients with white-label options.",
			MonthlyPrice:   199,
			YearlyPrice:    1990,
			MonthlyPriceID: h.cfg.Stripe.Prices.AgencyMonthly,
			YearlyPriceID:  h.cfg.Stripe.Prices.AgencyYearly,
			Limits: models.PlanLimits{
				MaxWorkspaces:     50,
				MaxSocialAccounts: 100,
				MaxScheduledPosts: 10000,
				AICreditsPerMonth: 2000,
				MaxTeamMembers:    25,
				CanWhiteLabel:     true,
			},
			Features: []string{
				"100 social accounts",
				"10,000 scheduled posts/month",
				"2,000 AI credits/month",
				"Custom analytics dashboards",
				"25 team members",
				"50 workspaces",
				"White-label option",
				"Client management",
				"Dedicated support",
			},
		},
	}
}

// ── GetPlans ──────────────────────────────────────────────────────────────────

// GetPlans returns all available billing plans.
// GET /api/v1/billing/plans
func (h *BillingHandler) GetPlans(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"data": h.buildPlans()})
}

// ── CreateSubscription ────────────────────────────────────────────────────────

type createSubscriptionRequest struct {
	PlanID   string `json:"plan_id"`
	Interval string `json:"interval"` // "monthly" | "yearly"
}

// CreateSubscription creates a Stripe Checkout session.
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

	if req.PlanID == "" {
		return badRequest(c, "plan_id is required", "VALIDATION_ERROR")
	}
	if req.Interval == "" {
		req.Interval = "monthly"
	}

	// Find the price ID for the requested plan.
	plans := h.buildPlans()
	var priceID string
	for _, p := range plans {
		if p.ID == req.PlanID {
			if req.Interval == "yearly" {
				priceID = p.YearlyPriceID
			} else {
				priceID = p.MonthlyPriceID
			}
			break
		}
	}
	if priceID == "" {
		return badRequest(c, "invalid plan_id or no Stripe price configured", "INVALID_PLAN")
	}

	// Build checkout params.
	params := &stripe.CheckoutSessionParams{
		Mode: stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				Price:    stripe.String(priceID),
				Quantity: stripe.Int64(1),
			},
		},
		SuccessURL:         stripe.String(h.cfg.App.FrontendURL + "/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}"),
		CancelURL:          stripe.String(h.cfg.App.FrontendURL + "/dashboard/billing?canceled=true"),
		CustomerEmail:      stripe.String(user.Email),
		ClientReferenceID:  stripe.String(user.ID.String()),
	}

	if user.StripeCustomerID != "" {
		params.Customer = stripe.String(user.StripeCustomerID)
		params.CustomerEmail = nil
	}

	params.AddMetadata("user_id", user.ID.String())
	params.AddMetadata("plan_id", req.PlanID)
	params.AddMetadata("interval", req.Interval)

	s, err := sess.New(params)
	if err != nil {
		h.log.Error("CreateSubscription: stripe checkout session", zap.Error(err))
		return internalError(c, "failed to create checkout session")
	}

	return c.JSON(fiber.Map{"data": fiber.Map{"checkout_url": s.URL}})
}

// ── CustomerPortal ────────────────────────────────────────────────────────────

// CustomerPortal creates a Stripe billing portal session.
// POST /api/v1/billing/portal
func (h *BillingHandler) CustomerPortal(c *fiber.Ctx) error {
	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "not authenticated")
	}

	if user.StripeCustomerID == "" {
		return badRequest(c, "no active subscription found", "NO_SUBSCRIPTION")
	}

	params := &stripe.BillingPortalSessionParams{
		Customer:  stripe.String(user.StripeCustomerID),
		ReturnURL: stripe.String(h.cfg.App.FrontendURL + "/dashboard/billing"),
	}

	s, err := session.New(params)
	if err != nil {
		h.log.Error("CustomerPortal: stripe portal session", zap.Error(err))
		return internalError(c, "failed to create billing portal session")
	}

	return c.JSON(fiber.Map{"data": fiber.Map{"portal_url": s.URL}})
}

// ── StripeWebhook ─────────────────────────────────────────────────────────────

// StripeWebhook handles Stripe event webhooks.
// POST /api/v1/billing/webhook
func (h *BillingHandler) StripeWebhook(c *fiber.Ctx) error {
	// Fiber's body parser may have consumed the body; read raw bytes.
	body := c.Body()
	sig := c.Get("Stripe-Signature")

	event, err := webhook.ConstructEvent(body, sig, h.cfg.Stripe.WebhookSecret)
	if err != nil {
		h.log.Warn("StripeWebhook: invalid signature", zap.Error(err))
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid webhook signature",
			"code":  "INVALID_SIGNATURE",
		})
	}

	h.log.Info("stripe webhook received", zap.String("type", string(event.Type)))

	switch event.Type {
	case "checkout.session.completed":
		var s stripe.CheckoutSession
		if err := json.Unmarshal(event.Data.Raw, &s); err != nil {
			h.log.Error("StripeWebhook: parse checkout.session.completed", zap.Error(err))
			return c.SendStatus(fiber.StatusOK)
		}
		h.handleCheckoutCompleted(c, &s)

	case "customer.subscription.updated":
		var sub stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
			h.log.Error("StripeWebhook: parse customer.subscription.updated", zap.Error(err))
			return c.SendStatus(fiber.StatusOK)
		}
		h.handleSubscriptionUpdated(c, &sub)

	case "customer.subscription.deleted":
		var sub stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
			h.log.Error("StripeWebhook: parse customer.subscription.deleted", zap.Error(err))
			return c.SendStatus(fiber.StatusOK)
		}
		h.handleSubscriptionDeleted(c, &sub)

	default:
		h.log.Debug("stripe webhook: unhandled event type", zap.String("type", string(event.Type)))
	}

	return c.SendStatus(fiber.StatusOK)
}

func (h *BillingHandler) handleCheckoutCompleted(c *fiber.Ctx, s *stripe.CheckoutSession) {
	userIDStr := s.Metadata["user_id"]
	planID := s.Metadata["plan_id"]
	if userIDStr == "" || planID == "" {
		h.log.Warn("handleCheckoutCompleted: missing metadata")
		return
	}

	updates := map[string]interface{}{
		"plan":                    planID,
		"stripe_subscription_id":  s.Subscription.ID,
		"subscription_status":     string(models.SubscriptionStatusActive),
	}
	if s.Customer != nil {
		updates["stripe_customer_id"] = s.Customer.ID
	}

	if err := h.db.WithContext(c.Context()).Model(&models.User{}).
		Where("id = ?", userIDStr).
		Updates(updates).Error; err != nil {
		h.log.Error("handleCheckoutCompleted: update user", zap.Error(err))
	}

	// Update workspace as well.
	h.db.WithContext(c.Context()).Model(&models.Workspace{}).
		Where("owner_id = ?", userIDStr).
		Updates(updates)

	h.log.Info("subscription activated",
		zap.String("user_id", userIDStr),
		zap.String("plan", planID),
	)
}

func (h *BillingHandler) handleSubscriptionUpdated(c *fiber.Ctx, sub *stripe.Subscription) {
	if sub.Customer == nil {
		return
	}
	customerID := sub.Customer.ID

	var planID string
	if len(sub.Items.Data) > 0 && sub.Items.Data[0].Price != nil {
		// Map price ID back to plan.
		priceID := sub.Items.Data[0].Price.ID
		for _, p := range h.buildPlans() {
			if p.MonthlyPriceID == priceID || p.YearlyPriceID == priceID {
				planID = p.ID
				break
			}
		}
	}
	if planID == "" {
		planID = "starter" // safe fallback
	}

	now := time.Unix(sub.CurrentPeriodStart, 0)
	end := time.Unix(sub.CurrentPeriodEnd, 0)

	updates := map[string]interface{}{
		"plan":                   planID,
		"subscription_status":    string(sub.Status),
		"current_period_start":   now,
		"current_period_end":     end,
	}

	h.db.WithContext(c.Context()).Model(&models.User{}).
		Where("stripe_customer_id = ?", customerID).
		Updates(updates)

	h.db.WithContext(c.Context()).Model(&models.Workspace{}).
		Where("stripe_customer_id = ?", customerID).
		Updates(updates)

	h.log.Info("subscription updated",
		zap.String("customer_id", customerID),
		zap.String("plan", planID),
		zap.String("status", string(sub.Status)),
	)
}

func (h *BillingHandler) handleSubscriptionDeleted(c *fiber.Ctx, sub *stripe.Subscription) {
	if sub.Customer == nil {
		return
	}
	customerID := sub.Customer.ID

	updates := map[string]interface{}{
		"plan":                string(models.PlanFree),
		"subscription_status": string(models.SubscriptionStatusCanceled),
	}

	h.db.WithContext(c.Context()).Model(&models.User{}).
		Where("stripe_customer_id = ?", customerID).
		Updates(updates)

	h.db.WithContext(c.Context()).Model(&models.Workspace{}).
		Where("stripe_customer_id = ?", customerID).
		Updates(updates)

	h.log.Info("subscription canceled, downgraded to free",
		zap.String("customer_id", customerID),
	)
}

// ── GetUsage ──────────────────────────────────────────────────────────────────

// GetUsage returns current plan usage for the authenticated user.
// GET /api/v1/billing/usage
func (h *BillingHandler) GetUsage(c *fiber.Ctx) error {
	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "not authenticated")
	}

	// Load primary workspace.
	var workspace models.Workspace
	if err := h.db.WithContext(c.Context()).
		Where("owner_id = ?", user.ID).
		First(&workspace).Error; err != nil {
		return internalError(c, "failed to load workspace")
	}

	// Count connected accounts.
	var accountsConnected int64
	h.db.WithContext(c.Context()).Model(&models.SocialAccount{}).
		Where("workspace_id = ?", workspace.ID).
		Count(&accountsConnected)

	// Count posts this month.
	startOfMonth := time.Now().UTC().Truncate(24 * time.Hour)
	startOfMonth = time.Date(startOfMonth.Year(), startOfMonth.Month(), 1, 0, 0, 0, 0, time.UTC)

	var postsThisMonth int64
	h.db.WithContext(c.Context()).Model(&models.Post{}).
		Where("workspace_id = ? AND created_at >= ?", workspace.ID, startOfMonth).
		Count(&postsThisMonth)

	limits := planLimitsForBilling(workspace.Plan)

	return c.JSON(fiber.Map{
		"data": fiber.Map{
			"credits_used":       workspace.AICreditsUsed,
			"credits_total":      workspace.AICreditsLimit,
			"accounts_connected": accountsConnected,
			"accounts_total":     limits.MaxSocialAccounts,
			"posts_this_month":   postsThisMonth,
			"posts_limit":        limits.MaxScheduledPosts,
			"plan":               workspace.Plan,
		},
	})
}

// planLimitsForBilling returns the limits for a plan (local copy to avoid circular dep).
func planLimitsForBilling(plan models.PlanType) models.PlanLimits {
	switch plan {
	case models.PlanAgency:
		return models.PlanLimits{MaxSocialAccounts: 100, MaxScheduledPosts: 10000, AICreditsPerMonth: 2000, MaxTeamMembers: 25, CanWhiteLabel: true}
	case models.PlanPro:
		return models.PlanLimits{MaxSocialAccounts: 25, MaxScheduledPosts: 1000, AICreditsPerMonth: 500, MaxTeamMembers: 10}
	case models.PlanStarter:
		return models.PlanLimits{MaxSocialAccounts: 5, MaxScheduledPosts: 100, AICreditsPerMonth: 100, MaxTeamMembers: 3}
	default:
		return models.PlanLimits{MaxSocialAccounts: 2, MaxScheduledPosts: 10, AICreditsPerMonth: 10, MaxTeamMembers: 1}
	}
}

// ensure io is used (needed for potential raw body reading).
var _ = io.Discard
