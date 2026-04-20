package handlers

import (
	"context"
	"math"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/models"
	ai "github.com/socialforge/backend/internal/services/ai"
)

// BrandKitHandler handles brand kit CRUD endpoints.
type BrandKitHandler struct {
	db  *gorm.DB
	ai  *ai.Service
	log *zap.Logger
}

// NewBrandKitHandler creates a new BrandKitHandler.
func NewBrandKitHandler(db *gorm.DB, aiService *ai.Service, log *zap.Logger) *BrandKitHandler {
	return &BrandKitHandler{db: db, ai: aiService, log: log.Named("brand_kit_handler")}
}

// triggerWebsiteScrape asynchronously scrapes websiteURL and updates the brand
// kit record with the AI-extracted brand context. Called after create/update when
// a non-empty website_url is present.
func (h *BrandKitHandler) triggerWebsiteScrape(kitID uuid.UUID, websiteURL string) {
	go func() {
		ctx := context.Background()
		h.log.Info("BrandKit: scraping website for brand context",
			zap.String("kit_id", kitID.String()),
			zap.String("url", websiteURL),
		)
		result, err := h.ai.ScrapeBrandContext(ctx, websiteURL)
		if err != nil {
			h.log.Warn("BrandKit: website scrape failed",
				zap.String("kit_id", kitID.String()),
				zap.String("url", websiteURL),
				zap.Error(err),
			)
			return
		}

		updates := map[string]interface{}{
			"brand_description": result.BrandDescription,
		}
		// Only back-fill brand voice / target audience when the user hasn't set them yet.
		var current models.BrandKit
		if err := h.db.WithContext(ctx).Select("brand_voice", "target_audience").
			First(&current, "id = ?", kitID).Error; err == nil {
			if current.BrandVoice == "" && result.BrandVoice != "" {
				updates["brand_voice"] = result.BrandVoice
			}
			if current.TargetAudience == "" && result.TargetAudience != "" {
				updates["target_audience"] = result.TargetAudience
			}
		}

		if err := h.db.WithContext(ctx).Model(&models.BrandKit{}).
			Where("id = ?", kitID).
			Updates(updates).Error; err != nil {
			h.log.Error("BrandKit: failed to save scraped brand context",
				zap.String("kit_id", kitID.String()),
				zap.Error(err),
			)
			return
		}
		h.log.Info("BrandKit: website brand context saved",
			zap.String("kit_id", kitID.String()),
			zap.String("description_preview", func() string {
				d := result.BrandDescription
				if len(d) > 80 {
					return d[:80] + "..."
				}
				return d
			}()),
		)
	}()
}

// ─── request/response types ───────────────────────────────────────────────────

type createBrandKitRequest struct {
	Name           string             `json:"name"`
	IsDefault      bool               `json:"is_default"`
	Industry       string             `json:"industry,omitempty"`
	PrimaryColor   string             `json:"primary_color,omitempty"`
	SecondaryColor string             `json:"secondary_color,omitempty"`
	AccentColor    string             `json:"accent_color,omitempty"`
	LogoURL        string             `json:"logo_url,omitempty"`
	LogoDarkURL    string             `json:"logo_dark_url,omitempty"`
	BrandVoice     string             `json:"brand_voice,omitempty"`
	TargetAudience string             `json:"target_audience,omitempty"`
	ContentPillars models.StringSlice `json:"content_pillars,omitempty"`
	BrandHashtags  models.StringSlice `json:"brand_hashtags,omitempty"`
	Dos            models.StringSlice `json:"dos,omitempty"`
	Donts          models.StringSlice `json:"donts,omitempty"`
	ExamplePosts   models.StringSlice `json:"example_posts,omitempty"`
	CTAPreferences models.JSONMap     `json:"cta_preferences,omitempty"`
	WebsiteURL     string             `json:"website_url,omitempty"`
}

type updateBrandKitRequest struct {
	Name           *string            `json:"name,omitempty"`
	IsDefault      *bool              `json:"is_default,omitempty"`
	Industry       *string            `json:"industry,omitempty"`
	PrimaryColor   *string            `json:"primary_color,omitempty"`
	SecondaryColor *string            `json:"secondary_color,omitempty"`
	AccentColor    *string            `json:"accent_color,omitempty"`
	LogoURL        *string            `json:"logo_url,omitempty"`
	LogoDarkURL    *string            `json:"logo_dark_url,omitempty"`
	BrandVoice     *string            `json:"brand_voice,omitempty"`
	TargetAudience *string            `json:"target_audience,omitempty"`
	ContentPillars models.StringSlice `json:"content_pillars,omitempty"`
	BrandHashtags  models.StringSlice `json:"brand_hashtags,omitempty"`
	Dos            models.StringSlice `json:"dos,omitempty"`
	Donts          models.StringSlice `json:"donts,omitempty"`
	ExamplePosts   models.StringSlice `json:"example_posts,omitempty"`
	CTAPreferences models.JSONMap     `json:"cta_preferences,omitempty"`
	WebsiteURL     *string            `json:"website_url,omitempty"`
}

// ─── ListBrandKits ────────────────────────────────────────────────────────────

// ListBrandKits returns all brand kits for the workspace, ordered by is_default DESC, created_at DESC.
// GET /api/v1/workspaces/:workspaceId/brand-kits
func (h *BrandKitHandler) ListBrandKits(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 20)
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	var brandKits []models.BrandKit
	var total int64

	base := h.db.WithContext(c.Context()).Model(&models.BrandKit{}).
		Where("workspace_id = ?", wid)

	if err := base.Count(&total).Error; err != nil {
		h.log.Error("ListBrandKits: count", zap.Error(err))
		return internalError(c, "failed to list brand kits")
	}

	if err := base.Order("is_default DESC, created_at DESC").Offset(offset).Limit(limit).
		Find(&brandKits).Error; err != nil {
		h.log.Error("ListBrandKits: find", zap.Error(err))
		return internalError(c, "failed to list brand kits")
	}

	totalPages := int(math.Ceil(float64(total) / float64(limit)))

	return c.JSON(fiber.Map{
		"data": brandKits,
		"meta": fiber.Map{
			"total":       total,
			"page":        page,
			"limit":       limit,
			"total_pages": totalPages,
		},
	})
}

// ─── CreateBrandKit ───────────────────────────────────────────────────────────

// CreateBrandKit creates a new brand kit.
// POST /api/v1/workspaces/:workspaceId/brand-kits
func (h *BrandKitHandler) CreateBrandKit(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	user := currentUser(c)
	if user == nil {
		return unauthorised(c, "not authenticated")
	}

	var req createBrandKitRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	if req.Name == "" {
		return badRequest(c, "name is required", "VALIDATION_ERROR")
	}

	// Initialise nil slices/maps with their zero values.
	if req.ContentPillars == nil {
		req.ContentPillars = models.StringSlice{}
	}
	if req.BrandHashtags == nil {
		req.BrandHashtags = models.StringSlice{}
	}
	if req.Dos == nil {
		req.Dos = models.StringSlice{}
	}
	if req.Donts == nil {
		req.Donts = models.StringSlice{}
	}
	if req.ExamplePosts == nil {
		req.ExamplePosts = models.StringSlice{}
	}
	if req.CTAPreferences == nil {
		req.CTAPreferences = models.JSONMap{}
	}

	kit := models.BrandKit{
		WorkspaceID:    wid,
		CreatedBy:      user.ID,
		Name:           req.Name,
		IsDefault:      req.IsDefault,
		Industry:       req.Industry,
		PrimaryColor:   req.PrimaryColor,
		SecondaryColor: req.SecondaryColor,
		AccentColor:    req.AccentColor,
		LogoURL:        req.LogoURL,
		LogoDarkURL:    req.LogoDarkURL,
		BrandVoice:     req.BrandVoice,
		TargetAudience: req.TargetAudience,
		ContentPillars: req.ContentPillars,
		BrandHashtags:  req.BrandHashtags,
		Dos:            req.Dos,
		Donts:          req.Donts,
		ExamplePosts:   req.ExamplePosts,
		CTAPreferences: req.CTAPreferences,
		WebsiteURL:     req.WebsiteURL,
	}

	if err := h.db.WithContext(c.Context()).Transaction(func(tx *gorm.DB) error {
		// If this kit should be the default, clear existing defaults first.
		if kit.IsDefault {
			if err := tx.Model(&models.BrandKit{}).
				Where("workspace_id = ? AND is_default = true", wid).
				Update("is_default", false).Error; err != nil {
				return err
			}
		}
		return tx.Create(&kit).Error
	}); err != nil {
		h.log.Error("CreateBrandKit: create", zap.Error(err))
		return internalError(c, "failed to create brand kit")
	}

	// Trigger async website scrape when a URL is provided.
	if kit.WebsiteURL != "" && h.ai != nil {
		h.triggerWebsiteScrape(kit.ID, kit.WebsiteURL)
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": kit})
}

// ─── GetBrandKit ──────────────────────────────────────────────────────────────

// GetBrandKit returns a single brand kit by ID.
// GET /api/v1/workspaces/:workspaceId/brand-kits/:id
func (h *BrandKitHandler) GetBrandKit(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "brand kit id must be a valid UUID", "INVALID_ID")
	}

	var kit models.BrandKit
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", id, wid).
		First(&kit).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "brand kit not found", "NOT_FOUND")
		}
		h.log.Error("GetBrandKit: find", zap.Error(err))
		return internalError(c, "failed to get brand kit")
	}

	return c.JSON(fiber.Map{"data": kit})
}

// ─── UpdateBrandKit ───────────────────────────────────────────────────────────

// UpdateBrandKit partially updates a brand kit.
// PATCH /api/v1/workspaces/:workspaceId/brand-kits/:id
func (h *BrandKitHandler) UpdateBrandKit(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "brand kit id must be a valid UUID", "INVALID_ID")
	}

	var req updateBrandKitRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	var kit models.BrandKit
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", id, wid).
		First(&kit).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "brand kit not found", "NOT_FOUND")
		}
		h.log.Error("UpdateBrandKit: find", zap.Error(err))
		return internalError(c, "failed to update brand kit")
	}

	updates := map[string]interface{}{}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.IsDefault != nil {
		updates["is_default"] = *req.IsDefault
	}
	if req.Industry != nil {
		updates["industry"] = *req.Industry
	}
	if req.PrimaryColor != nil {
		updates["primary_color"] = *req.PrimaryColor
	}
	if req.SecondaryColor != nil {
		updates["secondary_color"] = *req.SecondaryColor
	}
	if req.AccentColor != nil {
		updates["accent_color"] = *req.AccentColor
	}
	if req.LogoURL != nil {
		updates["logo_url"] = *req.LogoURL
	}
	if req.LogoDarkURL != nil {
		updates["logo_dark_url"] = *req.LogoDarkURL
	}
	if req.BrandVoice != nil {
		updates["brand_voice"] = *req.BrandVoice
	}
	if req.TargetAudience != nil {
		updates["target_audience"] = *req.TargetAudience
	}
	if req.ContentPillars != nil {
		updates["content_pillars"] = req.ContentPillars
	}
	if req.BrandHashtags != nil {
		updates["brand_hashtags"] = req.BrandHashtags
	}
	if req.Dos != nil {
		updates["dos"] = req.Dos
	}
	if req.Donts != nil {
		updates["donts"] = req.Donts
	}
	if req.ExamplePosts != nil {
		updates["example_posts"] = req.ExamplePosts
	}
	if req.CTAPreferences != nil {
		updates["cta_preferences"] = req.CTAPreferences
	}
	if req.WebsiteURL != nil {
		updates["website_url"] = *req.WebsiteURL
		// Clear stale brand_description so it gets re-extracted for the new URL.
		if *req.WebsiteURL != kit.WebsiteURL {
			updates["brand_description"] = ""
		}
	}

	if len(updates) == 0 {
		return c.JSON(fiber.Map{"data": kit})
	}

	settingDefault, _ := updates["is_default"].(bool)

	if err := h.db.WithContext(c.Context()).Transaction(func(tx *gorm.DB) error {
		// If setting this kit as default, clear others first.
		if settingDefault {
			if err := tx.Model(&models.BrandKit{}).
				Where("workspace_id = ? AND is_default = true AND id != ?", wid, id).
				Update("is_default", false).Error; err != nil {
				return err
			}
		}
		return tx.Model(&kit).Updates(updates).Error
	}); err != nil {
		h.log.Error("UpdateBrandKit: update", zap.Error(err))
		return internalError(c, "failed to update brand kit")
	}

	// Trigger async website scrape when URL was added or changed.
	newURL, _ := updates["website_url"].(string)
	if newURL != "" && newURL != kit.WebsiteURL && h.ai != nil {
		h.triggerWebsiteScrape(kit.ID, newURL)
	}

	return c.JSON(fiber.Map{"data": kit})
}

// ─── DeleteBrandKit ───────────────────────────────────────────────────────────

// DeleteBrandKit soft-deletes a brand kit.
// DELETE /api/v1/workspaces/:workspaceId/brand-kits/:id
func (h *BrandKitHandler) DeleteBrandKit(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "brand kit id must be a valid UUID", "INVALID_ID")
	}

	result := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", id, wid).
		Delete(&models.BrandKit{})
	if result.Error != nil {
		h.log.Error("DeleteBrandKit: delete", zap.Error(result.Error))
		return internalError(c, "failed to delete brand kit")
	}
	if result.RowsAffected == 0 {
		return notFound(c, "brand kit not found", "NOT_FOUND")
	}

	return c.SendStatus(fiber.StatusNoContent)
}

// ─── SetDefault ───────────────────────────────────────────────────────────────

// SetDefault clears all other defaults and sets this brand kit as the default.
// POST /api/v1/workspaces/:workspaceId/brand-kits/:id/set-default
func (h *BrandKitHandler) SetDefault(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "brand kit id must be a valid UUID", "INVALID_ID")
	}

	var kit models.BrandKit
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", id, wid).
		First(&kit).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "brand kit not found", "NOT_FOUND")
		}
		h.log.Error("SetDefault: find", zap.Error(err))
		return internalError(c, "failed to set default brand kit")
	}

	if err := h.db.WithContext(c.Context()).Transaction(func(tx *gorm.DB) error {
		// Clear all defaults in this workspace.
		if err := tx.Model(&models.BrandKit{}).
			Where("workspace_id = ? AND is_default = true", wid).
			Update("is_default", false).Error; err != nil {
			return err
		}
		// Set this one as default.
		return tx.Model(&kit).Update("is_default", true).Error
	}); err != nil {
		h.log.Error("SetDefault: update", zap.Error(err))
		return internalError(c, "failed to set default brand kit")
	}

	return c.JSON(fiber.Map{"data": kit})
}
