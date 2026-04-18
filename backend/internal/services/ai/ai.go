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
	"sync"
	"time"

	openai "github.com/sashabaranov/go-openai"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/google/uuid"
	"github.com/socialforge/backend/internal/crypto"
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
	"instagram": `Instagram Feed Post:
- Hook in the first line (this appears above "...more")
- Use line breaks for readability (no walls of text)
- 2,200 char limit but 150-300 is optimal for engagement
- Include a clear CTA (save this, share with a friend, comment below)
- Place 20-30 relevant hashtags at the very end after 5 line breaks
- Use emojis strategically to break up text (not excessively)
- Write as if speaking to one person, not a crowd
- Carousel posts: make the first slide a bold statement/question
- Reels captions: keep under 150 chars, hook + CTA only`,

	"tiktok": `TikTok:
- First 2 seconds = the hook (pattern interrupt, bold claim, or question)
- Keep caption under 150 characters (longer gets truncated)
- 3-5 trending + niche hashtags
- Casual, authentic voice — NO corporate speak
- Include a CTA: "Follow for more", "Save this", "Stitch this"
- Use line breaks — TikTok truncates after ~80 chars
- For video scripts: open with "Wait—", "POV:", "This is your sign to..."`,

	"linkedin": `LinkedIn:
- First line is EVERYTHING — it appears before "...see more"
- Open with a bold statement, counter-intuitive take, or personal story
- Short paragraphs (1-2 sentences max per paragraph)
- Line breaks between every paragraph for mobile readability
- 3,000 char limit but optimal is 1,300-1,500
- End with a question to drive comments (algorithm loves comments)
- 3-5 industry-relevant hashtags at the bottom
- Avoid links in the post body (kills reach) — put links in comments
- Write in first person, share lessons learned, show vulnerability
- NO hashtag-stuffing, NO emoji-overload — maintain professionalism`,

	"twitter": `Twitter/X:
- 280 character limit — every word must earn its place
- Lead with the most compelling part of your message
- Use threads for longer content (number each tweet: 1/, 2/, etc.)
- 1-2 hashtags max, inline (not at the end)
- Controversial takes and strong opinions drive engagement
- Ask questions to drive replies
- Use line breaks for emphasis
- For threads: first tweet must stand alone and hook readers`,

	"facebook": `Facebook:
- Optimal length: 40-80 characters for highest engagement
- But storytelling posts (300-500 chars) perform well in groups
- Ask questions that invite comments
- 0-3 hashtags (Facebook de-prioritizes hashtag-heavy posts)
- Personal stories and behind-the-scenes content performs best
- Include a CTA: "What do you think?", "Tag someone who needs this"
- Avoid engagement bait ("Like if you agree") — Facebook penalises it
- Native video descriptions should be detailed (helps discovery)`,

	"youtube": `YouTube Description:
- First 150 characters appear in search results — front-load keywords
- Structure: 2-3 keyword-rich paragraphs describing the video
- Include timestamps for key sections (chapters)
- Add relevant links (subscribe, social media, resources mentioned)
- Use natural language with target keywords woven in
- End with a list of 10-15 tags (comma-separated)
- Include a subscribe CTA and links to related videos
- Total length: 500-2000 chars optimal for SEO`,

	"pinterest": `Pinterest Pin:
- Title: 40-100 characters, keyword-rich, compelling
- Description: up to 500 characters
- Front-load the most important keywords (SEO-first platform)
- Write as a search query answer — what would someone search to find this?
- Include a clear value proposition
- Use natural language, avoid hashtag-stuffing
- Think "how-to", "tips for", "best [topic]" — Pinterest is a search engine`,

	"threads": `Threads:
- Casual, conversational tone — this is the anti-LinkedIn
- 500 character limit
- 0-3 hashtags (less is more)
- Hot takes, personal opinions, and humor perform best
- Reply-bait: ask a question or make a debatable statement
- Short-form works better than long-form
- Use plain language — no corporate jargon`,

	"bluesky": `Bluesky:
- 300 character limit (similar to early Twitter)
- Authentic, community-first tone
- Tech-savvy audience — be genuine, skip the marketing speak
- 0-2 hashtags (community is still forming conventions)
- Link posts are welcome (no algorithm penalty)
- Conversational, thoughtful — quality over virality`,
}

// ─── Service ─────────────────────────────────────────────────────────────────

// Service provides all AI content generation capabilities.
// API keys and credit costs are refreshed from the database every 60 seconds,
// allowing admin to reconfigure them at runtime without restarting the server.
type Service struct {
	db         *gorm.DB
	httpClient *http.Client
	log        *zap.Logger

	// mu protects all mutable config fields below.
	mu               sync.RWMutex
	encryptSecret    string
	fallbackOpenAIKey string
	fallbackFalKey    string
	cachedOpenAIKey  string
	cachedFalKey     string
	openaiClient     *openai.Client
	creditCosts      map[string]int
	lastRefreshed    time.Time
}

// New creates a new AI Service. The encryptSecret is used to decrypt API keys
// stored in the platform_settings table. Environment-variable keys serve as
// fallbacks when the database has no key configured.
func New(db *gorm.DB, openaiAPIKey, falAPIKey, encryptSecret string, log *zap.Logger) *Service {
	s := &Service{
		db:                db,
		httpClient:        &http.Client{Timeout: 120 * time.Second},
		log:               log,
		encryptSecret:     encryptSecret,
		fallbackOpenAIKey: openaiAPIKey,
		fallbackFalKey:    falAPIKey,
		cachedOpenAIKey:   openaiAPIKey,
		cachedFalKey:      falAPIKey,
		creditCosts:       make(map[string]int),
	}
	if openaiAPIKey != "" {
		s.openaiClient = openai.NewClient(openaiAPIKey)
	}
	return s
}

// refreshConfig reloads API keys from platform_settings and credit costs from
// ai_job_costs. Called under write lock.
func (s *Service) refreshConfig() {
	s.mu.Lock()
	defer s.mu.Unlock()

	// 1. API keys from platform_settings
	var settings []struct {
		Key   string `gorm:"column:key"`
		Value string `gorm:"column:value"`
	}
	s.db.Table("platform_settings").
		Where("key IN ?", []string{"openai_api_key", "fal_api_key"}).
		Find(&settings)

	newOpenAI := s.fallbackOpenAIKey
	newFal := s.fallbackFalKey
	for _, row := range settings {
		if row.Value == "" {
			continue
		}
		decrypted, err := crypto.Decrypt(row.Value, s.encryptSecret)
		if err != nil {
			s.log.Warn("failed to decrypt platform setting", zap.String("key", row.Key), zap.Error(err))
			continue
		}
		switch row.Key {
		case "openai_api_key":
			newOpenAI = decrypted
		case "fal_api_key":
			newFal = decrypted
		}
	}

	if newOpenAI != s.cachedOpenAIKey && newOpenAI != "" {
		s.openaiClient = openai.NewClient(newOpenAI)
		s.cachedOpenAIKey = newOpenAI
		s.log.Info("OpenAI API key updated from platform_settings")
	}
	if newFal != s.cachedFalKey {
		s.cachedFalKey = newFal
		s.log.Info("Fal.ai API key updated from platform_settings")
	}

	// 2. Credit costs from ai_job_costs
	var costs []struct {
		JobType string `gorm:"column:job_type"`
		Credits int    `gorm:"column:credits"`
	}
	s.db.Table("ai_job_costs").Where("is_active = true").Find(&costs)
	if len(costs) > 0 {
		m := make(map[string]int, len(costs))
		for _, c := range costs {
			m[c.JobType] = c.Credits
		}
		s.creditCosts = m
	}

	s.lastRefreshed = time.Now()
}

// maybeRefresh triggers a config reload if the cache is older than 60 seconds.
func (s *Service) maybeRefresh() {
	s.mu.RLock()
	stale := time.Since(s.lastRefreshed) > 60*time.Second
	s.mu.RUnlock()
	if stale {
		s.refreshConfig()
	}
}

// getOpenAIClient returns the current OpenAI client, refreshing config if stale.
func (s *Service) getOpenAIClient() *openai.Client {
	s.maybeRefresh()
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.openaiClient
}

// requireOpenAIClient returns the current OpenAI client or a descriptive error
// if no API key has been configured. Callers should use this instead of
// getOpenAIClient() to avoid nil-pointer panics.
func (s *Service) requireOpenAIClient() (*openai.Client, error) {
	client := s.getOpenAIClient()
	if client == nil {
		return nil, fmt.Errorf("OpenAI API key not configured — set OPENAI_API_KEY or configure it via Admin › Settings › Integrations")
	}
	return client, nil
}

// getFalAPIKey returns the current fal.ai key, refreshing config if stale.
func (s *Service) getFalAPIKey() string {
	s.maybeRefresh()
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cachedFalKey
}

// getCreditCost returns the DB-configured credit cost for a job type,
// falling back to the provided default if not found.
func (s *Service) getCreditCost(jobType string, fallback int) int {
	s.maybeRefresh()
	s.mu.RLock()
	defer s.mu.RUnlock()
	if v, ok := s.creditCosts[jobType]; ok {
		return v
	}
	return fallback
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

// RefundCredits adds credits back to a workspace, capped at zero minimum.
// Used to undo a DeductCredits call when an async job fails.
func (s *Service) RefundCredits(ctx context.Context, workspaceID uuid.UUID, amount int) error {
	result := s.db.WithContext(ctx).
		Model(&models.Workspace{}).
		Where("id = ?", workspaceID).
		UpdateColumn("ai_credits_used", gorm.Expr("GREATEST(ai_credits_used - ?, 0)", amount))
	if result.Error != nil {
		return fmt.Errorf("RefundCredits: %w", result.Error)
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
	if err := s.DeductCredits(ctx, workspaceID, s.getCreditCost("caption", CreditCostCaption)); err != nil {
		return nil, nil, err
	}

	guidance := platformGuidance[platform]
	if guidance == "" {
		guidance = platform
	}

	// Hard character limits for platforms that enforce them strictly.
	// These must appear as a top-priority rule so the model doesn't exceed them.
	platformHardLimits := map[string]int{
		"twitter":  280,
		"bluesky":  300,
		"threads":  500,
	}
	var hardLimitRule string
	if limit, ok := platformHardLimits[platform]; ok {
		hardLimitRule = fmt.Sprintf(`
⚠️ CRITICAL HARD LIMIT: This platform enforces a STRICT %d-character maximum. Your "caption" value MUST be %d characters or fewer — count every character including spaces, emojis (which count as 2), and newlines. If it exceeds %d characters the post will be rejected. Write tight, punchy, every-word-counts copy. Do NOT exceed this limit under any circumstances.
`, limit, limit, limit)
	}

	// LinkedIn-specific hashtag reminder: the platform guidance says 3-5 hashtags
	// but GPT tends to omit them from the caption body. Remind it explicitly.
	var linkedinHashtagRule string
	if platform == "linkedin" {
		linkedinHashtagRule = "\n10. LinkedIn hashtags: add 3-5 relevant industry hashtags at the very end of the caption body (e.g. #FitnessGoals #Nutrition #AthleteLife)."
	}

	systemPrompt := fmt.Sprintf(
		`You are an elite social media strategist who has grown 100+ accounts to 1M+ followers.
%s
PLATFORM:
%s

YOUR TASK: Write a high-converting, scroll-stopping caption that drives maximum engagement.

RULES:
1. Hook first — the opening line must stop the scroll. Use a bold claim, surprising stat, counter-intuitive take, or relatable pain point.
2. Structure for readability — use short paragraphs, line breaks, and strategic formatting.
3. Match the platform's native voice — don't sound like an ad. Sound like a top creator on this platform.
4. Include a strong CTA — tell readers exactly what to do (save, share, comment, follow).
5. Be specific and concrete — avoid generic advice. Use numbers, examples, and vivid language.
6. Write for EMOTION — content that triggers curiosity, surprise, or "I need to save this" performs best.
7. NEVER use clichés like "In today's fast-paced world", "Game-changer", "Unlock your potential".
8. Tone: %s
9. Target audience: %s%s

Return a JSON object with exactly two keys:
- "caption": the complete post caption (string)
- "hashtags": array of relevant hashtags without # prefix (string[])

Make the caption feel like it was written by a human who genuinely cares about helping their audience, not by AI.`,
		hardLimitRule, guidance, tone, targetAudience, linkedinHashtagRule,
	)

	openaiClient, err := s.requireOpenAIClient()
	if err != nil {
		job, _ := s.saveJob(ctx, workspaceID, userID, "caption",
			models.JSONMap{"prompt": prompt, "platform": platform, "tone": tone},
			nil, s.getCreditCost("caption", CreditCostCaption), err.Error())
		return nil, job, fmt.Errorf("GenerateCaption: %w", err)
	}
	resp, err := openaiClient.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model: "gpt-4o",
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
			nil, s.getCreditCost("caption", CreditCostCaption), err.Error())
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
		s.getCreditCost("caption", CreditCostCaption), "")

	return &result, job, nil
}

// ─── GenerateHashtags ─────────────────────────────────────────────────────────

// GenerateHashtags returns a list of relevant hashtags for the given content.
func (s *Service) GenerateHashtags(
	ctx context.Context,
	workspaceID, userID uuid.UUID,
	content, platform, niche string,
) ([]string, *models.AIJob, error) {
	if err := s.DeductCredits(ctx, workspaceID, s.getCreditCost("hashtags", CreditCostHashtags)); err != nil {
		return nil, nil, err
	}

	systemPrompt := fmt.Sprintf(
		`You are a social media growth specialist who understands hashtag strategy deeply.

PLATFORM: %s
NICHE: %s

Generate a strategic hashtag set following the 3-tier strategy:
- 5 HIGH-VOLUME tags (500K+ posts) — for discovery
- 5 MID-TIER tags (50K-500K posts) — for competition balance
- 5 NICHE-SPECIFIC tags (under 50K posts) — for ranking potential

RULES:
1. Every hashtag must be directly relevant to the content
2. Mix broad appeal with laser-targeted niche tags
3. Include 2-3 trending/seasonal tags if applicable
4. Avoid banned or shadow-banned hashtags
5. Order from most to least popular
6. Each hashtag should be a single word or short phrase (no spaces)

Return JSON: {"hashtags": ["tag1", "tag2", ...]}
Do NOT include the # prefix.`,
		platform, niche,
	)

	openaiClient, err := s.requireOpenAIClient()
	if err != nil {
		job, _ := s.saveJob(ctx, workspaceID, userID, "hashtags",
			models.JSONMap{"platform": platform, "niche": niche},
			nil, s.getCreditCost("hashtags", CreditCostHashtags), err.Error())
		return nil, job, fmt.Errorf("GenerateHashtags: %w", err)
	}
	resp, err := openaiClient.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model: "gpt-4o",
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
			nil, s.getCreditCost("hashtags", CreditCostHashtags), err.Error())
		return nil, job, fmt.Errorf("GenerateHashtags: openai: %w", err)
	}

	var out struct {
		Hashtags []string `json:"hashtags"`
	}
	_ = json.Unmarshal([]byte(resp.Choices[0].Message.Content), &out)

	job, _ := s.saveJob(ctx, workspaceID, userID, "hashtags",
		models.JSONMap{"platform": platform, "niche": niche, "content_preview": truncate(content, 200)},
		models.JSONMap{"hashtags": out.Hashtags},
		s.getCreditCost("hashtags", CreditCostHashtags), "")

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
	prompt, style, aspectRatio string,
) (*ImageResult, *models.AIJob, error) {
	if err := s.DeductCredits(ctx, workspaceID, s.getCreditCost("image", CreditCostImage)); err != nil {
		return nil, nil, err
	}

	enhancedPrompt := prompt
	if style != "" {
		enhancedPrompt = fmt.Sprintf(
			"%s. Art style: %s. High quality, professional composition, "+
				"sharp details, vibrant colors, suitable for social media post. "+
				"No text overlays unless specified. No watermarks.",
			prompt, style)
	} else {
		enhancedPrompt = fmt.Sprintf(
			"%s. High quality, professional composition, sharp details, "+
				"vibrant colors, suitable for social media. No watermarks.",
			prompt)
	}

	reqBody := map[string]interface{}{
		"prompt":                enhancedPrompt,
		"image_size":            aspectRatioToImageSize(aspectRatio),
		"num_images":            1,
		"num_inference_steps":   28,
		"enable_safety_checker": true,
	}

	result, err := s.falRequest(ctx, "fal-ai/flux/dev", reqBody)
	if err != nil {
		job, _ := s.saveJob(ctx, workspaceID, userID, "image",
			models.JSONMap{"prompt": prompt, "style": style},
			nil, s.getCreditCost("image", CreditCostImage), err.Error())
		return nil, job, fmt.Errorf("GenerateImage: fal.ai: %w", err)
	}

	imageResult := extractImageResult(result)
	job, _ := s.saveJob(ctx, workspaceID, userID, "image",
		models.JSONMap{"prompt": prompt, "style": style},
		models.JSONMap{"url": imageResult.URL, "width": imageResult.Width, "height": imageResult.Height},
		s.getCreditCost("image", CreditCostImage), "")

	return imageResult, job, nil
}

// aspectRatioToImageSize maps the user-facing aspect ratio string to a fal.ai
// image_size preset. Falls back to "square_hd" for unknown values.
func aspectRatioToImageSize(ar string) string {
	switch ar {
	case "9:16":
		return "portrait_16_9"
	case "16:9":
		return "landscape_16_9"
	default: // "1:1" or empty
		return "square_hd"
	}
}

// GenerateImageRaw makes the fal.ai API call and returns the image result
// without any DB side effects (no credit deduction, no job record creation).
// Used by handlers that manage credits and job records themselves.
func (s *Service) GenerateImageRaw(ctx context.Context, prompt, style, aspectRatio string) (*ImageResult, error) {
	enhancedPrompt := prompt
	if style != "" {
		enhancedPrompt = fmt.Sprintf(
			"%s. Art style: %s. High quality, professional composition, "+
				"sharp details, vibrant colors, suitable for social media post. "+
				"No text overlays unless specified. No watermarks.",
			prompt, style)
	} else {
		enhancedPrompt = fmt.Sprintf(
			"%s. High quality, professional composition, sharp details, "+
				"vibrant colors, suitable for social media. No watermarks.",
			prompt)
	}

	reqBody := map[string]interface{}{
		"prompt":                enhancedPrompt,
		"image_size":            aspectRatioToImageSize(aspectRatio),
		"num_images":            1,
		"num_inference_steps":   28,
		"enable_safety_checker": true,
	}

	// Use flux/dev for higher quality output (full diffusion, 28 steps).
	result, err := s.falRequest(ctx, "fal-ai/flux/dev", reqBody)
	if err != nil {
		return nil, fmt.Errorf("GenerateImageRaw: fal.ai: %w", err)
	}
	return extractImageResult(result), nil
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
	if err := s.DeductCredits(ctx, workspaceID, s.getCreditCost("video", CreditCostVideo)); err != nil {
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
		CreditsUsed:   s.getCreditCost("video", CreditCostVideo),
		RequestedByID: userID,
	}
	if err := s.db.WithContext(ctx).Create(job).Error; err != nil {
		return nil, fmt.Errorf("GenerateVideo: create job record: %w", err)
	}

	// Fire async — wrap in goroutine so the handler returns immediately.
	capturedWorkspaceID := workspaceID
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 35*time.Minute)
		defer cancel()

		enhancedPrompt := fmt.Sprintf(
			"%s. Cinematic quality, smooth motion, professional lighting, "+
				"engaging visual narrative. Optimized for social media vertical video (9:16). "+
				"Clean transitions, no text overlays unless specified.",
			prompt)
		if style != "" {
			enhancedPrompt = fmt.Sprintf(
				"%s. Visual style: %s. Cinematic quality, smooth motion, "+
					"professional lighting, engaging visual narrative. "+
					"Optimized for social media vertical video (9:16).",
				prompt, style)
		}
		// Kling v1.6 Pro accepts 5 or 10 as duration values.
		falDuration := 5
		if duration >= 10 {
			falDuration = 10
		}
		reqBody := map[string]interface{}{
			"prompt":       enhancedPrompt,
			"duration":     falDuration,
			"aspect_ratio": "9:16",
		}

		result, err := s.falQueueRequest(bgCtx, "fal-ai/kling-video/v1.6/pro/text-to-video", reqBody)
		now := time.Now().UTC()
		if err != nil {
			s.db.Model(job).Updates(map[string]interface{}{
				"status":        "failed",
				"error_message": err.Error(),
				"completed_at":  now,
			})
			_ = s.RefundCredits(context.Background(), capturedWorkspaceID, job.CreditsUsed)
			return
		}

		var videoURL string
		if v, ok := result["video"].(map[string]interface{}); ok {
			videoURL, _ = v["url"].(string)
		}

		s.db.Model(job).Updates(map[string]interface{}{
			"status":       "completed",
			"output_data":  models.JSONMap{"url": videoURL, "duration": duration},
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
	if err := s.DeductCredits(ctx, workspaceID, s.getCreditCost("carousel", CreditCostCarousel)); err != nil {
		return nil, nil, err
	}

	systemPrompt := fmt.Sprintf(
		`You are a carousel content expert who creates swipeable, save-worthy carousel posts.

PLATFORM: %s
SLIDES: %d

Create a carousel using the proven viral carousel framework:

SLIDE 1 (THE HOOK): Bold statement, surprising question, or pattern interrupt.
- Must make someone stop scrolling and swipe
- Short, punchy headline (max 8 words)
- Examples: "Stop doing [common mistake]", "[Number] things I wish I knew about [topic]"

SLIDES 2-%d (THE VALUE): Each slide delivers ONE clear takeaway.
- One idea per slide — don't overcrowd
- Headline: max 8 words, bold energy
- Body: max 2 sentences, actionable and specific
- Progress logically

SLIDE %d (THE CTA): Strong closing with clear next step.
- Summarize the key message
- Specific CTA: "Save for later", "Share with someone who needs this", "Follow for more"
- Create urgency or FOMO

Return JSON:
{
  "slides": [
    {
      "slide_number": 1,
      "headline": "<max 60 chars>",
      "body_text": "<max 150 chars>",
      "call_to_action": "<only on last slide>",
      "image_prompt": "<describe ideal visual for this slide>"
    }
  ]
}`,
		platform, slides, slides-1, slides,
	)

	openaiClient, err := s.requireOpenAIClient()
	if err != nil {
		job, _ := s.saveJob(ctx, workspaceID, userID, "carousel",
			models.JSONMap{"topic": topic, "slides": slides, "platform": platform},
			nil, s.getCreditCost("carousel", CreditCostCarousel), err.Error())
		return nil, job, fmt.Errorf("GenerateCarousel: %w", err)
	}
	resp, err := openaiClient.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model: "gpt-4o",
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
			nil, s.getCreditCost("carousel", CreditCostCarousel), err.Error())
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
		s.getCreditCost("carousel", CreditCostCarousel), "")

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
	if err := s.DeductCredits(ctx, workspaceID, s.getCreditCost("analyse", CreditCostAnalyse)); err != nil {
		return nil, nil, err
	}

	systemPrompt := fmt.Sprintf(
		`You are a data-driven social media analyst who has studied millions of viral posts.

PLATFORM: %s

Analyse this content and provide a brutally honest viral potential assessment.

Score criteria (each out of 20, total 100):
1. HOOK STRENGTH (0-20): Does the first line stop the scroll?
2. EMOTIONAL TRIGGER (0-20): Does it evoke curiosity, surprise, anger, joy, or FOMO?
3. SHAREABILITY (0-20): Would someone tag a friend or share to their story?
4. PLATFORM FIT (0-20): Does it follow %s best practices and native format?
5. CTA EFFECTIVENESS (0-20): Is there a clear, compelling call-to-action?

Return JSON:
{
  "score": <int 0-100>,
  "grade": "<A/B/C/D/F>",
  "strengths": ["<specific strength>", "<specific strength>", "<specific strength>"],
  "improvements": ["<actionable fix with example>", "<actionable fix with example>", "<actionable fix with example>"],
  "optimal_post_time": "<e.g. Tuesday 6-8 PM EST>",
  "estimated_reach": "<e.g. 2,000-8,000 impressions based on content quality>"
}

Be specific — not "improve the hook" but "Replace the opening with a surprising statistic or bold claim like: [example]".`,
		platform, platform,
	)

	openaiClient, err := s.requireOpenAIClient()
	if err != nil {
		job, _ := s.saveJob(ctx, workspaceID, userID, "analyse",
			models.JSONMap{"platform": platform, "content_preview": truncate(content, 200)},
			nil, s.getCreditCost("analyse", CreditCostAnalyse), err.Error())
		return nil, job, fmt.Errorf("AnalyseViralPotential: %w", err)
	}
	resp, err := openaiClient.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model: "gpt-4o",
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
			nil, s.getCreditCost("analyse", CreditCostAnalyse), err.Error())
		return nil, job, fmt.Errorf("AnalyseViralPotential: openai: %w", err)
	}

	var analysis ViralAnalysis
	if jsonErr := json.Unmarshal([]byte(resp.Choices[0].Message.Content), &analysis); jsonErr != nil {
		return nil, nil, fmt.Errorf("AnalyseViralPotential: parse response: %w", jsonErr)
	}

	job, _ := s.saveJob(ctx, workspaceID, userID, "analyse",
		models.JSONMap{"platform": platform, "content_preview": truncate(content, 200)},
		models.JSONMap{"score": analysis.Score, "grade": analysis.Grade},
		s.getCreditCost("analyse", CreditCostAnalyse), "")

	return &analysis, job, nil
}

// ─── ProcessJob ───────────────────────────────────────────────────────────────

// processJobPayload is a local mirror of queue.AIGeneratePayload used to avoid
// an import cycle (queue → ai; ai must not import queue).
type processJobPayload struct {
	JobID          uuid.UUID `json:"job_id"`
	WorkspaceID    uuid.UUID `json:"workspace_id"`
	UserID         uuid.UUID `json:"user_id"`
	JobType        string    `json:"job_type"`
	Prompt         string    `json:"prompt"`
	Platform       string    `json:"platform"`
	Tone           string    `json:"tone"`
	TargetAudience string    `json:"target_audience"`
	Style          string    `json:"style"`
	Niche          string    `json:"niche"`
	Content        string    `json:"content"`
	SourceURL      string    `json:"source_url"`
	Platforms      []string  `json:"platforms"`
	Slides         int       `json:"slides"`
	Duration       int       `json:"duration"`
}

// ProcessJob is called by the asynq AIGenerateHandler and dispatches to the
// appropriate typed method based on JobType. The payload is marshalled to JSON
// and decoded into a local mirror struct to avoid an import cycle with the
// queue package. Credits are deducted inside each Generate* method, so the
// calling code must NOT pre-deduct credits before enqueueing.
func (s *Service) ProcessJob(ctx context.Context, p interface{}) (map[string]interface{}, error) {
	b, err := json.Marshal(p)
	if err != nil {
		return nil, fmt.Errorf("ProcessJob: marshal payload: %w", err)
	}
	var payload processJobPayload
	if err := json.Unmarshal(b, &payload); err != nil {
		return nil, fmt.Errorf("ProcessJob: unmarshal payload: %w", err)
	}

	tone := payload.Tone
	if tone == "" {
		tone = "engaging"
	}
	audience := payload.TargetAudience
	if audience == "" {
		audience = "general audience"
	}

	switch payload.JobType {
	case "caption":
		result, _, err := s.GenerateCaption(ctx, payload.WorkspaceID, payload.UserID,
			payload.Prompt, payload.Platform, tone, audience)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"caption": result.Caption, "hashtags": result.Hashtags}, nil

	case "hashtags":
		tags, _, err := s.GenerateHashtags(ctx, payload.WorkspaceID, payload.UserID,
			payload.Content, payload.Platform, payload.Niche)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"hashtags": tags}, nil

	case "image":
		result, _, err := s.GenerateImage(ctx, payload.WorkspaceID, payload.UserID,
			payload.Prompt, payload.Style, "")
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"url": result.URL, "width": result.Width, "height": result.Height}, nil

	case "video":
		// Video is already asynchronous inside GenerateVideo (goroutine + job record).
		// We just need to trigger it; the job status is polled separately.
		job, err := s.GenerateVideo(ctx, payload.WorkspaceID, payload.UserID,
			payload.Prompt, payload.Duration, payload.Style)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"job_id": job.ID}, nil

	case "carousel":
		slides, _, err := s.GenerateCarousel(ctx, payload.WorkspaceID, payload.UserID,
			payload.Prompt, payload.Slides, payload.Platform)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"slides": slides}, nil

	case "analyse":
		analysis, _, err := s.AnalyseViralPotential(ctx, payload.WorkspaceID, payload.UserID,
			payload.Content, payload.Platform)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"analysis": analysis}, nil

	default:
		return nil, fmt.Errorf("ProcessJob: unknown job_type %q", payload.JobType)
	}
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
	req.Header.Set("Authorization", "Key "+s.getFalAPIKey())
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

// falQueueRequest submits a job to fal.ai's async queue, then polls until done.
// This avoids holding a long-lived TCP connection open and allows clean cancellation.
func (s *Service) falQueueRequest(ctx context.Context, model string, body map[string]interface{}) (map[string]interface{}, error) {
	// 1. Submit to queue
	b, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	submitURL := fmt.Sprintf("https://queue.fal.run/%s", model)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, submitURL, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Key "+s.getFalAPIKey())
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fal.ai queue submit: %w", err)
	}
	rawBody, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("fal.ai queue submit error %d: %s", resp.StatusCode, string(rawBody))
	}
	var submitResp map[string]interface{}
	if err := json.Unmarshal(rawBody, &submitResp); err != nil {
		return nil, fmt.Errorf("fal.ai queue submit decode: %w", err)
	}
	requestID, _ := submitResp["request_id"].(string)
	if requestID == "" {
		return nil, fmt.Errorf("fal.ai queue submit: no request_id in response")
	}

	// 2. Poll status until completed or failed
	statusURL := fmt.Sprintf("https://queue.fal.run/%s/requests/%s/status", model, requestID)
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("fal.ai queue: context cancelled while waiting for %s", requestID)
		case <-ticker.C:
			sreq, err := http.NewRequestWithContext(ctx, http.MethodGet, statusURL, nil)
			if err != nil {
				return nil, err
			}
			sreq.Header.Set("Authorization", "Key "+s.getFalAPIKey())
			sresp, err := s.httpClient.Do(sreq)
			if err != nil {
				// transient error — keep polling
				continue
			}
			sBody, _ := io.ReadAll(sresp.Body)
			sresp.Body.Close()
			var statusResp map[string]interface{}
			if err := json.Unmarshal(sBody, &statusResp); err != nil {
				continue
			}
			status, _ := statusResp["status"].(string)
			switch status {
			case "COMPLETED":
				// 3. Fetch result
				resultURL := fmt.Sprintf("https://queue.fal.run/%s/requests/%s", model, requestID)
				rreq, err := http.NewRequestWithContext(ctx, http.MethodGet, resultURL, nil)
				if err != nil {
					return nil, err
				}
				rreq.Header.Set("Authorization", "Key "+s.getFalAPIKey())
				rresp, err := s.httpClient.Do(rreq)
				if err != nil {
					return nil, fmt.Errorf("fal.ai queue result fetch: %w", err)
				}
				rBody, _ := io.ReadAll(rresp.Body)
				rresp.Body.Close()
				if rresp.StatusCode >= 400 {
					return nil, fmt.Errorf("fal.ai queue result error %d: %s", rresp.StatusCode, string(rBody))
				}
				var result map[string]interface{}
				if err := json.Unmarshal(rBody, &result); err != nil {
					return nil, fmt.Errorf("fal.ai queue result decode: %w", err)
				}
				return result, nil
			case "FAILED":
				errMsg, _ := statusResp["error"].(string)
				return nil, fmt.Errorf("fal.ai queue job failed: %s", errMsg)
			// IN_QUEUE, IN_PROGRESS — keep polling
			}
		}
	}
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

// ─── Repurpose ────────────────────────────────────────────────────────────────

// RepurposeInput describes a repurpose request from the API layer.
type RepurposeInput struct {
	SourceType  string   // "text" | "url" | "youtube" | "tiktok"
	SourceURL   string
	SourceText  string
	Platforms   []string
	YoutubeAPIKey string
}

// Repurpose dispatches to the appropriate package-level repurpose function and
// returns a map of platform → PlatformDraft.
func (s *Service) Repurpose(ctx context.Context, input RepurposeInput) (map[string]PlatformDraft, error) {
	oaiClient, err := s.requireOpenAIClient()
	if err != nil {
		return nil, fmt.Errorf("Repurpose: %w", err)
	}
	switch input.SourceType {
	case "url", "tiktok":
		return RepurposeFromURL(ctx, input.SourceURL, input.Platforms, oaiClient)
	case "youtube":
		return RepurposeFromYouTube(ctx, input.SourceURL, input.Platforms, input.YoutubeAPIKey, oaiClient)
	default: // "text" or anything else
		return RepurposeFromText(ctx, input.SourceText, input.SourceType, input.Platforms, oaiClient)
	}
}

// ─── utility ──────────────────────────────────────────────────────────────────

func truncate(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n]) + "…"
}
