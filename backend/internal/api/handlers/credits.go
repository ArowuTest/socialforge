package handlers

import (
	"fmt"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/socialforge/backend/internal/api/middleware"
	"github.com/socialforge/backend/internal/models"
	billingsvc "github.com/socialforge/backend/internal/services/billing"
)

// creditPackageConfigRow is the DB row for a credit package (mirrors credit_package_config).
type creditPackageConfigRow struct {
	ID          string  `gorm:"column:id"`
	Label       string  `gorm:"column:label"`
	Credits     int     `gorm:"column:credits"`
	USDPrice    float64 `gorm:"column:usd_price"`
	NGNPrice    float64 `gorm:"column:ngn_price"`
	IsBestValue bool    `gorm:"column:is_best_value"`
	SortOrder   int     `gorm:"column:sort_order"`
}

// GetCreditPackages returns available credit top-up packages based on the caller's IP.
// It reads from the credit_package_config DB table first; falls back to hardcoded values
// when the table is empty (e.g. fresh install before the admin has seeded packages).
//
// An optional ?currency=NGN|USD query param overrides the IP-detected currency
// (used by the frontend's manual currency toggle).
func (h *BillingHandler) GetCreditPackages(c *fiber.Ctx) error {
	currency := billingsvc.DetectCurrency(c.Context(), c.IP(), h.rdb, nil)
	if override := c.Query("currency"); override == "NGN" || override == "USD" {
		currency = override
	}
	isNGN := currency == "NGN"

	var rows []creditPackageConfigRow
	h.db.WithContext(c.Context()).
		Table("credit_package_config").
		Where("is_active = true").
		Order("sort_order ASC").
		Find(&rows)

	if len(rows) > 0 {
		type pkg struct {
			ID           string  `json:"id"`
			Label        string  `json:"label"`
			Credits      int     `json:"credits"`
			PriceUSD     float64 `json:"price_usd"`
			DisplayPrice string  `json:"display_price"`
			Currency     string  `json:"currency"`
			BestValue    bool    `json:"best_value,omitempty"`
		}
		packages := make([]pkg, 0, len(rows))
		for _, r := range rows {
			var displayPrice string
			if isNGN {
				displayPrice = "₦" + formatNGN(r.NGNPrice)
			} else {
				displayPrice = fmt.Sprintf("$%.0f", r.USDPrice)
			}
			packages = append(packages, pkg{
				ID:           r.ID,
				Label:        r.Label,
				Credits:      r.Credits,
				PriceUSD:     r.USDPrice,
				DisplayPrice: displayPrice,
				Currency:     currency,
				BestValue:    r.IsBestValue,
			})
		}
		return c.JSON(fiber.Map{"currency": currency, "packages": packages})
	}

	// Fallback: hardcoded packages (used when table is empty).
	packages := billingsvc.CreditPackages(currency)
	return c.JSON(fiber.Map{
		"currency": currency,
		"packages": packages,
	})
}

// formatNGN formats a float64 Naira price as a comma-separated integer string.
func formatNGN(price float64) string {
	n := int64(price)
	s := fmt.Sprintf("%d", n)
	// Insert commas every 3 digits from the right.
	result := ""
	for i, ch := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			result += ","
		}
		result += string(ch)
	}
	return result
}

// InitiateCreditTopUp creates a Stripe or Paystack checkout session.
func (h *BillingHandler) InitiateCreditTopUp(c *fiber.Ctx) error {
	wid, err := uuid.Parse(c.Params("workspaceId"))
	if err != nil {
		return fiber.ErrBadRequest
	}

	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "not authenticated")
	}

	type body struct {
		PackageID string `json:"package_id"`
	}
	var req body
	if err := c.BodyParser(&req); err != nil || req.PackageID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "package_id required")
	}

	currency := billingsvc.DetectCurrency(c.Context(), c.IP(), h.rdb, nil)

	sess, err := h.svc.CreateCreditTopUpSession(c.Context(), user.ID, wid, req.PackageID, currency, user.Email)
	if err != nil {
		h.log.Error("create credit topup session", zap.Error(err))
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	writeAudit(c, h.db, h.log, wid, "credits.topup_initiated", "credit_package", req.PackageID, map[string]any{
		"package_id": req.PackageID,
		"currency":   currency,
	})

	return c.JSON(sess)
}

// PaystackWebhook handles Paystack webhook events.
func (h *BillingHandler) PaystackWebhook(c *fiber.Ctx) error {
	signature := c.Get("X-Paystack-Signature")
	bodyLen := len(c.Body())
	if err := h.svc.HandlePaystackWebhook(c.Context(), c.Body(), signature); err != nil {
		h.log.Error("paystack webhook", zap.Error(err))
		writeAuditAs(c, h.db, h.log, uuid.Nil, uuid.Nil, "payment.webhook_failed", "paystack_webhook", "", map[string]any{
			"error":     err.Error(),
			"body_size": bodyLen,
		})
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	writeAuditAs(c, h.db, h.log, uuid.Nil, uuid.Nil, "payment.webhook_received", "paystack_webhook", "", map[string]any{
		"provider":  "paystack",
		"body_size": bodyLen,
	})
	return c.SendStatus(fiber.StatusOK)
}

// GetCreditBalance returns the workspace's credit balance and monthly cost.
func (h *BillingHandler) GetCreditBalance(c *fiber.Ctx) error {
	wid, err := uuid.Parse(c.Params("workspaceId"))
	if err != nil {
		return fiber.ErrBadRequest
	}
	data, err := h.svc.GetCreditBalance(c.Context(), wid)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": data})
}

// GetCreditLedger returns paginated credit ledger entries.
func (h *BillingHandler) GetCreditLedger(c *fiber.Ctx) error {
	wid, err := uuid.Parse(c.Params("workspaceId"))
	if err != nil {
		return fiber.ErrBadRequest
	}
	limit := c.QueryInt("limit", 20)
	offset := c.QueryInt("offset", 0)
	if limit > 100 {
		limit = 100
	}

	entries, total, err := h.svc.GetCreditLedger(c.Context(), wid, limit, offset)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{
		"data":   entries,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}
