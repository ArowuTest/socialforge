package handlers

import (
	"context"
	"errors"
	"sync"

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
	BrandKitID     string `json:"brand_kit_id"` // optional — loads brand context when provided
	Variations     int    `json:"variations"`    // 1–5; defaults to 1 when omitted or 0
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

	// Load BrandKit when brand_kit_id is provided; fall back to workspace default.
	bk := loadBrandKit(c.Context(), h.db, wid, req.BrandKitID)

	n := req.Variations
	if n <= 0 {
		n = 1
	}
	if n > 5 {
		n = 5
	}

	type captionVar struct {
		Caption        string   `json:"caption"`
		Hashtags       []string `json:"hashtags"`
		CharacterCount int      `json:"character_count"`
	}

	if n == 1 {
		result, _, err := h.ai.GenerateCaption(c.Context(), wid, user.ID, req.Prompt, req.Platform, req.Tone, req.TargetAudience, bk)
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
				"variations":      []captionVar{{Caption: result.Caption, Hashtags: result.Hashtags, CharacterCount: len([]rune(result.Caption))}},
			},
		})
	}

	// Multiple variations — run concurrently, each deducts credits independently.
	results := make([]captionVar, n)
	errs := make([]error, n)
	var wg sync.WaitGroup
	wg.Add(n)
	for i := 0; i < n; i++ {
		i := i
		go func() {
			defer wg.Done()
			r, _, e := h.ai.GenerateCaption(c.Context(), wid, user.ID, req.Prompt, req.Platform, req.Tone, req.TargetAudience, bk)
			errs[i] = e
			if e == nil {
				results[i] = captionVar{Caption: r.Caption, Hashtags: r.Hashtags, CharacterCount: len([]rune(r.Caption))}
			}
		}()
	}
	wg.Wait()

	var variations []captionVar
	for i, e := range errs {
		if e != nil {
			if errors.Is(e, ai.ErrInsufficientCredits) {
				return c.Status(fiber.StatusPaymentRequired).JSON(fiber.Map{
					"error": "insufficient AI credits",
					"code":  "INSUFFICIENT_CREDITS",
				})
			}
			h.log.Warn("GenerateCaption variation failed", zap.Int("index", i), zap.Error(e))
			continue
		}
		variations = append(variations, results[i])
	}
	if len(variations) == 0 {
		return internalError(c, "failed to generate captions")
	}
	return c.JSON(fiber.Map{
		"data": fiber.Map{
			"caption":         variations[0].Caption,
			"hashtags":        variations[0].Hashtags,
			"character_count": variations[0].CharacterCount,
			"variations":      variations,
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
	Model       string `json:"model"` // "premium" = gpt-image-2; anything else = flux
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

	// Determine credit cost based on chosen model.
	creditCost := ai.CreditCostImage
	if req.Model == "premium" {
		creditCost = ai.CreditCostImagePremium
	}

	// Check credits before queuing.
	if err := h.ai.DeductCredits(c.Context(), wid, creditCost); err != nil {
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
		InputData:     models.JSONMap{"prompt": req.Prompt, "style": req.Style, "aspect_ratio": req.AspectRatio, "model": req.Model},
		CreditsUsed:   creditCost,
		RequestedByID: user.ID,
	}
	if err := h.db.WithContext(c.Context()).Create(job).Error; err != nil {
		h.log.Error("GenerateImage: create job record", zap.Error(err))
		return internalError(c, "failed to create AI job")
	}

	// Capture the resolved premium model name now (before goroutine) so
	// input_data records which actual OpenAI model will run.
	resolvedModel := req.Model
	if req.Model == "premium" {
		resolvedModel = h.ai.GetPremiumImageModel()
	}

	// Generate in a background goroutine using a detached context so the
	// HTTP response returning does not cancel the generation call.
	// Credits were already deducted and the job record created above.
	go func() {
		ctx := context.Background()

		// Enrich the prompt with GPT-4o before sending to the generation model.
		enrichedPrompt := h.ai.EnrichVisualPrompt(ctx, req.Prompt, "image", req.Style)

		// Record enriched prompt + resolved model in job's input_data for transparency.
		h.db.WithContext(ctx).Model(job).Update("input_data", models.JSONMap{
			"prompt":          req.Prompt,
			"enriched_prompt": enrichedPrompt,
			"style":           req.Style,
			"aspect_ratio":    req.AspectRatio,
			"model":           req.Model,
			"resolved_model":  resolvedModel,
		})

		// Route to the appropriate generation backend.
		var result *ai.ImageResult
		var genErr error
		if req.Model == "premium" {
			result, genErr = h.ai.GenerateImagePremium(ctx, enrichedPrompt, req.AspectRatio)
		} else {
			result, genErr = h.ai.GenerateImageRaw(ctx, enrichedPrompt, req.Style, req.AspectRatio)
		}

		if genErr != nil || result == nil {
			errMsg := "image generation failed"
			if genErr != nil {
				errMsg = genErr.Error()
			}
			h.log.Error("GenerateImage background: generation failed",
				zap.String("model", req.Model), zap.Error(genErr))
			h.db.WithContext(ctx).Model(job).Updates(map[string]interface{}{
				"status":        models.AIJobStatusFailed,
				"error_message": errMsg,
			})
			// Refund the credits since generation failed.
			if refundErr := h.ai.RefundCredits(ctx, wid, creditCost); refundErr != nil {
				h.log.Error("GenerateImage background: failed to refund credits", zap.Error(refundErr))
			}
			return
		}
		h.db.WithContext(ctx).Model(job).Updates(map[string]interface{}{
			"status":      models.AIJobStatusCompleted,
			"output_data": models.JSONMap{"url": result.URL, "width": result.Width, "height": result.Height},
		})
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
	SourceType      string   `json:"source_type"`      // "text" | "url" | "youtube" | "tiktok"
	TargetPlatforms []string `json:"target_platforms"`
	BrandKitID      string   `json:"brand_kit_id"`     // optional — loads brand context when provided
}

// RepurposeContent repurposes content for multiple platforms using brand-aware prompts.
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

	// Infer source type when not provided.
	sourceType := req.SourceType
	if sourceType == "" {
		if req.SourceURL != "" {
			sourceType = "url"
		} else {
			sourceType = "text"
		}
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

	// Load BrandKit — use specified ID or fall back to workspace default.
	bk := loadBrandKit(c.Context(), h.db, wid, req.BrandKitID)

	drafts, err := h.ai.Repurpose(c.Context(), ai.RepurposeInput{
		SourceType:    sourceType,
		SourceURL:     req.SourceURL,
		SourceText:    req.Content,
		Platforms:     req.TargetPlatforms,
		BrandKit:      bk,
	})
	if err != nil {
		h.log.Error("RepurposeContent: ai.Repurpose", zap.Error(err))
		return internalError(c, "failed to repurpose content")
	}

	// Reshape to a map of platform → draft for the API response.
	results := make(map[string]interface{}, len(drafts))
	for platform, draft := range drafts {
		results[platform] = fiber.Map{
			"content":      draft.Content,
			"hashtags":     draft.Hashtags,
			"char_count":   draft.CharCount,
			"media_prompt": draft.MediaPrompt,
		}
	}

	_ = user // workspace member identity confirmed above; not needed for Repurpose

	return c.JSON(fiber.Map{
		"data": fiber.Map{"results": results},
	})
}

// loadBrandKit loads a BrandKit from the database. When brandKitID is a non-empty
// UUID string it loads that specific kit; otherwise it falls back to the workspace's
// default kit (is_default = true). Returns nil when no kit is found so callers
// can degrade gracefully without brand context.
func loadBrandKit(ctx context.Context, db *gorm.DB, wid uuid.UUID, brandKitID string) *models.BrandKit {
	var bk models.BrandKit
	if brandKitID != "" {
		kitID, err := uuid.Parse(brandKitID)
		if err == nil {
			if err := db.WithContext(ctx).
				Where("id = ? AND workspace_id = ?", kitID, wid).
				First(&bk).Error; err == nil {
				return &bk
			}
		}
	}
	// Fall back to workspace default kit.
	if err := db.WithContext(ctx).
		Where("workspace_id = ? AND is_default = true", wid).
		First(&bk).Error; err == nil {
		return &bk
	}
	return nil
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
