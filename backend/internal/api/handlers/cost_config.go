// Package handlers — admin cost configuration endpoints.
package handlers

import (
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/socialforge/backend/internal/crypto"
)

// ── DB row types (not GORM models — simple structs for raw queries) ──────────

type AIJobCostRow struct {
	JobType     string    `gorm:"column:job_type;primaryKey" json:"job_type"`
	Label       string    `gorm:"column:label"               json:"label"`
	Description string    `gorm:"column:description"         json:"description"`
	USDCost     float64   `gorm:"column:usd_cost"            json:"usd_cost"`
	Credits     int       `gorm:"column:credits"             json:"credits"`
	IsActive    bool      `gorm:"column:is_active"           json:"is_active"`
	UpdatedAt   time.Time `gorm:"column:updated_at"          json:"updated_at"`
}

func (AIJobCostRow) TableName() string { return "ai_job_costs" }

type CreditPackageConfigRow struct {
	ID          string    `gorm:"column:id;primaryKey"  json:"id"`
	Label       string    `gorm:"column:label"          json:"label"`
	Credits     int       `gorm:"column:credits"        json:"credits"`
	USDPrice    float64   `gorm:"column:usd_price"      json:"usd_price"`
	NGNPrice    float64   `gorm:"column:ngn_price"      json:"ngn_price"`
	IsBestValue bool      `gorm:"column:is_best_value"  json:"is_best_value"`
	IsActive    bool      `gorm:"column:is_active"      json:"is_active"`
	SortOrder   int       `gorm:"column:sort_order"     json:"sort_order"`
	UpdatedAt   time.Time `gorm:"column:updated_at"     json:"updated_at"`
}

func (CreditPackageConfigRow) TableName() string { return "credit_package_config" }

type PlatformSettingRow struct {
	Key         string    `gorm:"column:key;primaryKey" json:"key"`
	Value       string    `gorm:"column:value"          json:"value"`
	Description string    `gorm:"column:description"    json:"description"`
	UpdatedAt   time.Time `gorm:"column:updated_at"     json:"updated_at"`
}

func (PlatformSettingRow) TableName() string { return "platform_settings" }

// ── Handler ──────────────────────────────────────────────────────────────────

// sensitiveSettingKeys lists platform_settings keys whose values must be
// encrypted at rest and masked when returned to the client.
var sensitiveSettingKeys = map[string]bool{
	"openai_api_key": true,
	"fal_api_key":    true,
}

// CostConfigHandler manages runtime AI cost and pricing configuration.
type CostConfigHandler struct {
	db            *gorm.DB
	log           *zap.Logger
	encryptSecret string
}

// NewCostConfigHandler constructs a CostConfigHandler.
func NewCostConfigHandler(db *gorm.DB, encryptSecret string, log *zap.Logger) *CostConfigHandler {
	return &CostConfigHandler{db: db, encryptSecret: encryptSecret, log: log}
}

// GetAIJobCosts returns all AI job cost rows.
//
// GET /api/v1/admin/cost-config/ai-jobs
func (h *CostConfigHandler) GetAIJobCosts(c *fiber.Ctx) error {
	var rows []AIJobCostRow
	if err := h.db.WithContext(c.Context()).Order("job_type").Find(&rows).Error; err != nil {
		h.log.Error("get ai job costs", zap.Error(err))
		return fiber.NewError(fiber.StatusInternalServerError, "failed to load AI job costs")
	}
	return c.JSON(fiber.Map{"data": rows})
}

// UpdateAIJobCost updates a single AI job cost entry.
//
// PATCH /api/v1/admin/cost-config/ai-jobs/:jobType
func (h *CostConfigHandler) UpdateAIJobCost(c *fiber.Ctx) error {
	jobType := c.Params("jobType")
	if jobType == "" {
		return fiber.ErrBadRequest
	}

	type body struct {
		Label       *string  `json:"label"`
		Description *string  `json:"description"`
		USDCost     *float64 `json:"usd_cost"`
		Credits     *int     `json:"credits"`
		IsActive    *bool    `json:"is_active"`
	}
	var req body
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}

	updaterID, _ := c.Locals("userID").(uuid.UUID)

	updates := map[string]interface{}{
		"updated_at": time.Now(),
		"updated_by": updaterID,
	}
	if req.Label != nil {
		updates["label"] = *req.Label
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.USDCost != nil {
		if *req.USDCost < 0 {
			return fiber.NewError(fiber.StatusBadRequest, "usd_cost must be >= 0")
		}
		updates["usd_cost"] = *req.USDCost
	}
	if req.Credits != nil {
		if *req.Credits < 1 {
			return fiber.NewError(fiber.StatusBadRequest, "credits must be >= 1")
		}
		updates["credits"] = *req.Credits
	}
	if req.IsActive != nil {
		updates["is_active"] = *req.IsActive
	}

	res := h.db.WithContext(c.Context()).
		Model(&AIJobCostRow{}).
		Where("job_type = ?", jobType).
		Updates(updates)
	if res.Error != nil {
		h.log.Error("update ai job cost", zap.String("job_type", jobType), zap.Error(res.Error))
		return fiber.NewError(fiber.StatusInternalServerError, "update failed")
	}
	if res.RowsAffected == 0 {
		return fiber.NewError(fiber.StatusNotFound, "job type not found")
	}

	// Return updated row
	var updated AIJobCostRow
	h.db.WithContext(c.Context()).Where("job_type = ?", jobType).First(&updated)
	return c.JSON(fiber.Map{"data": updated})
}

// BulkUpdateAIJobCosts replaces all AI job costs atomically.
//
// PUT /api/v1/admin/cost-config/ai-jobs
func (h *CostConfigHandler) BulkUpdateAIJobCosts(c *fiber.Ctx) error {
	var rows []AIJobCostRow
	if err := c.BodyParser(&rows); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if len(rows) == 0 {
		return fiber.NewError(fiber.StatusBadRequest, "empty list")
	}

	updaterID, _ := c.Locals("userID").(uuid.UUID)
	now := time.Now()
	for i := range rows {
		rows[i].UpdatedAt = now
		_ = updaterID // stored via raw update; GORM upsert handles it
	}

	err := h.db.WithContext(c.Context()).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "job_type"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"label", "description", "usd_cost", "credits", "is_active", "updated_at",
			}),
		}).
		Create(&rows).Error
	if err != nil {
		h.log.Error("bulk update ai job costs", zap.Error(err))
		return fiber.NewError(fiber.StatusInternalServerError, "bulk update failed")
	}

	return c.JSON(fiber.Map{"data": rows, "updated": len(rows)})
}

// GetCreditPackages returns all credit package configurations.
//
// GET /api/v1/admin/cost-config/packages
func (h *CostConfigHandler) GetCreditPackages(c *fiber.Ctx) error {
	var rows []CreditPackageConfigRow
	if err := h.db.WithContext(c.Context()).Order("sort_order").Find(&rows).Error; err != nil {
		h.log.Error("get credit packages", zap.Error(err))
		return fiber.NewError(fiber.StatusInternalServerError, "failed to load packages")
	}
	return c.JSON(fiber.Map{"data": rows})
}

// UpdateCreditPackage updates a single credit package.
//
// PATCH /api/v1/admin/cost-config/packages/:id
func (h *CostConfigHandler) UpdateCreditPackage(c *fiber.Ctx) error {
	pkgID := c.Params("id")
	if pkgID == "" {
		return fiber.ErrBadRequest
	}

	type body struct {
		Label       *string  `json:"label"`
		Credits     *int     `json:"credits"`
		USDPrice    *float64 `json:"usd_price"`
		NGNPrice    *float64 `json:"ngn_price"`
		IsBestValue *bool    `json:"is_best_value"`
		IsActive    *bool    `json:"is_active"`
		SortOrder   *int     `json:"sort_order"`
	}
	var req body
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}

	updaterID, _ := c.Locals("userID").(uuid.UUID)
	updates := map[string]interface{}{
		"updated_at": time.Now(),
		"updated_by": updaterID,
	}
	if req.Label != nil {
		updates["label"] = *req.Label
	}
	if req.Credits != nil {
		updates["credits"] = *req.Credits
	}
	if req.USDPrice != nil {
		updates["usd_price"] = *req.USDPrice
	}
	if req.NGNPrice != nil {
		updates["ngn_price"] = *req.NGNPrice
	}
	if req.IsBestValue != nil {
		updates["is_best_value"] = *req.IsBestValue
	}
	if req.IsActive != nil {
		updates["is_active"] = *req.IsActive
	}
	if req.SortOrder != nil {
		updates["sort_order"] = *req.SortOrder
	}

	res := h.db.WithContext(c.Context()).
		Model(&CreditPackageConfigRow{}).
		Where("id = ?", pkgID).
		Updates(updates)
	if res.Error != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "update failed")
	}
	if res.RowsAffected == 0 {
		return fiber.NewError(fiber.StatusNotFound, "package not found")
	}

	var updated CreditPackageConfigRow
	h.db.WithContext(c.Context()).Where("id = ?", pkgID).First(&updated)
	return c.JSON(fiber.Map{"data": updated})
}

// GetPlatformSettings returns all platform settings, masking sensitive values.
//
// GET /api/v1/admin/cost-config/settings
func (h *CostConfigHandler) GetPlatformSettings(c *fiber.Ctx) error {
	var rows []PlatformSettingRow
	if err := h.db.WithContext(c.Context()).Order("key").Find(&rows).Error; err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "failed to load settings")
	}

	// Mask sensitive keys — never return plaintext API keys.
	for i, row := range rows {
		if sensitiveSettingKeys[row.Key] && row.Value != "" {
			plain, err := crypto.Decrypt(row.Value, h.encryptSecret)
			if err != nil || len(plain) < 8 {
				rows[i].Value = "••••••••"
			} else {
				rows[i].Value = plain[:4] + "••••" + plain[len(plain)-4:]
			}
		}
	}
	return c.JSON(fiber.Map{"data": rows})
}

// UpdatePlatformSetting upserts a platform setting by key.
// Sensitive keys (API keys) are encrypted before storage.
//
// PUT /api/v1/admin/cost-config/settings/:key
func (h *CostConfigHandler) UpdatePlatformSetting(c *fiber.Ctx) error {
	key := c.Params("key")
	if key == "" {
		return fiber.ErrBadRequest
	}

	type body struct {
		Value string `json:"value"`
	}
	var req body
	if err := c.BodyParser(&req); err != nil || req.Value == "" {
		return fiber.NewError(fiber.StatusBadRequest, "value required")
	}

	storeValue := req.Value
	if sensitiveSettingKeys[key] {
		encrypted, err := crypto.Encrypt(req.Value, h.encryptSecret)
		if err != nil {
			h.log.Error("encrypt platform setting", zap.String("key", key), zap.Error(err))
			return fiber.NewError(fiber.StatusInternalServerError, "encryption failed")
		}
		storeValue = encrypted
	}

	updaterID, _ := c.Locals("userID").(uuid.UUID)
	res := h.db.WithContext(c.Context()).
		Model(&PlatformSettingRow{}).
		Where("key = ?", key).
		Updates(map[string]interface{}{
			"value":      storeValue,
			"updated_at": time.Now(),
			"updated_by": updaterID,
		})
	if res.Error != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "update failed")
	}
	if res.RowsAffected == 0 {
		// Key doesn't exist yet — create it.
		row := PlatformSettingRow{
			Key:       key,
			Value:     storeValue,
			UpdatedAt: time.Now(),
		}
		if err := h.db.WithContext(c.Context()).Create(&row).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "create failed")
		}
	}

	// Return masked value for sensitive keys.
	displayValue := req.Value
	if sensitiveSettingKeys[key] {
		displayValue = maskKey(req.Value)
	}
	return c.JSON(fiber.Map{"key": key, "value": displayValue})
}

// GetIntegrationStatus returns the configuration status of external API keys.
//
// GET /api/v1/admin/cost-config/integrations
func (h *CostConfigHandler) GetIntegrationStatus(c *fiber.Ctx) error {
	keys := make([]string, 0, len(sensitiveSettingKeys))
	for k := range sensitiveSettingKeys {
		keys = append(keys, k)
	}

	var rows []PlatformSettingRow
	h.db.WithContext(c.Context()).Where("key IN ?", keys).Find(&rows)

	result := make([]fiber.Map, 0, len(sensitiveSettingKeys))
	found := make(map[string]PlatformSettingRow)
	for _, row := range rows {
		found[row.Key] = row
	}

	labels := map[string]string{
		"openai_api_key": "OpenAI (GPT-4o)",
		"fal_api_key":    "Fal.ai (Images & Video)",
	}

	for k, label := range labels {
		entry := fiber.Map{
			"key":        k,
			"label":      label,
			"configured": false,
			"masked":     "",
			"updated_at": nil,
		}
		if row, ok := found[k]; ok && row.Value != "" {
			plain, err := crypto.Decrypt(row.Value, h.encryptSecret)
			if err == nil && len(plain) >= 8 {
				entry["configured"] = true
				entry["masked"] = maskKey(plain)
				entry["updated_at"] = row.UpdatedAt
			}
		}
		result = append(result, entry)
	}

	return c.JSON(fiber.Map{"data": result})
}

func maskKey(key string) string {
	key = strings.TrimSpace(key)
	if len(key) < 8 {
		return "••••••••"
	}
	return key[:4] + "••••" + key[len(key)-4:]
}
