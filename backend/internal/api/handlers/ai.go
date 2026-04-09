package handlers

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/api/middleware"
	"github.com/socialforge/backend/internal/models"
	ai "github.com/socialforge/backend/internal/services/ai"
	analyticssvc "github.com/socialforge/backend/internal/services/analytics"
)

// AIHandler handles AI content generation and analytics endpoints.
type AIHandler struct {
	db        *gorm.DB
	ai        *ai.Service
	analytics *analyticssvc.Service
	asynq     *asynq.Client
	log       *zap.Logger
}

// NewAIHandler creates a new AIHandler.
func NewAIHandler(db *gorm.DB, aiService *ai.Service, analyticsService *analyticssvc.Service, asynqClient *asynq.Client, log *zap.Logger) *AIHandler {
	return &AIHandler{
		db:        db,
		ai:        aiService,
		analytics: analyticsService,
		asynq:     asynqClient,
		log:       log.Named("ai_handler"),
	}
}

// ── GenerateCaption ───────────────────────────────────────────────────────────

type generateCaptionRequest struct {
	Prompt         string `json:"prompt"`
	Platform       string `json:"platform"`
	Tone           string `json:"tone"`
	TargetAudience string `json:"target_audience"`
}

// GenerateCaption generates a platform-optimised caption.
// POST /api/v1/workspaces/:wid/ai/generate-caption
func (h *AIHandler) GenerateCaption(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "not authenticated")
	}

	var req generateCaptionRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	if req.Prompt == "" {
		return badRequest(c, "prompt is required", "VALIDATION_ERROR")
	}
	if req.Platform == "" {
		return badRequest(c, "platform is required", "VALIDATION_ERROR")
	}
	if req.Tone == "" {
		req.Tone = "engaging"
	}
	if req.TargetAudience == "" {
		req.TargetAudience = "general audience"
	}

	result, _, err := h.ai.GenerateCaption(c.Context(), wid, user.ID, req.Prompt, req.Platform, req.Tone, req.TargetAudience)
	if err != nil {
		if errors.Is(err, ai.ErrInsufficientCredits) {
			return c.Status(fiber.StatusPaymentRequired).JSON(fiber.Map{
				"error": "insufficient AI credits",
				"code":  "INSUFFICIENT_CREDITS",
			})
		}
		h.log.Error("GenerateCaption: ai.GenerateCaption", zap.Error(err))
		return internalError(c, "failed to generate caption")
	}

	return c.JSON(fiber.Map{
		"data": fiber.Map{
			"caption":         result.Caption,
			"hashtags":        result.Hashtags,
			"character_count": len([]rune(result.Caption)),
		},
	})
}

// ── GenerateHashtags ──────────────────────────────────────────────────────────

type generateHashtagsRequest struct {
	Content  string `json:"content"`
	Platform string `json:"platform"`
	Niche    string `json:"niche"`
	Count    int    `json:"count"`
}

// GenerateHashtags returns a list of relevant hashtags for the given content.
// POST /api/v1/workspaces/:workspaceId/ai/hashtags
func (h *AIHandler) GenerateHashtags(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "not authenticated")
	}

	var req generateHashtagsRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}
	if req.Content == "" {
		return badRequest(c, "content is required", "VALIDATION_ERROR")
	}
	if req.Platform == "" {
		return badRequest(c, "platform is required", "VALIDATION_ERROR")
	}

	hashtags, _, err := h.ai.GenerateHashtags(c.Context(), wid, user.ID, req.Content, req.Platform, req.Niche)
	if err != nil {
		if errors.Is(err, ai.ErrInsufficientCredits) {
			return c.Status(fiber.StatusPaymentRequired).JSON(fiber.Map{
				"error": "insufficient AI credits",
				"code":  "INSUFFICIENT_CREDITS",
			})
		}
		h.log.Error("GenerateHashtags: ai.GenerateHashtags", zap.Error(err))
		return internalError(c, "failed to generate hashtags")
	}

	if req.Count > 0 && len(hashtags) > req.Count {
		hashtags = hashtags[:req.Count]
	}

	return c.JSON(fiber.Map{
		"data": fiber.Map{
			"hashtags": hashtags,
			"count":    len(hashtags),
		},
	})
}

// ── GenerateImage ─────────────────────────────────────────────────────────────

type generateImageRequest struct {
	Prompt      string `json:"prompt"`
	Style       string `json:"style"`
	AspectRatio string `json:"aspect_ratio"`
}

// GenerateImage enqueues an async image generation job.
// POST /api/v1/workspaces/:wid/ai/generate-image
func (h *AIHandler) GenerateImage(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "not authenticated")
	}

	var req generateImageRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	if req.Prompt == "" {
		return badRequest(c, "prompt is required", "VALIDATION_ERROR")
	}

	// Check credits before queuing.
	if err := h.ai.DeductCredits(c.Context(), wid, ai.CreditCostImage); err != nil {
		if errors.Is(err, ai.ErrInsufficientCredits) {
			return c.Status(fiber.StatusPaymentRequired).JSON(fiber.Map{
				"error": "insufficient AI credits",
				"code":  "INSUFFICIENT_CREDITS",
			})
		}
		return internalError(c, "failed to check credits")
	}

	// Create a pending AIJob record.
	job := &models.AIJob{
		WorkspaceID:   wid,
		JobType:       models.AIJobGenerateImage,
		Status:        models.AIJobStatusPending,
		InputData:     models.JSONMap{"prompt": req.Prompt, "style": req.Style, "aspect_ratio": req.AspectRatio},
		CreditsUsed:   ai.CreditCostImage,
		RequestedByID: user.ID,
	}
	if err := h.db.WithContext(c.Context()).Create(job).Error; err != nil {
		h.log.Error("GenerateImage: create job record", zap.Error(err))
		return internalError(c, "failed to create AI job")
	}

	// Generate synchronously using the AI service (fal.ai is fast for images).
	go func() {
		result, _, _ := h.ai.GenerateImage(c.Context(), wid, user.ID, req.Prompt, req.Style)
		if result != nil {
			h.db.Model(job).Updates(map[string]interface{}{
				"status":      models.AIJobStatusCompleted,
				"output_data": models.JSONMap{"url": result.URL, "width": result.Width, "height": result.Height},
			})
		}
	}()

	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{
		"data": fiber.Map{"job_id": job.ID},
	})
}

// ── GenerateVideo ─────────────────────────────────────────────────────────────

type generateVideoRequest struct {
	Prompt   string `json:"prompt"`
	Duration int    `json:"duration"`
	Style    string `json:"style"`
}

// GenerateVideo enqueues an async video generation job.
// POST /api/v1/workspaces/:wid/ai/generate-video
func (h *AIHandler) GenerateVideo(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "not authenticated")
	}

	var req generateVideoRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	if req.Prompt == "" {
		return badRequest(c, "prompt is required", "VALIDATION_ERROR")
	}
	if req.Duration <= 0 {
		req.Duration = 5
	}
	if req.Duration > 60 {
		req.Duration = 60
	}

	job, err := h.ai.GenerateVideo(c.Context(), wid, user.ID, req.Prompt, req.Duration, req.Style)
	if err != nil {
		if errors.Is(err, ai.ErrInsufficientCredits) {
			return c.Status(fiber.StatusPaymentRequired).JSON(fiber.Map{
				"error": "insufficient AI credits",
				"code":  "INSUFFICIENT_CREDITS",
			})
		}
		h.log.Error("GenerateVideo: ai.GenerateVideo", zap.Error(err))
		return internalError(c, "failed to start video generation")
	}

	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{
		"data": fiber.Map{"job_id": job.ID},
	})
}

// ── GetAIJobStatus ────────────────────────────────────────────────────────────

// GetAIJobStatus returns the status and output of an AI job.
// GET /api/v1/workspaces/:wid/ai/jobs/:id
func (h *AIHandler) GetAIJobStatus(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	jobID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "id must be a valid UUID", "INVALID_ID")
	}

	job, err := h.ai.GetJob(c.Context(), jobID, wid)
	if err != nil {
		if errors.Is(err, ai.ErrJobNotFound) {
			return notFound(c, "AI job not found", "NOT_FOUND")
		}
		h.log.Error("GetAIJobStatus: ai.GetJob", zap.Error(err))
		return internalError(c, "failed to get AI job")
	}

	return c.JSON(fiber.Map{"data": job})
}

// ── RepurposeContent ──────────────────────────────────────────────────────────

type repurposeRequest struct {
	SourceURL       string   `json:"source_url"`
	Content         string   `json:"content"`
	TargetPlatforms []string `json:"target_platforms"`
}

// RepurposeContent repurposes content for multiple platforms.
// POST /api/v1/workspaces/:wid/ai/repurpose
func (h *AIHandler) RepurposeContent(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "not authenticated")
	}

	var req repurposeRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	if req.SourceURL == "" && req.Content == "" {
		return badRequest(c, "source_url or content is required", "VALIDATION_ERROR")
	}
	if len(req.TargetPlatforms) == 0 {
		return badRequest(c, "target_platforms is required", "VALIDATION_ERROR")
	}

	// Check credits.
	if err := h.ai.DeductCredits(c.Context(), wid, ai.CreditCostRepurpose); err != nil {
		if errors.Is(err, ai.ErrInsufficientCredits) {
			return c.Status(fiber.StatusPaymentRequired).JSON(fiber.Map{
				"error": "insufficient AI credits",
				"code":  "INSUFFICIENT_CREDITS",
			})
		}
		return internalError(c, "failed to check credits")
	}

	// Source content: use provided content or URL.
	sourceContent := req.Content
	if sourceContent == "" {
		sourceContent = "Content from URL: " + req.SourceURL
	}

	// Generate captions for each target platform.
	results := make(map[string]interface{})
	for _, platform := range req.TargetPlatforms {
		result, _, err := h.ai.GenerateCaption(
			c.Context(), wid, user.ID,
			sourceContent, platform,
			"engaging", "general audience",
		)
		if err != nil {
			h.log.Warn("RepurposeContent: GenerateCaption failed",
				zap.String("platform", platform),
				zap.Error(err),
			)
			results[platform] = fiber.Map{"error": err.Error()}
			continue
		}
		results[platform] = fiber.Map{
			"content":  result.Caption,
			"hashtags": result.Hashtags,
		}
	}

	return c.JSON(fiber.Map{
		"data": fiber.Map{"results": results},
	})
}

// ── AnalyseViralPotential ─────────────────────────────────────────────────────

type analyseRequest struct {
	Content  string `json:"content"`
	Platform string `json:"platform"`
}

// AnalyseViralPotential scores content for viral potential.
// POST /api/v1/workspaces/:wid/ai/analyse
func (h *AIHandler) AnalyseViralPotential(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "not authenticated")
	}

	var req analyseRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	if req.Content == "" {
		return badRequest(c, "content is required", "VALIDATION_ERROR")
	}
	if req.Platform == "" {
		return badRequest(c, "platform is required", "VALIDATION_ERROR")
	}

	analysis, _, err := h.ai.AnalyseViralPotential(c.Context(), wid, user.ID, req.Content, req.Platform)
	if err != nil {
		if errors.Is(err, ai.ErrInsufficientCredits) {
			return c.Status(fiber.StatusPaymentRequired).JSON(fiber.Map{
				"error": "insufficient AI credits",
				"code":  "INSUFFICIENT_CREDITS",
			})
		}
		h.log.Error("AnalyseViralPotential: ai.AnalyseViralPotential", zap.Error(err))
		return internalError(c, "failed to analyse content")
	}

	return c.JSON(fiber.Map{
		"data": fiber.Map{
			"score":             analysis.Score,
			"grade":             analysis.Grade,
			"suggestions":       analysis.Improvements,
			"strengths":         analysis.Strengths,
			"estimated_reach":   analysis.EstimatedReach,
			"optimal_post_time": analysis.OptimalPostTime,
		},
	})
}

// ── GetAnalytics ──────────────────────────────────────────────────────────────

// GetAnalytics returns aggregated dashboard analytics for a workspace.
// GET /api/v1/workspaces/:wid/analytics?period=7d|30d|90d
func (h *AIHandler) GetAnalytics(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	period := c.Query("period", "30d")
	from, to := h.analytics.GetDateRange(period)

	stats, err := h.analytics.GetDashboardStats(c.Context(), wid, from, to)
	if err != nil {
		h.log.Error("GetAnalytics: analytics.GetDashboardStats",
			zap.String("workspace_id", wid.String()),
			zap.Error(err),
		)
		return internalError(c, "failed to load analytics")
	}

	return c.JSON(fiber.Map{"data": stats})
}
