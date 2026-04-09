package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/socialforge/backend/internal/api/middleware"
	"github.com/socialforge/backend/internal/models"
	billingsvc "github.com/socialforge/backend/internal/services/billing"
)

// GetCreditPackages returns available credit top-up packages based on the caller's IP.
func (h *BillingHandler) GetCreditPackages(c *fiber.Ctx) error {
	currency := billingsvc.DetectCurrency(c.Context(), c.IP(), h.rdb, nil)
	packages := billingsvc.CreditPackages(currency)
	return c.JSON(fiber.Map{
		"currency": currency,
		"packages": packages,
	})
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

	return c.JSON(sess)
}

// PaystackWebhook handles Paystack webhook events.
func (h *BillingHandler) PaystackWebhook(c *fiber.Ctx) error {
	signature := c.Get("X-Paystack-Signature")
	if err := h.svc.HandlePaystackWebhook(c.Context(), c.Body(), signature); err != nil {
		h.log.Error("paystack webhook", zap.Error(err))
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
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
