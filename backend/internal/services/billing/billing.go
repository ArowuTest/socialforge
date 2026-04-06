// Package billing provides Stripe-backed subscription and usage management for
// SocialForge workspaces.
package billing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/stripe/stripe-go/v76"
	stripeportal "github.com/stripe/stripe-go/v76/billingportal/session"
	stripecheckout "github.com/stripe/stripe-go/v76/checkout/session"
	stripecustomer "github.com/stripe/stripe-go/v76/customer"
	stripesub "github.com/stripe/stripe-go/v76/subscription"
	stripewebhook "github.com/stripe/stripe-go/v76/webhook"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/config"
	"github.com/socialforge/backend/internal/models"
	"github.com/socialforge/backend/internal/repository"
)

// ─── Errors ───────────────────────────────────────────────────────────────────

var (
	ErrNoStripeCustomer  = errors.New("user has no stripe customer ID")
	ErrNoSubscription    = errors.New("workspace has no active subscription")
	ErrInvalidWebhookSig = errors.New("invalid stripe webhook signature")
	ErrWorkspaceNotFound = errors.New("workspace not found")
	ErrUserNotFound      = errors.New("user not found")
)

// ─── UsageResponse ────────────────────────────────────────────────────────────

// UsageResponse carries current-period usage figures for a workspace.
type UsageResponse struct {
	CreditsUsed       int `json:"credits_used"`
	CreditsTotal      int `json:"credits_total"`
	AccountsConnected int `json:"accounts_connected"`
	AccountsMax       int `json:"accounts_max"`
	PostsThisMonth    int `json:"posts_this_month"`
}

// ─── Service ──────────────────────────────────────────────────────────────────

// Service handles all Stripe billing operations.
type Service struct {
	stripeKey string
	cfg       *config.Config
	repos     *repository.Container
	db        *gorm.DB
	log       *zap.Logger
	rdb       *redis.Client
}

// NewService constructs a billing Service and configures the Stripe SDK.
func NewService(cfg *config.Config, repos *repository.Container, db *gorm.DB, log *zap.Logger, rdb *redis.Client) *Service {
	stripe.Key = cfg.Stripe.SecretKey
	return &Service{
		stripeKey: cfg.Stripe.SecretKey,
		cfg:       cfg,
		repos:     repos,
		db:        db,
		log:       log.Named("billing"),
		rdb:       rdb,
	}
}

// ─── CreateCheckoutSession ────────────────────────────────────────────────────

// CreateCheckoutSession creates (or retrieves) a Stripe customer for the user,
// then opens a subscription checkout session and returns its URL.
func (s *Service) CreateCheckoutSession(
	ctx context.Context,
	userID, workspaceID uuid.UUID,
	priceID string,
) (string, error) {
	// Load user via repository.
	user, err := s.repos.Users.GetByID(ctx, userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", ErrUserNotFound
		}
		return "", fmt.Errorf("load user: %w", err)
	}

	// Ensure the user has a Stripe customer ID.
	customerID, err := s.ensureStripeCustomer(ctx, user)
	if err != nil {
		return "", fmt.Errorf("ensure stripe customer: %w", err)
	}

	frontendURL := s.cfg.App.FrontendURL
	params := &stripe.CheckoutSessionParams{
		Mode: stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				Price:    stripe.String(priceID),
				Quantity: stripe.Int64(1),
			},
		},
		Customer:   stripe.String(customerID),
		SuccessURL: stripe.String(frontendURL + "/settings/billing?success=true&session_id={CHECKOUT_SESSION_ID}"),
		CancelURL:  stripe.String(frontendURL + "/settings/billing"),
	}
	params.AddMetadata("user_id", userID.String())
	params.AddMetadata("workspace_id", workspaceID.String())

	cs, err := stripecheckout.New(params)
	if err != nil {
		s.log.Error("stripe: create checkout session", zap.Error(err))
		return "", fmt.Errorf("stripe checkout session: %w", err)
	}

	s.log.Info("checkout session created",
		zap.String("user_id", userID.String()),
		zap.String("workspace_id", workspaceID.String()),
		zap.String("price_id", priceID),
	)

	return cs.URL, nil
}

// ─── CreatePortalSession ──────────────────────────────────────────────────────

// CreatePortalSession creates a Stripe billing portal session for the user and
// returns its URL so they can manage their subscription directly.
func (s *Service) CreatePortalSession(ctx context.Context, userID uuid.UUID) (string, error) {
	user, err := s.repos.Users.GetByID(ctx, userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", ErrUserNotFound
		}
		return "", fmt.Errorf("load user: %w", err)
	}

	if user.StripeCustomerID == "" {
		return "", ErrNoStripeCustomer
	}

	params := &stripe.BillingPortalSessionParams{
		Customer:  stripe.String(user.StripeCustomerID),
		ReturnURL: stripe.String(s.cfg.App.FrontendURL + "/settings/billing"),
	}

	ps, err := stripeportal.New(params)
	if err != nil {
		s.log.Error("stripe: create portal session", zap.Error(err))
		return "", fmt.Errorf("stripe portal session: %w", err)
	}

	s.log.Info("portal session created", zap.String("user_id", userID.String()))
	return ps.URL, nil
}

// ─── HandleWebhook ────────────────────────────────────────────────────────────

// HandleWebhook verifies the Stripe webhook signature, parses the event, and
// dispatches to the appropriate handler. It is safe to call from multiple
// goroutines.
func (s *Service) HandleWebhook(ctx context.Context, payload []byte, sig string) error {
	event, err := stripewebhook.ConstructEvent(payload, sig, s.cfg.Stripe.WebhookSecret)
	if err != nil {
		s.log.Warn("stripe: invalid webhook signature", zap.Error(err))
		return ErrInvalidWebhookSig
	}

	s.log.Info("stripe webhook received", zap.String("type", string(event.Type)))

	switch event.Type {

	case "checkout.session.completed":
		var cs stripe.CheckoutSession
		if err := json.Unmarshal(event.Data.Raw, &cs); err != nil {
			return fmt.Errorf("parse checkout.session.completed: %w", err)
		}
		return s.handleCheckoutCompleted(ctx, &cs)

	case "customer.subscription.updated":
		var sub stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
			return fmt.Errorf("parse customer.subscription.updated: %w", err)
		}
		return s.handleSubscriptionUpdated(ctx, &sub)

	case "customer.subscription.deleted":
		var sub stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
			return fmt.Errorf("parse customer.subscription.deleted: %w", err)
		}
		return s.handleSubscriptionDeleted(ctx, &sub)

	case "invoice.payment_failed":
		var inv stripe.Invoice
		if err := json.Unmarshal(event.Data.Raw, &inv); err != nil {
			return fmt.Errorf("parse invoice.payment_failed: %w", err)
		}
		return s.handleInvoicePaymentFailed(ctx, &inv)

	default:
		s.log.Debug("stripe webhook: unhandled event type", zap.String("type", string(event.Type)))
	}

	return nil
}

// ─── GetUsage ─────────────────────────────────────────────────────────────────

// GetUsage returns the current month's usage figures for the given workspace.
func (s *Service) GetUsage(ctx context.Context, workspaceID uuid.UUID) (*UsageResponse, error) {
	workspace, err := s.repos.Workspaces.GetByID(ctx, workspaceID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrWorkspaceNotFound
		}
		return nil, fmt.Errorf("load workspace: %w", err)
	}

	// Credits used this month via AI jobs.
	creditsUsed, err := s.repos.AIJobs.SumCreditsByWorkspaceThisMonth(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("sum ai credits: %w", err)
	}

	// Count connected social accounts.
	accounts, err := s.repos.SocialAccounts.ListByWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list social accounts: %w", err)
	}
	accountsConnected := len(accounts)

	// Count posts created/published this calendar month (UTC).
	postsThisMonth, err := s.repos.Analytics.GetPostsThisMonth(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("get posts this month: %w", err)
	}

	limits := GetLimits(workspace.Plan)

	return &UsageResponse{
		CreditsUsed:       creditsUsed,
		CreditsTotal:      limits.AICreditsMonthly,
		AccountsConnected: accountsConnected,
		AccountsMax:       limits.MaxSocialAccounts,
		PostsThisMonth:    int(postsThisMonth),
	}, nil
}

// ─── internal webhook handlers ────────────────────────────────────────────────

func (s *Service) handleCheckoutCompleted(ctx context.Context, cs *stripe.CheckoutSession) error {
	// Handle credit top-up checkout sessions.
	if topupIDStr, ok := cs.Metadata["topup_id"]; ok && topupIDStr != "" {
		topupID, err := uuid.Parse(topupIDStr)
		if err != nil {
			return fmt.Errorf("handleCheckoutCompleted: invalid topup_id: %w", err)
		}
		s.log.Info("stripe checkout: applying credit top-up", zap.String("topup_id", topupIDStr))
		return s.ApplyCreditTopUp(ctx, topupID)
	}

	userIDStr := cs.Metadata["user_id"]
	workspaceIDStr := cs.Metadata["workspace_id"]

	if userIDStr == "" {
		s.log.Warn("handleCheckoutCompleted: missing user_id metadata")
		return nil
	}

	var subscriptionID string
	if cs.Subscription != nil {
		subscriptionID = cs.Subscription.ID
	}

	// Determine plan from the subscription's price.
	var plan models.PlanType = models.PlanStarter
	if subscriptionID != "" {
		sub, err := stripesub.Get(subscriptionID, nil)
		if err == nil && len(sub.Items.Data) > 0 && sub.Items.Data[0].Price != nil {
			plan = s.priceIDToPlan(sub.Items.Data[0].Price.ID)
		}
	}

	customerID := ""
	if cs.Customer != nil {
		customerID = cs.Customer.ID
	}

	updates := map[string]interface{}{
		"plan":                   plan,
		"subscription_status":    string(models.SubscriptionStatusActive),
		"stripe_subscription_id": subscriptionID,
	}
	if customerID != "" {
		updates["stripe_customer_id"] = customerID
	}

	// Update user.
	if err := s.db.WithContext(ctx).Model(&models.User{}).
		Where("id = ?", userIDStr).
		Updates(updates).Error; err != nil {
		s.log.Error("handleCheckoutCompleted: update user", zap.Error(err))
		return fmt.Errorf("update user: %w", err)
	}

	// Update workspace (by ID if provided, otherwise by owner).
	wsQuery := s.db.WithContext(ctx).Model(&models.Workspace{})
	if workspaceIDStr != "" {
		wsQuery = wsQuery.Where("id = ?", workspaceIDStr)
	} else {
		wsQuery = wsQuery.Where("owner_id = ?", userIDStr)
	}
	if err := wsQuery.Updates(updates).Error; err != nil {
		s.log.Error("handleCheckoutCompleted: update workspace", zap.Error(err))
		return fmt.Errorf("update workspace: %w", err)
	}

	s.log.Info("subscription activated",
		zap.String("user_id", userIDStr),
		zap.String("plan", string(plan)),
		zap.String("subscription_id", subscriptionID),
	)
	return nil
}

func (s *Service) handleSubscriptionUpdated(ctx context.Context, sub *stripe.Subscription) error {
	if sub.Customer == nil {
		return nil
	}
	customerID := sub.Customer.ID

	var plan models.PlanType = models.PlanStarter
	if len(sub.Items.Data) > 0 && sub.Items.Data[0].Price != nil {
		plan = s.priceIDToPlan(sub.Items.Data[0].Price.ID)
	}

	periodStart := time.Unix(sub.CurrentPeriodStart, 0).UTC()
	periodEnd := time.Unix(sub.CurrentPeriodEnd, 0).UTC()

	updates := map[string]interface{}{
		"plan":                 plan,
		"subscription_status":  string(sub.Status),
		"current_period_start": periodStart,
		"current_period_end":   periodEnd,
	}

	if err := s.db.WithContext(ctx).Model(&models.User{}).
		Where("stripe_customer_id = ?", customerID).
		Updates(updates).Error; err != nil {
		s.log.Error("handleSubscriptionUpdated: update user", zap.Error(err))
		return fmt.Errorf("update user: %w", err)
	}

	if err := s.db.WithContext(ctx).Model(&models.Workspace{}).
		Where("stripe_customer_id = ?", customerID).
		Updates(updates).Error; err != nil {
		s.log.Error("handleSubscriptionUpdated: update workspace", zap.Error(err))
		return fmt.Errorf("update workspace: %w", err)
	}

	s.log.Info("subscription updated",
		zap.String("customer_id", customerID),
		zap.String("plan", string(plan)),
		zap.String("status", string(sub.Status)),
	)
	return nil
}

func (s *Service) handleSubscriptionDeleted(ctx context.Context, sub *stripe.Subscription) error {
	if sub.Customer == nil {
		return nil
	}
	customerID := sub.Customer.ID

	updates := map[string]interface{}{
		"plan":                string(models.PlanFree),
		"subscription_status": string(models.SubscriptionStatusCanceled),
	}

	if err := s.db.WithContext(ctx).Model(&models.User{}).
		Where("stripe_customer_id = ?", customerID).
		Updates(updates).Error; err != nil {
		s.log.Error("handleSubscriptionDeleted: update user", zap.Error(err))
		return fmt.Errorf("update user: %w", err)
	}

	if err := s.db.WithContext(ctx).Model(&models.Workspace{}).
		Where("stripe_customer_id = ?", customerID).
		Updates(updates).Error; err != nil {
		s.log.Error("handleSubscriptionDeleted: update workspace", zap.Error(err))
		return fmt.Errorf("update workspace: %w", err)
	}

	s.log.Info("subscription canceled — downgraded to free",
		zap.String("customer_id", customerID),
	)
	return nil
}

func (s *Service) handleInvoicePaymentFailed(ctx context.Context, inv *stripe.Invoice) error {
	if inv.Customer == nil {
		return nil
	}
	customerID := inv.Customer.ID

	updates := map[string]interface{}{
		"subscription_status": string(models.SubscriptionStatusPastDue),
	}

	if err := s.db.WithContext(ctx).Model(&models.User{}).
		Where("stripe_customer_id = ?", customerID).
		Updates(updates).Error; err != nil {
		s.log.Error("handleInvoicePaymentFailed: update user", zap.Error(err))
		return fmt.Errorf("update user: %w", err)
	}

	if err := s.db.WithContext(ctx).Model(&models.Workspace{}).
		Where("stripe_customer_id = ?", customerID).
		Updates(updates).Error; err != nil {
		s.log.Error("handleInvoicePaymentFailed: update workspace", zap.Error(err))
		return fmt.Errorf("update workspace: %w", err)
	}

	s.log.Warn("invoice payment failed — status set to past_due",
		zap.String("customer_id", customerID),
	)
	return nil
}

// ─── ensureStripeCustomer ─────────────────────────────────────────────────────

// ensureStripeCustomer returns the user's existing Stripe customer ID, or
// creates a new Stripe Customer and persists the ID to the DB.
func (s *Service) ensureStripeCustomer(ctx context.Context, user *models.User) (string, error) {
	if user.StripeCustomerID != "" {
		return user.StripeCustomerID, nil
	}

	params := &stripe.CustomerParams{
		Email: stripe.String(user.Email),
		Name:  stripe.String(user.Name),
	}
	params.AddMetadata("user_id", user.ID.String())

	cust, err := stripecustomer.New(params)
	if err != nil {
		return "", fmt.Errorf("stripe create customer: %w", err)
	}

	// Persist to DB.
	if err := s.db.WithContext(ctx).Model(user).
		Update("stripe_customer_id", cust.ID).Error; err != nil {
		// Non-fatal — the customer was created in Stripe; we can reconcile later.
		s.log.Error("ensureStripeCustomer: save customer ID", zap.Error(err))
	} else {
		user.StripeCustomerID = cust.ID
	}

	s.log.Info("stripe customer created",
		zap.String("user_id", user.ID.String()),
		zap.String("customer_id", cust.ID),
	)
	return cust.ID, nil
}

// ─── priceIDToPlan ────────────────────────────────────────────────────────────

// priceIDToPlan maps a Stripe price ID to the corresponding SocialForge plan.
// Falls back to PlanFree for unknown price IDs.
func (s *Service) priceIDToPlan(priceID string) models.PlanType {
	p := s.cfg.Stripe.Prices
	switch priceID {
	case p.StarterMonthly, p.StarterYearly:
		return models.PlanStarter
	case p.ProMonthly, p.ProYearly:
		return models.PlanPro
	case p.AgencyMonthly, p.AgencyYearly:
		return models.PlanAgency
	default:
		s.log.Warn("priceIDToPlan: unknown price ID — defaulting to free",
			zap.String("price_id", priceID),
		)
		return models.PlanFree
	}
}

// ─── Credit top-up methods ────────────────────────────────────────────────────

// USDCostMap is the actual provider USD cost per AI job type.
var USDCostMap = map[string]float64{
	"caption":   0.005,
	"hashtags":  0.003,
	"carousel":  0.010,
	"analyse":   0.005,
	"repurpose": 0.015,
	"image":     0.030,
	"video":     0.200,
}

// TopUpSessionResponse is returned when initiating a credit purchase.
type TopUpSessionResponse struct {
	Provider    string `json:"provider"`
	CheckoutURL string `json:"checkout_url"`
	Reference   string `json:"reference,omitempty"`
}

// CreateCreditTopUpSession creates a Stripe or Paystack checkout depending on currency.
func (s *Service) CreateCreditTopUpSession(ctx context.Context, userID, workspaceID uuid.UUID, packageID, currency, email string) (*TopUpSessionResponse, error) {
	pkg, ok := PackageByID(packageID, currency)
	if !ok {
		return nil, fmt.Errorf("unknown package: %s", packageID)
	}

	// Create a pending topup record.
	rate := NGNPerUSD
	topup := &models.CreditTopUp{
		WorkspaceID:      workspaceID,
		UserID:           userID,
		Credits:          pkg.Credits,
		USDAmount:        pkg.PriceUSD,
		Currency:         currency,
		AmountInCurrency: pkg.PriceUSD,
		Status:           models.TopUpPending,
	}

	if currency == "NGN" {
		topup.Provider = models.ProviderPaystack
		topup.AmountInCurrency = pkg.PriceUSD * NGNPerUSD
		topup.ExchangeRate = &rate
	} else {
		topup.Provider = models.ProviderStripe
	}

	if err := s.db.WithContext(ctx).Create(topup).Error; err != nil {
		return nil, fmt.Errorf("create topup record: %w", err)
	}

	if currency == "NGN" {
		checkoutURL, ref, err := s.InitializePaystackTransaction(ctx, topup.ID, email, pkg)
		if err != nil {
			return nil, err
		}
		// Store provider ref.
		s.db.WithContext(ctx).Model(topup).Update("provider_ref", ref)
		return &TopUpSessionResponse{
			Provider:    "paystack",
			CheckoutURL: checkoutURL,
			Reference:   ref,
		}, nil
	}

	// Stripe checkout.
	checkoutURL, err := s.createStripeTopUpSession(ctx, topup, pkg, email)
	if err != nil {
		return nil, err
	}
	return &TopUpSessionResponse{
		Provider:    "stripe",
		CheckoutURL: checkoutURL,
	}, nil
}

// createStripeTopUpSession creates a Stripe payment checkout for credit top-ups.
func (s *Service) createStripeTopUpSession(ctx context.Context, topup *models.CreditTopUp, pkg CreditPackage, email string) (string, error) {
	params := &stripe.CheckoutSessionParams{
		Mode:          stripe.String(string(stripe.CheckoutSessionModePayment)),
		CustomerEmail: stripe.String(email),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				PriceData: &stripe.CheckoutSessionLineItemPriceDataParams{
					Currency: stripe.String("usd"),
					ProductData: &stripe.CheckoutSessionLineItemPriceDataProductDataParams{
						Name:        stripe.String(fmt.Sprintf("%d AI Credits", pkg.Credits)),
						Description: stripe.String("SocialForge AI credit top-up"),
					},
					UnitAmount: stripe.Int64(int64(pkg.PriceUSD * 100)),
				},
				Quantity: stripe.Int64(1),
			},
		},
		SuccessURL: stripe.String(fmt.Sprintf("%s/dashboard/billing?topup=success&ref={CHECKOUT_SESSION_ID}", s.cfg.App.FrontendURL)),
		CancelURL:  stripe.String(fmt.Sprintf("%s/dashboard/billing?topup=cancelled", s.cfg.App.FrontendURL)),
		Metadata: map[string]string{
			"topup_id":   topup.ID.String(),
			"package_id": pkg.ID,
			"credits":    fmt.Sprintf("%d", pkg.Credits),
		},
	}

	sess, err := stripecheckout.New(params)
	if err != nil {
		return "", fmt.Errorf("stripe checkout session: %w", err)
	}

	// Store provider ref.
	s.db.WithContext(ctx).Model(topup).Update("provider_ref", sess.ID)
	return sess.URL, nil
}

// ApplyCreditTopUp atomically credits a workspace after payment confirmation.
func (s *Service) ApplyCreditTopUp(ctx context.Context, topupID uuid.UUID) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var topup models.CreditTopUp
		if err := tx.Set("gorm:query_option", "FOR UPDATE").
			First(&topup, "id = ?", topupID).Error; err != nil {
			return fmt.Errorf("lock topup: %w", err)
		}
		if topup.Status != models.TopUpPending {
			return nil // idempotent
		}

		// Credit the workspace.
		var ws models.Workspace
		if err := tx.Set("gorm:query_option", "FOR UPDATE").
			First(&ws, "id = ?", topup.WorkspaceID).Error; err != nil {
			return fmt.Errorf("lock workspace: %w", err)
		}
		newBalance := ws.CreditBalance + topup.Credits

		if err := tx.Model(&ws).Update("credit_balance", newBalance).Error; err != nil {
			return fmt.Errorf("update credit balance: %w", err)
		}
		if err := tx.Model(&topup).Update("status", models.TopUpCompleted).Error; err != nil {
			return fmt.Errorf("update topup status: %w", err)
		}

		usdAmt := topup.USDAmount
		entry := models.CreditLedger{
			WorkspaceID:  topup.WorkspaceID,
			UserID:       &topup.UserID,
			EntryType:    models.LedgerTopUp,
			Credits:      topup.Credits,
			BalanceAfter: newBalance,
			USDAmount:    &usdAmt,
			Currency:     topup.Currency,
			ExchangeRate: topup.ExchangeRate,
			Provider:     string(topup.Provider),
			ProviderRef:  topup.ProviderRef,
		}
		return tx.Create(&entry).Error
	})
}

// GetCreditBalance returns the workspace's current credit balance and monthly AI cost.
func (s *Service) GetCreditBalance(ctx context.Context, workspaceID uuid.UUID) (map[string]interface{}, error) {
	var ws models.Workspace
	if err := s.db.WithContext(ctx).Select("credit_balance, ai_credits_used, ai_credits_limit").
		First(&ws, "id = ?", workspaceID).Error; err != nil {
		return nil, err
	}

	var monthlyCost float64
	s.db.WithContext(ctx).Model(&models.AIJob{}).
		Where("workspace_id = ? AND created_at >= date_trunc('month', NOW())", workspaceID).
		Select("COALESCE(SUM(usd_cost), 0)").
		Scan(&monthlyCost)

	return map[string]interface{}{
		"credit_balance":     ws.CreditBalance,
		"plan_credits_used":  ws.AICreditsUsed,
		"plan_credits_limit": ws.AICreditsLimit,
		"monthly_usd_cost":   monthlyCost,
	}, nil
}

// GetCreditLedger returns paginated ledger entries for a workspace.
func (s *Service) GetCreditLedger(ctx context.Context, workspaceID uuid.UUID, limit, offset int) ([]models.CreditLedger, int64, error) {
	var entries []models.CreditLedger
	var count int64
	q := s.db.WithContext(ctx).Where("workspace_id = ?", workspaceID)
	q.Model(&models.CreditLedger{}).Count(&count)
	err := q.Order("created_at DESC").Limit(limit).Offset(offset).Find(&entries).Error
	return entries, count, err
}
