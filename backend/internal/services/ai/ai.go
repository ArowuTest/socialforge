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
		`You are an elite social media strategist who has grown 100+ accounts to 1M+ followers.

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
9. Target audience: %s

Return a JSON object with exactly two keys:
- "caption": the complete post caption (string)
- "hashtags": array of relevant hashtags without # prefix (string[])

Make the caption feel like it was written by a human who genuinely cares about helping their audience, not by AI.`,
		guidance, tone, targetAudience,
	)

	resp, err := s.openaiClient.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
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

	resp, err := s.openaiClient.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
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
		reqBody := map[string]interface{}{
			"prompt":       enhancedPrompt,
			"duration":     duration,
			"aspect_ratio": "9:16",
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

	resp, err := s.openaiClient.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
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

	resp, err := s.openaiClient.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
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
	switch input.SourceType {
	case "url", "tiktok":
		return RepurposeFromURL(ctx, input.SourceURL, input.Platforms, s.openaiClient)
	case "youtube":
		return RepurposeFromYouTube(ctx, input.SourceURL, input.Platforms, input.YoutubeAPIKey, s.openaiClient)
	default: // "text" or anything else
		return RepurposeFromText(ctx, input.SourceText, input.SourceType, input.Platforms, s.openaiClient)
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
