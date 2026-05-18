package billing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/models"
)

// ─── Paystack subscription support ────────────────────────────────────────────
//
// Paystack's recurring-charge model centres on Plans (created once via the
// dashboard or API) and Subscriptions (created automatically when a customer
// pays via /transaction/initialize with a `plan` parameter). After the first
// successful charge Paystack auto-bills the saved card on the plan interval.
//
// Our plan codes are stored in platform_settings under the convention
//   paystack_plan_<planType>_<interval>   →   PLN_xxx
// e.g. paystack_plan_pro_monthly, paystack_plan_agency_yearly.

type paystackPlanResolution struct {
	PlanCode string
	PlanType models.PlanType
	Interval string
}

// resolvePaystackPlan looks up the Paystack plan code for a given planType /
// interval and returns it along with the canonical PlanType. Returns a clean
// error suitable for surfacing to API consumers when the admin has not yet
// configured the plan code in platform_settings.
func (s *Service) resolvePaystackPlan(ctx context.Context, planType, interval string) (*paystackPlanResolution, error) {
	planType = strings.ToLower(strings.TrimSpace(planType))
	interval = strings.ToLower(strings.TrimSpace(interval))
	if interval == "" {
		interval = "monthly"
	}

	// Validate planType against our enum.
	var canonical models.PlanType
	switch planType {
	case "starter":
		canonical = models.PlanStarter
	case "pro":
		canonical = models.PlanPro
	case "agency":
		canonical = models.PlanAgency
	default:
		return nil, fmt.Errorf("unsupported plan type %q for Paystack", planType)
	}

	key := fmt.Sprintf("paystack_plan_%s_%s", planType, interval)
	planCode := LoadStringSetting(ctx, s.db, key, "")
	if planCode == "" {
		return nil, fmt.Errorf("Paystack plan not configured (missing %s). Contact support to subscribe in NGN.", key)
	}

	return &paystackPlanResolution{
		PlanCode: planCode,
		PlanType: canonical,
		Interval: interval,
	}, nil
}

// InitializePaystackSubscription opens a Paystack hosted checkout that, on
// successful payment, creates an auto-renewing subscription tied to the
// resolved Paystack plan code. Returns the authorization URL to redirect the
// user to.
func (s *Service) InitializePaystackSubscription(
	ctx context.Context,
	userID, workspaceID uuid.UUID,
	planType, interval, email string,
) (checkoutURL string, err error) {
	plan, err := s.resolvePaystackPlan(ctx, planType, interval)
	if err != nil {
		return "", err
	}

	ref := fmt.Sprintf("sf_sub_%s_%s", workspaceID.String(), uuid.NewString()[:8])

	// Paystack will charge the plan's amount on its own — we pass amount=0 and
	// let the plan dictate price. The `plan` field is what flips this into a
	// recurring charge.
	reqBody := map[string]interface{}{
		"email":     email,
		"plan":      plan.PlanCode,
		"reference": ref,
		"metadata": map[string]interface{}{
			"kind":         "subscription",
			"workspace_id": workspaceID.String(),
			"user_id":      userID.String(),
			"plan_type":    string(plan.PlanType),
			"interval":     plan.Interval,
			"plan_code":    plan.PlanCode,
		},
		"callback_url": s.cfg.App.FrontendURL + "/settings/billing?provider=paystack&success=true",
	}

	var result paystackInitResponse
	if err := s.paystackRequest(ctx, http.MethodPost, "/transaction/initialize", reqBody, &result); err != nil {
		return "", fmt.Errorf("paystack subscription init: %w", err)
	}
	if !result.Status {
		return "", fmt.Errorf("paystack subscription init: %s", result.Message)
	}

	s.log.Info("paystack subscription checkout created",
		zap.String("user_id", userID.String()),
		zap.String("workspace_id", workspaceID.String()),
		zap.String("plan_type", string(plan.PlanType)),
		zap.String("interval", plan.Interval),
		zap.String("plan_code", plan.PlanCode),
		zap.String("reference", ref),
	)

	return result.Data.AuthorizationURL, nil
}

// applyPaystackSubscriptionCharge activates (or renews) a workspace
// subscription based on a successful Paystack charge whose metadata identifies
// it as kind=subscription. Idempotent: calling it twice for the same
// reference is a no-op after the first successful run.
func (s *Service) applyPaystackSubscriptionCharge(
	ctx context.Context,
	data *paystackVerifyResponse,
) error {
	meta := data.Data.Metadata
	wsIDStr, _ := meta["workspace_id"].(string)
	planTypeStr, _ := meta["plan_type"].(string)
	if wsIDStr == "" || planTypeStr == "" {
		return fmt.Errorf("paystack subscription: missing workspace_id or plan_type metadata")
	}
	wsID, err := uuid.Parse(wsIDStr)
	if err != nil {
		return fmt.Errorf("paystack subscription: invalid workspace_id: %w", err)
	}

	planType := models.PlanType(planTypeStr)
	updates := map[string]interface{}{
		"plan":                          planType,
		"subscription_status":           string(models.SubscriptionStatusActive),
		"paystack_last_charge_ref":      data.Data.Reference,
		"paystack_last_charged_at":      data.Data.PaidAt,
	}
	if planCode, ok := meta["plan_code"].(string); ok && planCode != "" {
		updates["paystack_plan_code"] = planCode
	}

	if err := s.db.WithContext(ctx).
		Model(&models.Workspace{}).
		Where("id = ?", wsID).
		Updates(updates).Error; err != nil {
		return fmt.Errorf("paystack subscription: update workspace: %w", err)
	}

	s.log.Info("paystack subscription activated/renewed",
		zap.String("workspace_id", wsID.String()),
		zap.String("plan", string(planType)),
		zap.String("reference", data.Data.Reference),
	)
	return nil
}

// disablePaystackSubscription downgrades a workspace to the free plan when
// Paystack reports the subscription was disabled (customer cancelled, card
// failed too many times, etc.).
func (s *Service) disablePaystackSubscription(ctx context.Context, subscriptionCode, planCode string) error {
	// Find the workspace via paystack_plan_code — workspaces store the plan
	// code of their active subscription, so we can match without a separate
	// subscription_code column.
	var ws models.Workspace
	err := s.db.WithContext(ctx).
		Where("paystack_plan_code = ? AND subscription_status = ?", planCode, string(models.SubscriptionStatusActive)).
		First(&ws).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		// Nothing to do — no active workspace on this plan code.
		s.log.Info("paystack subscription.disable: no active workspace found",
			zap.String("plan_code", planCode),
			zap.String("subscription_code", subscriptionCode))
		return nil
	}
	if err != nil {
		return fmt.Errorf("paystack subscription disable: lookup: %w", err)
	}

	if err := s.db.WithContext(ctx).
		Model(&models.Workspace{}).
		Where("id = ?", ws.ID).
		Updates(map[string]interface{}{
			"plan":                string(models.PlanFree),
			"subscription_status": string(models.SubscriptionStatusCanceled),
		}).Error; err != nil {
		return fmt.Errorf("paystack subscription disable: update: %w", err)
	}

	s.log.Info("paystack subscription canceled — downgraded to free",
		zap.String("workspace_id", ws.ID.String()))
	return nil
}

// handlePaystackSubscriptionEvent dispatches subscription-shaped webhook events.
// Exported for the HandlePaystackWebhook switch.
func (s *Service) handlePaystackSubscriptionEvent(ctx context.Context, eventType string, raw json.RawMessage) error {
	switch eventType {
	case "subscription.disable", "subscription.not_renew":
		var data struct {
			SubscriptionCode string `json:"subscription_code"`
			Plan             struct {
				PlanCode string `json:"plan_code"`
			} `json:"plan"`
		}
		if err := json.Unmarshal(raw, &data); err != nil {
			return fmt.Errorf("paystack subscription.disable unmarshal: %w", err)
		}
		return s.disablePaystackSubscription(ctx, data.SubscriptionCode, data.Plan.PlanCode)

	case "subscription.create":
		// Subscription created — the matching charge.success will activate the
		// workspace. We just log here for observability.
		s.log.Info("paystack subscription.create received (activation handled via charge.success)")
		return nil

	case "invoice.create", "invoice.payment_failed":
		// Renewal attempt — we rely on the accompanying charge.success to
		// confirm payment. invoice.payment_failed is informational; Paystack
		// will retry per the plan's retry policy and emit subscription.disable
		// after final failure.
		return nil
	}
	return nil
}
