package handlers

import (
	"github.com/gofiber/fiber/v2"
	"go.uber.org/zap"

	"github.com/socialforge/backend/internal/api/middleware"
	"github.com/socialforge/backend/internal/models"
	ai "github.com/socialforge/backend/internal/services/ai"
)

// RepurposeHandler handles content repurposing endpoints.
type RepurposeHandler struct {
	aiService *ai.Service
	log       *zap.Logger
}

// NewRepurposeHandler creates a new RepurposeHandler.
func NewRepurposeHandler(aiService *ai.Service, log *zap.Logger) *RepurposeHandler {
	return &RepurposeHandler{aiService: aiService, log: log.Named("repurpose")}
}

// ── RepurposeContent ──────────────────────────────────────────────────────────

type repurposeContentRequest struct {
	SourceType      string   `json:"source_type"`       // url|text|youtube|tiktok
	SourceURL       string   `json:"source_url"`
	SourceText      string   `json:"source_text"`
	Platforms       []string `json:"platforms"`
	Tone            string   `json:"tone"`              // professional|casual|humorous|inspirational
	IncludeHashtags bool     `json:"include_hashtags"`
	IncludeCTA      bool     `json:"include_cta"`
	IncludeEmoji    bool     `json:"include_emoji"`
}

// RepurposeContent repurposes source content for multiple social platforms.
// POST /api/v1/workspaces/:wid/repurpose
func (h *RepurposeHandler) RepurposeContent(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "not authenticated")
	}

	var req repurposeContentRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	// Validate source type
	switch req.SourceType {
	case "url", "youtube", "tiktok":
		if req.SourceURL == "" {
			return badRequest(c, "source_url is required for this source_type", "VALIDATION_ERROR")
		}
	case "text", "":
		req.SourceType = "text"
		if req.SourceText == "" {
			return badRequest(c, "source_text is required when source_type is text", "VALIDATION_ERROR")
		}
	default:
		return badRequest(c, "source_type must be one of: url, text, youtube, tiktok", "VALIDATION_ERROR")
	}

	if len(req.Platforms) == 0 {
		return badRequest(c, "platforms is required", "VALIDATION_ERROR")
	}

	if req.Tone == "" {
		req.Tone = "professional"
	}

	// Deduct AI credits before processing
	if err := h.aiService.DeductCredits(c.Context(), wid, ai.CreditCostRepurpose); err != nil {
		if err == ai.ErrInsufficientCredits {
			return c.Status(fiber.StatusPaymentRequired).JSON(fiber.Map{
				"error": "insufficient AI credits",
				"code":  "INSUFFICIENT_CREDITS",
			})
		}
		h.log.Error("RepurposeContent: DeductCredits", zap.Error(err))
		return internalError(c, "failed to check credits")
	}

	input := ai.RepurposeInput{
		SourceType: req.SourceType,
		SourceURL:  req.SourceURL,
		SourceText: req.SourceText,
		Platforms:  req.Platforms,
	}

	drafts, err := h.aiService.Repurpose(c.Context(), input)
	if err != nil {
		h.log.Error("RepurposeContent: Repurpose",
			zap.String("workspace_id", wid.String()),
			zap.Error(err),
		)
		return internalError(c, "failed to repurpose content")
	}

	// Build source summary
	sourceSummary := req.SourceText
	if sourceSummary == "" {
		sourceSummary = req.SourceURL
	}
	if len([]rune(sourceSummary)) > 200 {
		sourceSummary = string([]rune(sourceSummary)[:200]) + "..."
	}

	// Convert PlatformDraft map to response format
	platformResults := make(map[string]fiber.Map, len(drafts))
	for platform, draft := range drafts {
		hashtags := draft.Hashtags
		if hashtags == nil {
			hashtags = []string{}
		}
		platformResults[platform] = fiber.Map{
			"content":      draft.Content,
			"hashtags":     hashtags,
			"char_count":   draft.CharCount,
			"media_prompt": draft.MediaPrompt,
		}
	}

	return c.JSON(fiber.Map{
		"source_summary": sourceSummary,
		"platforms":      platformResults,
	})
}
