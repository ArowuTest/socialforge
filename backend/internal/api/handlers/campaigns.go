package handlers

import (
	"math"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/api/middleware"
	"github.com/socialforge/backend/internal/models"
	"github.com/socialforge/backend/internal/queue"
)

// CampaignsHandler handles campaign CRUD and action endpoints.
type CampaignsHandler struct {
	db    *gorm.DB
	asynq *asynq.Client
	log   *zap.Logger
}

// NewCampaignsHandler creates a new CampaignsHandler.
func NewCampaignsHandler(db *gorm.DB, asynqClient *asynq.Client, log *zap.Logger) *CampaignsHandler {
	return &CampaignsHandler{db: db, asynq: asynqClient, log: log.Named("campaigns_handler")}
}

// ─── request/response types ───────────────────────────────────────────────────

type createCampaignRequest struct {
	Name             string               `json:"name"`
	BrandKitID       *uuid.UUID           `json:"brand_kit_id,omitempty"`
	Goal             models.CampaignGoal  `json:"goal,omitempty"`
	Brief            string               `json:"brief,omitempty"`
	StartDate        *string              `json:"start_date,omitempty"`
	EndDate          *string              `json:"end_date,omitempty"`
	Platforms        models.StringSlice   `json:"platforms,omitempty"`
	PostingFrequency models.JSONMap       `json:"posting_frequency,omitempty"`
	ContentMix       models.JSONMap       `json:"content_mix,omitempty"`
	AutoApprove      bool                 `json:"auto_approve"`
	CreditsBudgetCap int                  `json:"credits_budget_cap,omitempty"` // 0 = no cap
	Settings         models.JSONMap       `json:"settings,omitempty"`
}

type updateCampaignRequest struct {
	Name             *string              `json:"name,omitempty"`
	BrandKitID       *uuid.UUID           `json:"brand_kit_id,omitempty"`
	Goal             *models.CampaignGoal `json:"goal,omitempty"`
	Brief            *string              `json:"brief,omitempty"`
	Platforms        models.StringSlice   `json:"platforms,omitempty"`
	PostingFrequency models.JSONMap       `json:"posting_frequency,omitempty"`
	ContentMix       models.JSONMap       `json:"content_mix,omitempty"`
	AutoApprove      *bool                `json:"auto_approve,omitempty"`
	Settings         models.JSONMap       `json:"settings,omitempty"`
}

type updateCampaignPostRequest struct {
	GeneratedCaption  *string              `json:"generated_caption,omitempty"`
	GeneratedHashtags models.StringSlice   `json:"generated_hashtags,omitempty"`
	ContentPillar     *string              `json:"content_pillar,omitempty"`
	MediaURLs         models.StringSlice   `json:"media_urls,omitempty"`
}

// ─── ListCampaigns ────────────────────────────────────────────────────────────

// ListCampaigns returns a paginated list of campaigns for the workspace.
// GET /api/v1/workspaces/:workspaceId/campaigns
func (h *CampaignsHandler) ListCampaigns(c *fiber.Ctx) error {
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

	var campaigns []models.Campaign
	var total int64

	base := h.db.WithContext(c.Context()).Model(&models.Campaign{}).
		Where("workspace_id = ?", wid)

	if status := c.Query("status"); status != "" {
		base = base.Where("status = ?", status)
	}

	if err := base.Count(&total).Error; err != nil {
		h.log.Error("ListCampaigns: count", zap.Error(err))
		return internalError(c, "failed to list campaigns")
	}

	if err := base.Order("created_at DESC").Offset(offset).Limit(limit).
		Find(&campaigns).Error; err != nil {
		h.log.Error("ListCampaigns: find", zap.Error(err))
		return internalError(c, "failed to list campaigns")
	}

	totalPages := int(math.Ceil(float64(total) / float64(limit)))

	return c.JSON(fiber.Map{
		"data": campaigns,
		"meta": fiber.Map{
			"total":       total,
			"page":        page,
			"limit":       limit,
			"total_pages": totalPages,
		},
	})
}

// ─── CreateCampaign ───────────────────────────────────────────────────────────

// CreateCampaign creates a new campaign in "draft" status.
// POST /api/v1/workspaces/:workspaceId/campaigns
func (h *CampaignsHandler) CreateCampaign(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	user := currentUser(c)
	if user == nil {
		return unauthorised(c, "not authenticated")
	}

	var req createCampaignRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	if req.Name == "" {
		return badRequest(c, "name is required", "VALIDATION_ERROR")
	}

	if req.Platforms == nil {
		req.Platforms = models.StringSlice{}
	}
	if req.PostingFrequency == nil {
		req.PostingFrequency = models.JSONMap{}
	}
	if req.ContentMix == nil {
		req.ContentMix = models.JSONMap{}
	}
	if req.Settings == nil {
		req.Settings = models.JSONMap{}
	}

	campaign := models.Campaign{
		WorkspaceID:        wid,
		BrandKitID:         req.BrandKitID,
		CreatedBy:          user.ID,
		Name:               req.Name,
		Status:             models.CampaignStatusDraft,
		Goal:               req.Goal,
		Brief:              req.Brief,
		Platforms:          req.Platforms,
		PostingFrequency:   req.PostingFrequency,
		ContentMix:         req.ContentMix,
		AutoApprove:        req.AutoApprove,
		CreditsBudgetCap:   req.CreditsBudgetCap,
		Settings:           req.Settings,
		GenerationProgress: models.JSONMap{},
	}

	if err := h.db.WithContext(c.Context()).Create(&campaign).Error; err != nil {
		h.log.Error("CreateCampaign: create", zap.Error(err))
		return internalError(c, "failed to create campaign")
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": campaign})
}

// ─── GetCampaign ──────────────────────────────────────────────────────────────

// GetCampaign returns a single campaign with its brand kit preloaded.
// GET /api/v1/workspaces/:workspaceId/campaigns/:id
func (h *CampaignsHandler) GetCampaign(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "campaign id must be a valid UUID", "INVALID_ID")
	}

	var campaign models.Campaign
	if err := h.db.WithContext(c.Context()).
		Preload("BrandKit").
		Where("id = ? AND workspace_id = ?", id, wid).
		First(&campaign).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "campaign not found", "NOT_FOUND")
		}
		h.log.Error("GetCampaign: find", zap.Error(err))
		return internalError(c, "failed to get campaign")
	}

	return c.JSON(fiber.Map{"data": campaign})
}

// ─── UpdateCampaign ───────────────────────────────────────────────────────────

// UpdateCampaign partially updates a campaign (only allowed if status=draft).
// PATCH /api/v1/workspaces/:workspaceId/campaigns/:id
func (h *CampaignsHandler) UpdateCampaign(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "campaign id must be a valid UUID", "INVALID_ID")
	}

	var req updateCampaignRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	var campaign models.Campaign
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", id, wid).
		First(&campaign).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "campaign not found", "NOT_FOUND")
		}
		h.log.Error("UpdateCampaign: find", zap.Error(err))
		return internalError(c, "failed to update campaign")
	}

	if campaign.Status != models.CampaignStatusDraft {
		return badRequest(c, "campaign can only be updated while in draft status", "INVALID_STATUS")
	}

	updates := map[string]interface{}{}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.BrandKitID != nil {
		updates["brand_kit_id"] = req.BrandKitID
	}
	if req.Goal != nil {
		updates["goal"] = *req.Goal
	}
	if req.Brief != nil {
		updates["brief"] = *req.Brief
	}
	if req.Platforms != nil {
		updates["platforms"] = req.Platforms
	}
	if req.PostingFrequency != nil {
		updates["posting_frequency"] = req.PostingFrequency
	}
	if req.ContentMix != nil {
		updates["content_mix"] = req.ContentMix
	}
	if req.AutoApprove != nil {
		updates["auto_approve"] = *req.AutoApprove
	}
	if req.Settings != nil {
		updates["settings"] = req.Settings
	}

	if len(updates) == 0 {
		return c.JSON(fiber.Map{"data": campaign})
	}

	if err := h.db.WithContext(c.Context()).Model(&campaign).Updates(updates).Error; err != nil {
		h.log.Error("UpdateCampaign: update", zap.Error(err))
		return internalError(c, "failed to update campaign")
	}

	return c.JSON(fiber.Map{"data": campaign})
}

// ─── DeleteCampaign ───────────────────────────────────────────────────────────

// DeleteCampaign soft-deletes a campaign (not allowed while running).
// DELETE /api/v1/workspaces/:workspaceId/campaigns/:id
func (h *CampaignsHandler) DeleteCampaign(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "campaign id must be a valid UUID", "INVALID_ID")
	}

	var campaign models.Campaign
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", id, wid).
		First(&campaign).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "campaign not found", "NOT_FOUND")
		}
		h.log.Error("DeleteCampaign: find", zap.Error(err))
		return internalError(c, "failed to delete campaign")
	}

	if campaign.Status == models.CampaignStatusRunning {
		return badRequest(c, "cannot delete a running campaign; pause it first", "INVALID_STATUS")
	}

	result := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", id, wid).
		Delete(&models.Campaign{})
	if result.Error != nil {
		h.log.Error("DeleteCampaign: delete", zap.Error(result.Error))
		return internalError(c, "failed to delete campaign")
	}

	return c.SendStatus(fiber.StatusNoContent)
}

// ─── GenerateCampaign ─────────────────────────────────────────────────────────

// GenerateCampaign sets status to "generating" and enqueues the generation task.
// POST /api/v1/workspaces/:workspaceId/campaigns/:id/generate
func (h *CampaignsHandler) GenerateCampaign(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "campaign id must be a valid UUID", "INVALID_ID")
	}

	var campaign models.Campaign
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", id, wid).
		First(&campaign).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "campaign not found", "NOT_FOUND")
		}
		h.log.Error("GenerateCampaign: find", zap.Error(err))
		return internalError(c, "failed to generate campaign")
	}

	if campaign.Status != models.CampaignStatusDraft && campaign.Status != models.CampaignStatusFailed {
		return badRequest(c, "campaign must be in draft or failed status to generate", "INVALID_STATUS")
	}

	if err := h.db.WithContext(c.Context()).Model(&campaign).
		Update("status", models.CampaignStatusGenerating).Error; err != nil {
		h.log.Error("GenerateCampaign: update status", zap.Error(err))
		return internalError(c, "failed to generate campaign")
	}

	task, err := queue.NewGenerateCampaignTask(queue.GenerateCampaignPayload{
		CampaignID:  campaign.ID,
		WorkspaceID: wid,
	})
	if err != nil {
		h.log.Error("GenerateCampaign: create task", zap.Error(err))
		return internalError(c, "failed to enqueue generation task")
	}

	if _, err := h.asynq.Enqueue(task); err != nil {
		h.log.Error("GenerateCampaign: enqueue task", zap.Error(err))
		// Roll back the status change so the user can retry.
		h.db.WithContext(c.Context()).Model(&campaign).Update("status", models.CampaignStatusDraft)
		return internalError(c, "failed to enqueue generation task")
	}

	return c.JSON(fiber.Map{"data": campaign})
}

// ─── PauseCampaign ────────────────────────────────────────────────────────────

// PauseCampaign sets status to "paused".
// POST /api/v1/workspaces/:workspaceId/campaigns/:id/pause
func (h *CampaignsHandler) PauseCampaign(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "campaign id must be a valid UUID", "INVALID_ID")
	}

	var campaign models.Campaign
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", id, wid).
		First(&campaign).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "campaign not found", "NOT_FOUND")
		}
		h.log.Error("PauseCampaign: find", zap.Error(err))
		return internalError(c, "failed to pause campaign")
	}

	if campaign.Status != models.CampaignStatusRunning && campaign.Status != models.CampaignStatusScheduled {
		return badRequest(c, "campaign must be running or scheduled to pause", "INVALID_STATUS")
	}

	if err := h.db.WithContext(c.Context()).Model(&campaign).
		Update("status", models.CampaignStatusPaused).Error; err != nil {
		h.log.Error("PauseCampaign: update status", zap.Error(err))
		return internalError(c, "failed to pause campaign")
	}

	return c.JSON(fiber.Map{"data": campaign})
}

// ─── ResumeCampaign ───────────────────────────────────────────────────────────

// ResumeCampaign sets status to "running".
// POST /api/v1/workspaces/:workspaceId/campaigns/:id/resume
func (h *CampaignsHandler) ResumeCampaign(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "campaign id must be a valid UUID", "INVALID_ID")
	}

	var campaign models.Campaign
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", id, wid).
		First(&campaign).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "campaign not found", "NOT_FOUND")
		}
		h.log.Error("ResumeCampaign: find", zap.Error(err))
		return internalError(c, "failed to resume campaign")
	}

	if campaign.Status != models.CampaignStatusPaused {
		return badRequest(c, "campaign must be paused to resume", "INVALID_STATUS")
	}

	if err := h.db.WithContext(c.Context()).Model(&campaign).
		Update("status", models.CampaignStatusRunning).Error; err != nil {
		h.log.Error("ResumeCampaign: update status", zap.Error(err))
		return internalError(c, "failed to resume campaign")
	}

	return c.JSON(fiber.Map{"data": campaign})
}

// ─── ListCampaignPosts ────────────────────────────────────────────────────────

// ListCampaignPosts returns paginated posts belonging to a campaign.
// GET /api/v1/workspaces/:workspaceId/campaigns/:id/posts
func (h *CampaignsHandler) ListCampaignPosts(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "campaign id must be a valid UUID", "INVALID_ID")
	}

	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 50)
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 200 {
		limit = 50
	}
	offset := (page - 1) * limit

	var posts []models.CampaignPost
	var total int64

	base := h.db.WithContext(c.Context()).Model(&models.CampaignPost{}).
		Where("campaign_id = ? AND workspace_id = ?", id, wid)

	if status := c.Query("status"); status != "" {
		base = base.Where("status = ?", status)
	}

	if err := base.Count(&total).Error; err != nil {
		h.log.Error("ListCampaignPosts: count", zap.Error(err))
		return internalError(c, "failed to list campaign posts")
	}

	if err := base.Order("sort_order ASC, scheduled_for ASC").Offset(offset).Limit(limit).
		Find(&posts).Error; err != nil {
		h.log.Error("ListCampaignPosts: find", zap.Error(err))
		return internalError(c, "failed to list campaign posts")
	}

	totalPages := int(math.Ceil(float64(total) / float64(limit)))

	return c.JSON(fiber.Map{
		"data": posts,
		"meta": fiber.Map{
			"total":       total,
			"page":        page,
			"limit":       limit,
			"total_pages": totalPages,
		},
	})
}

// ─── UpdateCampaignPost ───────────────────────────────────────────────────────

// UpdateCampaignPost edits caption/hashtags on an individual campaign post.
// PATCH /api/v1/workspaces/:workspaceId/campaigns/:id/posts/:pid
func (h *CampaignsHandler) UpdateCampaignPost(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	campaignID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "campaign id must be a valid UUID", "INVALID_ID")
	}

	postID, err := uuid.Parse(c.Params("pid"))
	if err != nil {
		return badRequest(c, "post id must be a valid UUID", "INVALID_ID")
	}

	var req updateCampaignPostRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	var post models.CampaignPost
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND campaign_id = ? AND workspace_id = ?", postID, campaignID, wid).
		First(&post).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "campaign post not found", "NOT_FOUND")
		}
		h.log.Error("UpdateCampaignPost: find", zap.Error(err))
		return internalError(c, "failed to update campaign post")
	}

	updates := map[string]interface{}{}
	if req.GeneratedCaption != nil {
		updates["generated_caption"] = *req.GeneratedCaption
	}
	if req.GeneratedHashtags != nil {
		updates["generated_hashtags"] = req.GeneratedHashtags
	}
	if req.ContentPillar != nil {
		updates["content_pillar"] = *req.ContentPillar
	}
	if req.MediaURLs != nil {
		updates["media_urls"] = req.MediaURLs
	}

	if len(updates) == 0 {
		return c.JSON(fiber.Map{"data": post})
	}

	if err := h.db.WithContext(c.Context()).Model(&post).Updates(updates).Error; err != nil {
		h.log.Error("UpdateCampaignPost: update", zap.Error(err))
		return internalError(c, "failed to update campaign post")
	}

	return c.JSON(fiber.Map{"data": post})
}

// ─── ApproveCampaignPost ──────────────────────────────────────────────────────

// ApproveCampaignPost sets a single campaign post status to "approved".
// POST /api/v1/workspaces/:workspaceId/campaigns/:id/posts/:pid/approve
func (h *CampaignsHandler) ApproveCampaignPost(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	campaignID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "campaign id must be a valid UUID", "INVALID_ID")
	}

	postID, err := uuid.Parse(c.Params("pid"))
	if err != nil {
		return badRequest(c, "post id must be a valid UUID", "INVALID_ID")
	}

	var post models.CampaignPost
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND campaign_id = ? AND workspace_id = ?", postID, campaignID, wid).
		First(&post).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "campaign post not found", "NOT_FOUND")
		}
		h.log.Error("ApproveCampaignPost: find", zap.Error(err))
		return internalError(c, "failed to approve campaign post")
	}

	if err := h.db.WithContext(c.Context()).Model(&post).
		Update("status", models.CampaignPostApproved).Error; err != nil {
		h.log.Error("ApproveCampaignPost: update", zap.Error(err))
		return internalError(c, "failed to approve campaign post")
	}

	// Increment the campaign's posts_approved counter.
	h.db.WithContext(c.Context()).Model(&models.Campaign{}).
		Where("id = ?", campaignID).
		UpdateColumn("posts_approved", gorm.Expr("posts_approved + 1"))

	return c.JSON(fiber.Map{"data": post})
}

// ─── RejectCampaignPost ───────────────────────────────────────────────────────

// RejectCampaignPost sets a single campaign post status to "rejected".
// POST /api/v1/workspaces/:workspaceId/campaigns/:id/posts/:pid/reject
func (h *CampaignsHandler) RejectCampaignPost(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	campaignID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "campaign id must be a valid UUID", "INVALID_ID")
	}

	postID, err := uuid.Parse(c.Params("pid"))
	if err != nil {
		return badRequest(c, "post id must be a valid UUID", "INVALID_ID")
	}

	var post models.CampaignPost
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND campaign_id = ? AND workspace_id = ?", postID, campaignID, wid).
		First(&post).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "campaign post not found", "NOT_FOUND")
		}
		h.log.Error("RejectCampaignPost: find", zap.Error(err))
		return internalError(c, "failed to reject campaign post")
	}

	if err := h.db.WithContext(c.Context()).Model(&post).
		Update("status", models.CampaignPostRejected).Error; err != nil {
		h.log.Error("RejectCampaignPost: update", zap.Error(err))
		return internalError(c, "failed to reject campaign post")
	}

	return c.JSON(fiber.Map{"data": post})
}

// ─── ApproveAllPosts ──────────────────────────────────────────────────────────

// ApproveAllPosts bulk-approves all "generated" posts in a campaign.
// POST /api/v1/workspaces/:workspaceId/campaigns/:id/approve-all
func (h *CampaignsHandler) ApproveAllPosts(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "campaign id must be a valid UUID", "INVALID_ID")
	}

	// Verify the campaign belongs to this workspace.
	var campaign models.Campaign
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", id, wid).
		First(&campaign).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "campaign not found", "NOT_FOUND")
		}
		h.log.Error("ApproveAllPosts: find campaign", zap.Error(err))
		return internalError(c, "failed to approve all posts")
	}

	result := h.db.WithContext(c.Context()).Model(&models.CampaignPost{}).
		Where("campaign_id = ? AND workspace_id = ? AND status = ?", id, wid, models.CampaignPostGenerated).
		Update("status", models.CampaignPostApproved)
	if result.Error != nil {
		h.log.Error("ApproveAllPosts: update", zap.Error(result.Error))
		return internalError(c, "failed to approve all posts")
	}

	approved := int(result.RowsAffected)

	// Update the campaign's posts_approved counter.
	if approved > 0 {
		h.db.WithContext(c.Context()).Model(&campaign).
			UpdateColumn("posts_approved", gorm.Expr("posts_approved + ?", approved))
	}

	return c.JSON(fiber.Map{
		"message":  "posts approved",
		"approved": approved,
	})
}

// ─── CloneCampaign ────────────────────────────────────────────────────────────

// CloneCampaign duplicates a campaign (without its generated posts) as a new draft.
// POST /api/v1/workspaces/:workspaceId/campaigns/:id/clone
func (h *CampaignsHandler) CloneCampaign(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "campaign id must be a valid UUID", "INVALID_ID")
	}

	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "authentication required"})
	}

	var src models.Campaign
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", id, wid).
		First(&src).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "campaign not found", "NOT_FOUND")
		}
		h.log.Error("CloneCampaign: find", zap.Error(err))
		return internalError(c, "failed to clone campaign")
	}

	clone := models.Campaign{
		WorkspaceID:      wid,
		BrandKitID:       src.BrandKitID,
		CreatedBy:        user.ID,
		Name:             src.Name + " (Copy)",
		Status:           models.CampaignStatusDraft,
		Goal:             src.Goal,
		Brief:            src.Brief,
		StartDate:        nil, // user should set new dates
		EndDate:          nil,
		Platforms:        src.Platforms,
		PostingFrequency: src.PostingFrequency,
		ContentMix:       src.ContentMix,
		AutoApprove:      src.AutoApprove,
		CreditsBudgetCap: src.CreditsBudgetCap,
		Settings:         src.Settings,
	}

	if err := h.db.WithContext(c.Context()).Create(&clone).Error; err != nil {
		h.log.Error("CloneCampaign: create", zap.Error(err))
		return internalError(c, "failed to clone campaign")
	}

	return c.Status(201).JSON(fiber.Map{
		"data":    clone,
		"message": "campaign cloned successfully",
	})
}

// ─── RegenerateCampaignPost ───────────────────────────────────────────────────

// RegenerateCampaignPost re-queues generation for a single campaign post,
// resetting its status to pending_generation.
// POST /api/v1/workspaces/:workspaceId/campaigns/:id/posts/:pid/regenerate
func (h *CampaignsHandler) RegenerateCampaignPost(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	campaignID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "campaign id must be a valid UUID", "INVALID_ID")
	}

	postID, err := uuid.Parse(c.Params("pid"))
	if err != nil {
		return badRequest(c, "post id must be a valid UUID", "INVALID_ID")
	}

	// Verify post ownership.
	var post models.CampaignPost
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND campaign_id = ? AND workspace_id = ?", postID, campaignID, wid).
		First(&post).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "campaign post not found", "NOT_FOUND")
		}
		h.log.Error("RegenerateCampaignPost: find", zap.Error(err))
		return internalError(c, "failed to regenerate post")
	}

	// Only allow regenerating posts that are not currently generating.
	if post.Status == models.CampaignPostGenerating {
		return badRequest(c, "post is already being generated", "ALREADY_GENERATING")
	}

	// Reset status → pending_generation, clear previous output.
	updates := map[string]interface{}{
		"status":             models.CampaignPostPendingGeneration,
		"generated_caption":  "",
		"generated_hashtags": models.StringSlice{},
		"media_urls":         models.StringSlice{},
		"error_message":      "",
	}
	if err := h.db.WithContext(c.Context()).Model(&post).Updates(updates).Error; err != nil {
		h.log.Error("RegenerateCampaignPost: reset", zap.Error(err))
		return internalError(c, "failed to reset post for regeneration")
	}

	// Decrement campaign.posts_generated if the post was previously generated.
	if post.Status == models.CampaignPostGenerated ||
		post.Status == models.CampaignPostApproved ||
		post.Status == models.CampaignPostRejected {
		h.db.WithContext(c.Context()).Model(&models.Campaign{}).
			Where("id = ? AND posts_generated > 0", campaignID).
			UpdateColumn("posts_generated", gorm.Expr("posts_generated - 1"))
	}

	// Enqueue the generation task.
	payload := queue.GenerateCampaignPostPayload{
		CampaignPostID: postID,
		CampaignID:     campaignID,
		WorkspaceID:    wid,
	}
	task, err := queue.NewGenerateCampaignPostTask(payload)
	if err != nil {
		h.log.Error("RegenerateCampaignPost: create task", zap.Error(err))
		return internalError(c, "failed to enqueue regeneration task")
	}
	if _, err := h.asynq.EnqueueContext(c.Context(), task); err != nil {
		h.log.Error("RegenerateCampaignPost: enqueue", zap.Error(err))
		return internalError(c, "failed to enqueue regeneration task")
	}

	return c.JSON(fiber.Map{
		"data":    post,
		"message": "post queued for regeneration",
	})
}

// ─── Admin handlers ───────────────────────────────────────────────────────────

// adminCampaignResponse embeds Campaign with a workspace_name from the JOIN.
type adminCampaignResponse struct {
	models.Campaign
	WorkspaceName string `json:"workspace_name"`
}

// AdminListCampaigns returns all campaigns across all workspaces.
// GET /api/v1/admin/campaigns?status=&page=&limit=&search=
func (h *CampaignsHandler) AdminListCampaigns(c *fiber.Ctx) error {
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 20)
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	type row struct {
		models.Campaign
		WorkspaceName string `gorm:"column:workspace_name" json:"workspace_name"`
	}

	base := h.db.WithContext(c.Context()).
		Table("campaigns c").
		Select("c.*, w.name AS workspace_name").
		Joins("JOIN workspaces w ON w.id = c.workspace_id").
		Where("c.deleted_at IS NULL")

	if status := c.Query("status"); status != "" {
		base = base.Where("c.status = ?", status)
	}

	if search := c.Query("search"); search != "" {
		like := "%" + search + "%"
		base = base.Where("(c.name ILIKE ? OR w.name ILIKE ?)", like, like)
	}

	var total int64
	if err := base.Count(&total).Error; err != nil {
		h.log.Error("AdminListCampaigns: count", zap.Error(err))
		return internalError(c, "failed to list campaigns")
	}

	var rows []row
	if err := base.Order("c.created_at DESC").Offset(offset).Limit(limit).
		Find(&rows).Error; err != nil {
		h.log.Error("AdminListCampaigns: find", zap.Error(err))
		return internalError(c, "failed to list campaigns")
	}

	// Map to response structs.
	result := make([]adminCampaignResponse, len(rows))
	for i, r := range rows {
		result[i] = adminCampaignResponse{
			Campaign:      r.Campaign,
			WorkspaceName: r.WorkspaceName,
		}
	}

	totalPages := int(math.Ceil(float64(total) / float64(limit)))

	return c.JSON(fiber.Map{
		"data": result,
		"meta": fiber.Map{
			"total":       total,
			"page":        page,
			"limit":       limit,
			"total_pages": totalPages,
		},
	})
}

// AdminGetCampaign returns a single campaign regardless of workspace.
// GET /api/v1/admin/campaigns/:id
func (h *CampaignsHandler) AdminGetCampaign(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "campaign id must be a valid UUID", "INVALID_ID")
	}

	type row struct {
		models.Campaign
		WorkspaceName string `gorm:"column:workspace_name" json:"workspace_name"`
	}

	var r row
	if err := h.db.WithContext(c.Context()).
		Table("campaigns c").
		Select("c.*, w.name AS workspace_name").
		Joins("JOIN workspaces w ON w.id = c.workspace_id").
		Preload("BrandKit").
		Where("c.id = ? AND c.deleted_at IS NULL", id).
		First(&r).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "campaign not found", "NOT_FOUND")
		}
		h.log.Error("AdminGetCampaign: find", zap.Error(err))
		return internalError(c, "failed to get campaign")
	}

	res := adminCampaignResponse{
		Campaign:      r.Campaign,
		WorkspaceName: r.WorkspaceName,
	}

	return c.JSON(fiber.Map{"data": res})
}

// AdminForcePause sets a campaign's status to "paused" regardless of workspace.
// POST /api/v1/admin/campaigns/:id/force-pause
func (h *CampaignsHandler) AdminForcePause(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "campaign id must be a valid UUID", "INVALID_ID")
	}

	var campaign models.Campaign
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND deleted_at IS NULL", id).
		First(&campaign).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "campaign not found", "NOT_FOUND")
		}
		h.log.Error("AdminForcePause: find", zap.Error(err))
		return internalError(c, "failed to find campaign")
	}

	if err := h.db.WithContext(c.Context()).Model(&campaign).
		Update("status", models.CampaignStatusPaused).Error; err != nil {
		h.log.Error("AdminForcePause: update status", zap.Error(err))
		return internalError(c, "failed to pause campaign")
	}

	// Log the admin action.
	adminUser, _ := c.Locals(middleware.LocalsUser).(*models.User)
	adminID := "unknown"
	if adminUser != nil {
		adminID = adminUser.ID.String()
	}
	h.log.Info("AdminForcePause: campaign paused",
		zap.String("campaign_id", campaign.ID.String()),
		zap.String("workspace_id", campaign.WorkspaceID.String()),
		zap.String("admin_user_id", adminID),
	)

	return c.SendStatus(fiber.StatusNoContent)
}
