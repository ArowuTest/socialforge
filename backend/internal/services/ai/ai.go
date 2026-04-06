// Package ai provides content generation, image/video synthesis, and viral
// analysis services backed by OpenAI GPT-4o and fal.ai.
package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	openai "github.com/sashabaranov/go-openai"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/google/uuid"
	"github.com/socialforge/backend/internal/models"
)

// ─── Errors ───────────────────────────────────────────────────────────────────

var (
	ErrInsufficientCredits = errors.New("insufficient AI credits")
	ErrJobNotFound         = errors.New("AI job not found")
)

// ─── Credit costs ─────────────────────────────────────────────────────────────

const (
	CreditCostCaption       = 1
	CreditCostHashtags      = 1
	CreditCostCarousel      = 3
	CreditCostAnalyse       = 2
	CreditCostRepurpose     = 5
	CreditCostImage         = 10
	CreditCostVideo         = 30
)

// ─── Platform prompt hints ────────────────────────────────────────────────────

var platformGuidance = map[string]string{
	"instagram":  "Instagram (up to 2200 chars, casual/visual, 3–30 hashtags at end)",
	"tiktok":     "TikTok (punchy hook in first line, 150 chars max, 3–5 trendy hashtags)",
	"linkedin":   "LinkedIn (professional, up to 3000 chars, thought-leadership tone, 3–5 relevant hashtags)",
	"twitter":    "Twitter/X (280 chars max, conversational, 1–2 hashtags inline)",
	"facebook":   "Facebook (engaging, up to 500 chars, optional 2–3 hashtags)",
	"youtube":    "YouTube (description up to 5000 chars, include 3 keyword-rich paragraphs, tags list at end)",
	"pinterest":  "Pinterest (100-char punchy description, keyword-rich, link-friendly)",
	"threads":    "Threads (casual, max 500 chars, 0–3 hashtags)",
}

// ─── Service ─────────────────────────────────────────────────────────────────

// Service provides all AI content generation capabilities.
type Service struct {
	db           *gorm.DB
	openaiClient *openai.Client
	falAPIKey    string
	httpClient   *http.Client
	log          *zap.Logger
}

// New creates a new AI Service.
func New(db *gorm.DB, openaiAPIKey, falAPIKey string, log *zap.Logger) *Service {
	return &Service{
		db:           db,
		openaiClient: openai.NewClient(openaiAPIKey),
		falAPIKey:    falAPIKey,
		httpClient:   &http.Client{Timeout: 120 * time.Second},
		log:          log,
	}
}

// ─── DeductCredits ────────────────────────────────────────────────────────────

// DeductCredits atomically checks and subtracts AI credits from a workspace.
// Returns ErrInsufficientCredits if the balance would go negative.
func (s *Service) DeductCredits(ctx context.Context, workspaceID uuid.UUID, amount int) error {
	result := s.db.WithContext(ctx).
		Model(&models.Workspace{}).
		Where("id = ? AND (ai_credits_limit - ai_credits_used) >= ?", workspaceID, amount).
		UpdateColumn("ai_credits_used", gorm.Expr("ai_credits_used + ?", amount))

	if result.Error != nil {
		return fmt.Errorf("DeductCredits: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrInsufficientCredits
	}
	return nil
}

// ─── saveJob ──────────────────────────────────────────────────────────────────

func (s *Service) saveJob(
	ctx context.Context,
	workspaceID, userID uuid.UUID,
	jobType string,
	input, output models.JSONMap,
	credits int,
	errMsg string,
) (*models.AIJob, error) {
	status := "completed"
	if errMsg != "" {
		status = "failed"
	}
	now := time.Now().UTC()
	job := &models.AIJob{
		WorkspaceID:   workspaceID,
		JobType:       models.AIJobType(jobType),
		Status:        models.AIJobStatus(status),
		InputData:     input,
		OutputData:    output,
		CreditsUsed:   credits,
		ErrorMessage:  errMsg,
		CompletedAt:   &now,
		RequestedByID: userID,
	}
	if err := s.db.WithContext(ctx).Create(job).Error; err != nil {
		s.log.Error("saveJob: failed to persist AIJob", zap.Error(err))
		return nil, err
	}
	return job, nil
}

// ─── GenerateCaption ──────────────────────────────────────────────────────────

// CaptionResult holds the generated caption and suggested hashtags.
type CaptionResult struct {
	Caption  string   `json:"caption"`
	Hashtags []string `json:"hashtags"`
}

// GenerateCaption calls GPT-4o to produce a platform-optimised caption.
func (s *Service) GenerateCaption(
	ctx context.Context,
	workspaceID, userID uuid.UUID,
	prompt, platform, tone, targetAudience string,
) (*CaptionResult, *models.AIJob, error) {
	if err := s.DeductCredits(ctx, workspaceID, CreditCostCaption); err != nil {
		return nil, nil, err
	}

	guidance := platformGuidance[platform]
	if guidance == "" {
		guidance = platform
	}

	systemPrompt := fmt.Sprintf(
		"You are a world-class social media copywriter. "+
			"Write a high-converting caption for %s. "+
			"Tone: %s. Target audience: %s. "+
			"Return JSON with keys: caption (string), hashtags ([]string). "+
			"Do NOT include any markdown fences.",
		guidance, tone, targetAudience,
	)

	resp, err := s.openaiClient.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model: openai.GPT4TurboPreview,
		Messages: []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleSystem, Content: systemPrompt},
			{Role: openai.ChatMessageRoleUser, Content: prompt},
		},
		ResponseFormat: &openai.ChatCompletionResponseFormat{Type: openai.ChatCompletionResponseFormatTypeJSONObject},
		Temperature:    0.75,
	})
	if err != nil {
		job, _ := s.saveJob(ctx, workspaceID, userID, "caption",
			models.JSONMap{"prompt": prompt, "platform": platform, "tone": tone},
			nil, CreditCostCaption, err.Error())
		return nil, job, fmt.Errorf("GenerateCaption: openai: %w", err)
	}

	raw := resp.Choices[0].Message.Content
	var result CaptionResult
	if jsonErr := json.Unmarshal([]byte(raw), &result); jsonErr != nil {
		// Fallback: treat entire response as caption.
		result = CaptionResult{Caption: strings.TrimSpace(raw)}
	}

	job, _ := s.saveJob(ctx, workspaceID, userID, "caption",
		models.JSONMap{"prompt": prompt, "platform": platform, "tone": tone, "target_audience": targetAudience},
		models.JSONMap{"caption": result.Caption, "hashtags": result.Hashtags},
		CreditCostCaption, "")

	return &result, job, nil
}

// ─── GenerateHashtags ─────────────────────────────────────────────────────────

// GenerateHashtags returns a list of relevant hashtags for the given content.
func (s *Service) GenerateHashtags(
	ctx context.Context,
	workspaceID, userID uuid.UUID,
	content, platform, niche string,
) ([]string, *models.AIJob, error) {
	if err := s.DeductCredits(ctx, workspaceID, CreditCostHashtags); err != nil {
		return nil, nil, err
	}

	systemPrompt := fmt.Sprintf(
		"You are a social-media hashtag expert. "+
			"Return a JSON object with a single key 'hashtags' whose value is an array of strings. "+
			"Generate the most discoverable and relevant hashtags for %s in the %s niche. "+
			"Include a mix of high-volume, mid-tier, and niche tags. Do NOT add '#' prefix.",
		platform, niche,
	)

	resp, err := s.openaiClient.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model: openai.GPT4TurboPreview,
		Messages: []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleSystem, Content: systemPrompt},
			{Role: openai.ChatMessageRoleUser, Content: content},
		},
		ResponseFormat: &openai.ChatCompletionResponseFormat{Type: openai.ChatCompletionResponseFormatTypeJSONObject},
		Temperature:    0.6,
	})
	if err != nil {
		job, _ := s.saveJob(ctx, workspaceID, userID, "hashtags",
			models.JSONMap{"platform": platform, "niche": niche},
			nil, CreditCostHashtags, err.Error())
		return nil, job, fmt.Errorf("GenerateHashtags: openai: %w", err)
	}

	var out struct {
		Hashtags []string `json:"hashtags"`
	}
	_ = json.Unmarshal([]byte(resp.Choices[0].Message.Content), &out)

	job, _ := s.saveJob(ctx, workspaceID, userID, "hashtags",
		models.JSONMap{"platform": platform, "niche": niche, "content_preview": truncate(content, 200)},
		models.JSONMap{"hashtags": out.Hashtags},
		CreditCostHashtags, "")

	return out.Hashtags, job, nil
}

// ─── GenerateImage ────────────────────────────────────────────────────────────

// ImageResult holds the fal.ai generated image URL and metadata.
type ImageResult struct {
	URL      string `json:"url"`
	Width    int    `json:"width"`
	Height   int    `json:"height"`
	MimeType string `json:"mime_type"`
}

// GenerateImage calls fal.ai Flux to produce an image from a text prompt.
func (s *Service) GenerateImage(
	ctx context.Context,
	workspaceID, userID uuid.UUID,
	prompt, style string,
) (*ImageResult, *models.AIJob, error) {
	if err := s.DeductCredits(ctx, workspaceID, CreditCostImage); err != nil {
		return nil, nil, err
	}

	enhancedPrompt := prompt
	if style != "" {
		enhancedPrompt = fmt.Sprintf("%s, style: %s", prompt, style)
	}

	reqBody := map[string]interface{}{
		"prompt":           enhancedPrompt,
		"image_size":       "square_hd",
		"num_images":       1,
		"enable_safety_checker": true,
	}

	result, err := s.falRequest(ctx, "fal-ai/flux/schnell", reqBody)
	if err != nil {
		job, _ := s.saveJob(ctx, workspaceID, userID, "image",
			models.JSONMap{"prompt": prompt, "style": style},
			nil, CreditCostImage, err.Error())
		return nil, job, fmt.Errorf("GenerateImage: fal.ai: %w", err)
	}

	imageResult := extractImageResult(result)
	job, _ := s.saveJob(ctx, workspaceID, userID, "image",
		models.JSONMap{"prompt": prompt, "style": style},
		models.JSONMap{"url": imageResult.URL, "width": imageResult.Width, "height": imageResult.Height},
		CreditCostImage, "")

	return imageResult, job, nil
}

// ─── GenerateVideo ────────────────────────────────────────────────────────────

// VideoResult holds the fal.ai generated video URL.
type VideoResult struct {
	URL      string `json:"url"`
	Duration int    `json:"duration"`
}

// GenerateVideo calls fal.ai Kling/Seedance to produce a short video clip.
// This is asynchronous — the job ID should be polled via GetAIJobStatus.
func (s *Service) GenerateVideo(
	ctx context.Context,
	workspaceID, userID uuid.UUID,
	prompt string,
	duration int,
	style string,
) (*models.AIJob, error) {
	if err := s.DeductCredits(ctx, workspaceID, CreditCostVideo); err != nil {
		return nil, err
	}

	// Create a pending job first so the client can poll it.
	job := &models.AIJob{
		WorkspaceID: workspaceID,
		JobType:     models.AIJobGenerateVideo,
		Status:      models.AIJobStatusProcessing,
		InputData: models.JSONMap{
			"prompt":   prompt,
			"duration": duration,
			"style":    style,
		},
		CreditsUsed:   CreditCostVideo,
		RequestedByID: userID,
	}
	if err := s.db.WithContext(ctx).Create(job).Error; err != nil {
		return nil, fmt.Errorf("GenerateVideo: create job record: %w", err)
	}

	// Fire async — wrap in goroutine so the handler returns immediately.
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()

		enhancedPrompt := prompt
		if style != "" {
			enhancedPrompt = fmt.Sprintf("%s, style: %s", prompt, style)
		}
		reqBody := map[string]interface{}{
			"prompt":      enhancedPrompt,
			"duration":    duration,
			"aspect_ratio": "16:9",
		}

		result, err := s.falRequest(bgCtx, "fal-ai/kling-video/v1.6/standard/text-to-video", reqBody)
		now := time.Now().UTC()
		if err != nil {
			s.db.Model(job).Updates(map[string]interface{}{
				"status":        "failed",
				"error_message": err.Error(),
				"completed_at":  now,
			})
			return
		}

		var videoURL string
		if v, ok := result["video"].(map[string]interface{}); ok {
			videoURL, _ = v["url"].(string)
		}

		s.db.Model(job).Updates(map[string]interface{}{
			"status":       "completed",
			"output":       models.JSONMap{"url": videoURL, "duration": duration},
			"completed_at": now,
		})
	}()

	return job, nil
}

// ─── GenerateCarousel ─────────────────────────────────────────────────────────

// CarouselSlide represents a single slide in a carousel post.
type CarouselSlide struct {
	SlideNumber    int    `json:"slide_number"`
	Headline       string `json:"headline"`
	BodyText       string `json:"body_text"`
	CallToAction   string `json:"call_to_action,omitempty"`
	ImagePrompt    string `json:"image_prompt"`
}

// GenerateCarousel generates slide content for a carousel post.
func (s *Service) GenerateCarousel(
	ctx context.Context,
	workspaceID, userID uuid.UUID,
	topic string,
	slides int,
	platform string,
) ([]CarouselSlide, *models.AIJob, error) {
	if slides < 2 {
		slides = 2
	}
	if slides > 10 {
		slides = 10
	}
	if err := s.DeductCredits(ctx, workspaceID, CreditCostCarousel); err != nil {
		return nil, nil, err
	}

	systemPrompt := fmt.Sprintf(
		"You are a carousel post expert for %s. "+
			"Create a %d-slide educational/engaging carousel about the given topic. "+
			"Return JSON with key 'slides' containing an array of objects, each with: "+
			"slide_number (int), headline (string, max 60 chars), body_text (string, max 150 chars), "+
			"call_to_action (string, only on last slide), image_prompt (string describing ideal visual). "+
			"Make slide 1 a hook and slide %d a strong CTA. Do NOT include markdown fences.",
		platform, slides, slides,
	)

	resp, err := s.openaiClient.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model: openai.GPT4TurboPreview,
		Messages: []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleSystem, Content: systemPrompt},
			{Role: openai.ChatMessageRoleUser, Content: topic},
		},
		ResponseFormat: &openai.ChatCompletionResponseFormat{Type: openai.ChatCompletionResponseFormatTypeJSONObject},
		Temperature:    0.7,
	})
	if err != nil {
		job, _ := s.saveJob(ctx, workspaceID, userID, "carousel",
			models.JSONMap{"topic": topic, "slides": slides, "platform": platform},
			nil, CreditCostCarousel, err.Error())
		return nil, job, fmt.Errorf("GenerateCarousel: openai: %w", err)
	}

	var out struct {
		Slides []CarouselSlide `json:"slides"`
	}
	if err := json.Unmarshal([]byte(resp.Choices[0].Message.Content), &out); err != nil {
		return nil, nil, fmt.Errorf("GenerateCarousel: parse response: %w", err)
	}

	job, _ := s.saveJob(ctx, workspaceID, userID, "carousel",
		models.JSONMap{"topic": topic, "slides": slides, "platform": platform},
		models.JSONMap{"slides": out.Slides},
		CreditCostCarousel, "")

	return out.Slides, job, nil
}

// ─── AnalyseViralPotential ────────────────────────────────────────────────────

// ViralAnalysis holds the scoring and improvement suggestions.
type ViralAnalysis struct {
	Score            int      `json:"score"`
	Grade            string   `json:"grade"`
	Strengths        []string `json:"strengths"`
	Improvements     []string `json:"improvements"`
	OptimalPostTime  string   `json:"optimal_post_time"`
	EstimatedReach   string   `json:"estimated_reach"`
}

// AnalyseViralPotential scores content 0–100 and returns improvement suggestions.
func (s *Service) AnalyseViralPotential(
	ctx context.Context,
	workspaceID, userID uuid.UUID,
	content, platform string,
) (*ViralAnalysis, *models.AIJob, error) {
	if err := s.DeductCredits(ctx, workspaceID, CreditCostAnalyse); err != nil {
		return nil, nil, err
	}

	systemPrompt := fmt.Sprintf(
		"You are a social media virality expert for %s. "+
			"Analyse the provided content and return JSON with keys: "+
			"score (int 0-100), grade (string A/B/C/D/F), "+
			"strengths ([]string, max 3), improvements ([]string, max 3 actionable tips), "+
			"optimal_post_time (string, e.g. 'Tuesday 6-8 PM'), "+
			"estimated_reach (string, e.g. '1,000-5,000 impressions'). "+
			"Be specific and data-driven. Do NOT include markdown fences.",
		platform,
	)

	resp, err := s.openaiClient.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model: openai.GPT4TurboPreview,
		Messages: []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleSystem, Content: systemPrompt},
			{Role: openai.ChatMessageRoleUser, Content: content},
		},
		ResponseFormat: &openai.ChatCompletionResponseFormat{Type: openai.ChatCompletionResponseFormatTypeJSONObject},
		Temperature:    0.5,
	})
	if err != nil {
		job, _ := s.saveJob(ctx, workspaceID, userID, "analyse",
			models.JSONMap{"platform": platform, "content_preview": truncate(content, 200)},
			nil, CreditCostAnalyse, err.Error())
		return nil, job, fmt.Errorf("AnalyseViralPotential: openai: %w", err)
	}

	var analysis ViralAnalysis
	if jsonErr := json.Unmarshal([]byte(resp.Choices[0].Message.Content), &analysis); jsonErr != nil {
		return nil, nil, fmt.Errorf("AnalyseViralPotential: parse response: %w", jsonErr)
	}

	job, _ := s.saveJob(ctx, workspaceID, userID, "analyse",
		models.JSONMap{"platform": platform, "content_preview": truncate(content, 200)},
		models.JSONMap{"score": analysis.Score, "grade": analysis.Grade},
		CreditCostAnalyse, "")

	return &analysis, job, nil
}

// ─── ProcessJob ───────────────────────────────────────────────────────────────
// ProcessJob is called by the asynq AIGenerateHandler and dispatches to the
// appropriate method based on the AIGeneratePayload.JobType.
func (s *Service) ProcessJob(ctx context.Context, p interface{}) (map[string]interface{}, error) {
	// We accept interface{} to satisfy the queue.AIService interface while
	// allowing the compiler to see the concrete type via type assertion.
	type aiPayload interface {
		getJobType() string
	}

	// Import the payload type from queue package via a local struct mirror
	// to avoid an import cycle. The queue package imports models; ai should not
	// import queue. Instead, we use a local adapter struct below.
	return nil, fmt.Errorf("ProcessJob: use typed method dispatch via ServiceAdapter")
}

// ─── GetJob ───────────────────────────────────────────────────────────────────

// GetJob returns an AIJob by ID, scoped to the workspace.
func (s *Service) GetJob(ctx context.Context, jobID, workspaceID uuid.UUID) (*models.AIJob, error) {
	var job models.AIJob
	if err := s.db.WithContext(ctx).
		First(&job, "id = ? AND workspace_id = ?", jobID, workspaceID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrJobNotFound
		}
		return nil, fmt.Errorf("GetJob: %w", err)
	}
	return &job, nil
}

// ─── fal.ai request helper ────────────────────────────────────────────────────

type falResponse struct {
	Images []struct {
		URL      string `json:"url"`
		Width    int    `json:"width"`
		Height   int    `json:"height"`
		MimeType string `json:"content_type"`
	} `json:"images"`
	Video struct {
		URL string `json:"url"`
	} `json:"video"`
}

func (s *Service) falRequest(ctx context.Context, model string, body map[string]interface{}) (map[string]interface{}, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	url := fmt.Sprintf("https://fal.run/%s", model)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Key "+s.falAPIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fal.ai request: %w", err)
	}
	defer resp.Body.Close()

	rawBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("fal.ai read body: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("fal.ai error %d: %s", resp.StatusCode, string(rawBody))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(rawBody, &result); err != nil {
		return nil, fmt.Errorf("fal.ai decode: %w", err)
	}
	return result, nil
}

func extractImageResult(raw map[string]interface{}) *ImageResult {
	result := &ImageResult{}
	images, _ := raw["images"].([]interface{})
	if len(images) > 0 {
		if img, ok := images[0].(map[string]interface{}); ok {
			result.URL, _ = img["url"].(string)
			if w, ok := img["width"].(float64); ok {
				result.Width = int(w)
			}
			if h, ok := img["height"].(float64); ok {
				result.Height = int(h)
			}
			result.MimeType, _ = img["content_type"].(string)
		}
	}
	return result
}

// ─── utility ──────────────────────────────────────────────────────────────────

func truncate(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n]) + "…"
}
