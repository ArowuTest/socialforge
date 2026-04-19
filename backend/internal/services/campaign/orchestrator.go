// Package campaign implements the AI Campaign Orchestrator — the backend
// pipeline that takes a campaign brief + brand kit and generates a full content
// calendar (captions, images, videos) using OpenAI and fal.ai.
package campaign

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/crypto"
	"github.com/socialforge/backend/internal/models"
	"github.com/socialforge/backend/internal/queue"
)

// ─── OpenAI wire types ────────────────────────────────────────────────────────

type openAIRequest struct {
	Model       string      `json:"model"`
	Messages    []openAIMsg `json:"messages"`
	Temperature float64     `json:"temperature"`
	MaxTokens   int         `json:"max_tokens"`
}

type openAIMsg struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAIResponse struct {
	Choices []struct {
		Message openAIMsg `json:"message"`
	} `json:"choices"`
}

// ─── PostSlot ─────────────────────────────────────────────────────────────────

// PostSlot is an internal representation of a single content slot returned by
// the content strategy step.
type PostSlot struct {
	ScheduledFor  time.Time `json:"scheduled_for"`
	Platform      string    `json:"platform"`
	PostType      string    `json:"post_type"`    // "image", "video", "text", "carousel"
	ContentPillar string    `json:"content_pillar"`
	KeyMessage    string    `json:"key_message"`
	VisualStyle   string    `json:"visual_style"`
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

// Orchestrator handles end-to-end AI campaign generation.
type Orchestrator struct {
	db              *gorm.DB
	asynq           *asynq.Client
	encryptSecret   string
	fallbackOpenAI  string
	fallbackFal     string
	httpClient      *http.Client // standard — images, OpenAI, status polls
	videoHTTPClient *http.Client // extended — Kling video (~2–8 min)
	log             *zap.Logger
}

// New creates a new Orchestrator. openaiKey and falKey are env-variable fallbacks;
// the real keys are read from platform_settings (encrypted with encryptSecret).
func New(db *gorm.DB, asynqClient *asynq.Client, openaiKey, falKey, encryptSecret string, log *zap.Logger) *Orchestrator {
	return &Orchestrator{
		db:             db,
		asynq:          asynqClient,
		encryptSecret:  encryptSecret,
		fallbackOpenAI: openaiKey,
		fallbackFal:    falKey,
		// Standard client for fast API calls (OpenAI, fal.ai image/status).
		httpClient: &http.Client{Timeout: 120 * time.Second},
		// Long-timeout client for fal.ai video generation (Kling ~2–8 min).
		videoHTTPClient: &http.Client{Timeout: 15 * time.Minute},
		log:             log,
	}
}

// ─── Key loading ──────────────────────────────────────────────────────────────

// loadAPIKeys reads openai_api_key and fal_api_key from platform_settings,
// decrypts them, and falls back to the constructor-provided values.
func (o *Orchestrator) loadAPIKeys(ctx context.Context) (openaiKey, falKey string) {
	openaiKey = o.fallbackOpenAI
	falKey = o.fallbackFal

	var settings []struct {
		Key   string `gorm:"column:key"`
		Value string `gorm:"column:value"`
	}
	if err := o.db.WithContext(ctx).Table("platform_settings").
		Where("key IN ?", []string{"openai_api_key", "fal_api_key"}).
		Find(&settings).Error; err != nil {
		o.log.Warn("loadAPIKeys: failed to query platform_settings", zap.Error(err))
		return
	}
	for _, row := range settings {
		if row.Value == "" {
			continue
		}
		decrypted, err := crypto.Decrypt(row.Value, o.encryptSecret)
		if err != nil {
			o.log.Warn("loadAPIKeys: failed to decrypt key", zap.String("key", row.Key), zap.Error(err))
			continue
		}
		switch row.Key {
		case "openai_api_key":
			openaiKey = decrypted
		case "fal_api_key":
			falKey = decrypted
		}
	}
	return
}

// ─── GenerateCampaign ─────────────────────────────────────────────────────────

// GenerateCampaign is the top-level orchestration step.
// It builds the content strategy, creates CampaignPost records, and enqueues
// individual generate_post tasks.
func (o *Orchestrator) GenerateCampaign(ctx context.Context, campaignID, workspaceID uuid.UUID) error {
	log := o.log.With(
		zap.String("campaign_id", campaignID.String()),
		zap.String("workspace_id", workspaceID.String()),
	)
	log.Info("GenerateCampaign: starting")

	// 1. Load campaign (with BrandKit).
	var campaign models.Campaign
	if err := o.db.WithContext(ctx).
		Preload("BrandKit").
		First(&campaign, "id = ? AND workspace_id = ?", campaignID, workspaceID).Error; err != nil {
		return fmt.Errorf("GenerateCampaign: load campaign: %w", err)
	}

	// 2. Validate status.
	if campaign.Status != models.CampaignStatusGenerating {
		return fmt.Errorf("GenerateCampaign: campaign %s is not in 'generating' state (got %s)", campaignID, campaign.Status)
	}

	// Helper to mark campaign as failed.
	failCampaign := func(reason string) {
		o.db.WithContext(ctx).Model(&campaign).Updates(map[string]interface{}{
			"status":              models.CampaignStatusFailed,
			"generation_progress": models.JSONMap{"error": reason, "step": "failed"},
		})
		log.Error("GenerateCampaign: marked as failed", zap.String("reason", reason))
	}

	// 3. Update progress: step 1 — building strategy.
	if err := o.db.WithContext(ctx).Model(&campaign).Update("generation_progress", models.JSONMap{
		"step":        "strategy",
		"step_num":    1,
		"total_steps": 3,
	}).Error; err != nil {
		log.Warn("GenerateCampaign: failed to update progress", zap.Error(err))
	}

	// 4. Generate content strategy via OpenAI.
	log.Info("GenerateCampaign: generating content strategy")
	slots, err := o.generateContentStrategy(ctx, &campaign)
	if err != nil {
		failCampaign(err.Error())
		return fmt.Errorf("GenerateCampaign: strategy: %w", err)
	}
	log.Info("GenerateCampaign: strategy generated", zap.Int("slots", len(slots)))

	// 5. Create CampaignPost records.
	posts := make([]models.CampaignPost, 0, len(slots))
	for i, slot := range slots {
		post := models.CampaignPost{
			CampaignID:    campaignID,
			WorkspaceID:   workspaceID,
			ScheduledFor:  slot.ScheduledFor,
			Platform:      models.PlatformType(slot.Platform),
			PostType:      models.PostType(slot.PostType),
			ContentPillar: slot.ContentPillar,
			Status:        models.CampaignPostPendingGeneration,
			SortOrder:     i,
			AIPromptsUsed: models.JSONMap{
				"key_message":  slot.KeyMessage,
				"visual_style": slot.VisualStyle,
			},
		}
		if err := o.db.WithContext(ctx).Create(&post).Error; err != nil {
			failCampaign(fmt.Sprintf("create post record %d: %v", i, err))
			return fmt.Errorf("GenerateCampaign: create post %d: %w", i, err)
		}
		posts = append(posts, post)
	}

	// 6. Update campaign: total_posts + progress step 2.
	if err := o.db.WithContext(ctx).Model(&campaign).Updates(map[string]interface{}{
		"total_posts": len(slots),
		"generation_progress": models.JSONMap{
			"step":        "posts_created",
			"step_num":    2,
			"total_steps": 3,
		},
	}).Error; err != nil {
		log.Warn("GenerateCampaign: failed to update total_posts", zap.Error(err))
	}

	// 7. Enqueue generate_post tasks for each post.
	for _, post := range posts {
		payload := queue.GenerateCampaignPostPayload{
			CampaignPostID: post.ID,
			CampaignID:     campaignID,
			WorkspaceID:    workspaceID,
		}
		task, err := queue.NewGenerateCampaignPostTask(payload)
		if err != nil {
			log.Error("GenerateCampaign: failed to create task", zap.String("post_id", post.ID.String()), zap.Error(err))
			continue
		}
		if _, err := o.asynq.EnqueueContext(ctx, task); err != nil {
			log.Error("GenerateCampaign: failed to enqueue task", zap.String("post_id", post.ID.String()), zap.Error(err))
		}
	}

	// 8. Update progress step 3.
	if err := o.db.WithContext(ctx).Model(&campaign).Update("generation_progress", models.JSONMap{
		"step":        "posts_enqueued",
		"step_num":    3,
		"total_steps": 3,
	}).Error; err != nil {
		log.Warn("GenerateCampaign: failed to update progress step 3", zap.Error(err))
	}

	log.Info("GenerateCampaign: complete", zap.Int("posts_enqueued", len(posts)))
	return nil
}

// ─── generateContentStrategy ──────────────────────────────────────────────────

func (o *Orchestrator) generateContentStrategy(ctx context.Context, campaign *models.Campaign) ([]PostSlot, error) {
	openaiKey, _ := o.loadAPIKeys(ctx)
	if openaiKey == "" {
		return nil, fmt.Errorf("OpenAI API key not configured")
	}

	systemPrompt := `You are an expert social media content strategist. Generate a structured content calendar as a JSON array.
Each item must have: scheduled_for (ISO8601), platform, post_type (image/video/text/carousel), content_pillar, key_message, visual_style.
Distribute posts according to the specified frequency and content mix.
Ensure variety: no same content pillar two days in a row, mix post types, align with brand guidelines.
Only output valid JSON array, no markdown, no explanation.`

	userPrompt := buildStrategyPrompt(campaign)

	req := openAIRequest{
		Model: "gpt-4o-mini",
		Messages: []openAIMsg{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
		Temperature: 0.7,
		MaxTokens:   4096,
	}

	raw, err := o.callOpenAI(ctx, openaiKey, req)
	if err != nil {
		return nil, fmt.Errorf("generateContentStrategy: openai: %w", err)
	}

	// Strip possible markdown fences.
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.TrimSpace(raw)

	var slots []PostSlot
	if err := json.Unmarshal([]byte(raw), &slots); err != nil {
		return nil, fmt.Errorf("generateContentStrategy: parse JSON: %w (raw: %.200s)", err, raw)
	}
	return slots, nil
}

// buildStrategyPrompt assembles the user-facing prompt for content strategy.
func buildStrategyPrompt(c *models.Campaign) string {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("Campaign Name: %s\n", c.Name))
	sb.WriteString(fmt.Sprintf("Goal: %s\n", c.Goal))
	sb.WriteString(fmt.Sprintf("Brief: %s\n", c.Brief))

	if c.StartDate != nil {
		sb.WriteString(fmt.Sprintf("Start Date: %s\n", c.StartDate.Format("2006-01-02")))
	}
	if c.EndDate != nil {
		sb.WriteString(fmt.Sprintf("End Date: %s\n", c.EndDate.Format("2006-01-02")))
	}

	if len(c.Platforms) > 0 {
		sb.WriteString(fmt.Sprintf("Platforms: %s\n", strings.Join(c.Platforms, ", ")))
	}

	if len(c.PostingFrequency) > 0 {
		if b, err := json.Marshal(c.PostingFrequency); err == nil {
			sb.WriteString(fmt.Sprintf("Posting Frequency (posts per platform per week): %s\n", string(b)))
		}
	}

	if len(c.ContentMix) > 0 {
		if b, err := json.Marshal(c.ContentMix); err == nil {
			sb.WriteString(fmt.Sprintf("Content Mix (percentage by type): %s\n", string(b)))
		}
	}

	if c.BrandKit != nil {
		bk := c.BrandKit
		if bk.Industry != "" {
			sb.WriteString(fmt.Sprintf("Industry: %s\n", bk.Industry))
		}
		if bk.BrandVoice != "" {
			sb.WriteString(fmt.Sprintf("Brand Voice: %s\n", bk.BrandVoice))
		}
		if bk.TargetAudience != "" {
			sb.WriteString(fmt.Sprintf("Target Audience: %s\n", bk.TargetAudience))
		}
		if len(bk.ContentPillars) > 0 {
			sb.WriteString(fmt.Sprintf("Content Pillars: %s\n", strings.Join(bk.ContentPillars, ", ")))
		}
		if len(bk.Dos) > 0 {
			sb.WriteString(fmt.Sprintf("Brand Do's: %s\n", strings.Join(bk.Dos, "; ")))
		}
		if len(bk.Donts) > 0 {
			sb.WriteString(fmt.Sprintf("Brand Don'ts: %s\n", strings.Join(bk.Donts, "; ")))
		}
	}

	sb.WriteString("\nGenerate the full content calendar as a JSON array of post slots.")
	return sb.String()
}

// ─── GenerateCampaignPost ─────────────────────────────────────────────────────

// GenerateCampaignPost generates caption, hashtags, and media for a single post.
func (o *Orchestrator) GenerateCampaignPost(ctx context.Context, campaignPostID, campaignID, workspaceID uuid.UUID) error {
	log := o.log.With(
		zap.String("campaign_post_id", campaignPostID.String()),
		zap.String("campaign_id", campaignID.String()),
	)
	log.Info("GenerateCampaignPost: starting")

	// 1. Load post + campaign + brand kit.
	var post models.CampaignPost
	if err := o.db.WithContext(ctx).
		First(&post, "id = ? AND campaign_id = ? AND workspace_id = ?", campaignPostID, campaignID, workspaceID).Error; err != nil {
		return fmt.Errorf("GenerateCampaignPost: load post: %w", err)
	}

	var campaign models.Campaign
	if err := o.db.WithContext(ctx).
		Preload("BrandKit").
		First(&campaign, "id = ? AND workspace_id = ?", campaignID, workspaceID).Error; err != nil {
		return fmt.Errorf("GenerateCampaignPost: load campaign: %w", err)
	}

	// 2. Update post status → generating.
	if err := o.db.WithContext(ctx).Model(&post).Update("status", models.CampaignPostGenerating).Error; err != nil {
		log.Warn("GenerateCampaignPost: failed to set status=generating", zap.Error(err))
	}

	// Helper to mark post as failed.
	failPost := func(reason string) {
		o.db.WithContext(ctx).Model(&post).Updates(map[string]interface{}{
			"status":        models.CampaignPostFailed,
			"error_message": reason,
		})
		log.Error("GenerateCampaignPost: marked as failed", zap.String("reason", reason))
	}

	// Extract stored slot context from ai_prompts_used.
	keyMessage, _ := post.AIPromptsUsed["key_message"].(string)
	visualStyle, _ := post.AIPromptsUsed["visual_style"].(string)

	slot := PostSlot{
		ScheduledFor:  post.ScheduledFor,
		Platform:      string(post.Platform),
		PostType:      string(post.PostType),
		ContentPillar: post.ContentPillar,
		KeyMessage:    keyMessage,
		VisualStyle:   visualStyle,
	}

	openaiKey, falKey := o.loadAPIKeys(ctx)

	// 3. Generate caption.
	caption, err := o.generateCaption(ctx, openaiKey, slot, &campaign, campaign.BrandKit)
	if err != nil {
		failPost(fmt.Sprintf("caption: %v", err))
		return fmt.Errorf("GenerateCampaignPost: %w", err)
	}

	// 4. Generate hashtags.
	hashtags := o.generateHashtags(ctx, openaiKey, caption, slot, &campaign, campaign.BrandKit)

	// 5. Media generation.
	var mediaURLs []string
	switch slot.PostType {
	case "image":
		imageURL, err := o.generateImage(ctx, falKey, slot, &campaign, campaign.BrandKit)
		if err != nil {
			log.Warn("GenerateCampaignPost: image generation failed, continuing without media", zap.Error(err))
		} else if imageURL != "" {
			mediaURLs = append(mediaURLs, imageURL)
		}
	case "video":
		videoURL, err := o.generateVideo(ctx, falKey, slot, &campaign, campaign.BrandKit)
		if err != nil {
			log.Warn("GenerateCampaignPost: video generation failed, continuing without media", zap.Error(err))
		} else if videoURL != "" {
			mediaURLs = append(mediaURLs, videoURL)
		}
	case "carousel":
		carouselURLs, err := o.generateCarousel(ctx, falKey, slot, &campaign, campaign.BrandKit)
		if err != nil {
			log.Warn("GenerateCampaignPost: carousel generation failed, continuing without media", zap.Error(err))
		} else {
			mediaURLs = append(mediaURLs, carouselURLs...)
		}
	// "text" — no media generation
	}

	// 6. Update post: caption, hashtags, media, status=generated.
	updates := map[string]interface{}{
		"status":             models.CampaignPostGenerated,
		"generated_caption":  caption,
		"generated_hashtags": models.StringSlice(hashtags),
		"error_message":      "",
	}
	if len(mediaURLs) > 0 {
		updates["media_urls"] = models.StringSlice(mediaURLs)
	}
	if err := o.db.WithContext(ctx).Model(&post).Updates(updates).Error; err != nil {
		failPost(fmt.Sprintf("persist post: %v", err))
		return fmt.Errorf("GenerateCampaignPost: persist: %w", err)
	}

	// 7. Increment campaign.posts_generated atomically.
	if err := o.db.WithContext(ctx).Model(&models.Campaign{}).
		Where("id = ?", campaignID).
		UpdateColumn("posts_generated", gorm.Expr("posts_generated + 1")).Error; err != nil {
		log.Warn("GenerateCampaignPost: failed to increment posts_generated", zap.Error(err))
	}

	// 8. Check if all posts are done and update campaign status.
	o.maybeFinalise(ctx, campaignID, workspaceID, log)

	log.Info("GenerateCampaignPost: complete")
	return nil
}

// maybeFinalise checks whether all posts have been generated and transitions the
// campaign to "review" (or "scheduled" if auto_approve is set).
func (o *Orchestrator) maybeFinalise(ctx context.Context, campaignID, workspaceID uuid.UUID, log *zap.Logger) {
	var campaign models.Campaign
	if err := o.db.WithContext(ctx).
		First(&campaign, "id = ? AND workspace_id = ?", campaignID, workspaceID).Error; err != nil {
		log.Warn("maybeFinalise: reload campaign failed", zap.Error(err))
		return
	}

	if campaign.PostsGenerated < campaign.TotalPosts {
		return // more posts still in flight
	}

	if campaign.AutoApprove {
		// Approve all generated posts.
		if err := o.db.WithContext(ctx).Model(&models.CampaignPost{}).
			Where("campaign_id = ? AND status = ?", campaignID, models.CampaignPostGenerated).
			Update("status", models.CampaignPostApproved).Error; err != nil {
			log.Warn("maybeFinalise: auto-approve posts failed", zap.Error(err))
		}
		// Update campaign status → scheduled.
		o.db.WithContext(ctx).Model(&campaign).Updates(map[string]interface{}{
			"status": models.CampaignStatusScheduled,
			"generation_progress": models.JSONMap{
				"step": "complete",
				"auto_approved": true,
			},
		})
		log.Info("maybeFinalise: all posts generated + auto-approved → scheduled")
	} else {
		o.db.WithContext(ctx).Model(&campaign).Updates(map[string]interface{}{
			"status": models.CampaignStatusReview,
			"generation_progress": models.JSONMap{
				"step": "complete",
			},
		})
		log.Info("maybeFinalise: all posts generated → review")
	}
}

// ─── generateCaption ──────────────────────────────────────────────────────────

func (o *Orchestrator) generateCaption(ctx context.Context, openaiKey string, slot PostSlot, campaign *models.Campaign, bk *models.BrandKit) (string, error) {
	if openaiKey == "" {
		return "", fmt.Errorf("generateCaption: OpenAI API key not configured")
	}

	platformGuide := captionPlatformGuide(slot.Platform)
	brandVoice := "professional yet engaging"
	targetAudience := "general audience"
	dos := ""
	donts := ""
	if bk != nil {
		if bk.BrandVoice != "" {
			brandVoice = bk.BrandVoice
		}
		if bk.TargetAudience != "" {
			targetAudience = bk.TargetAudience
		}
		if len(bk.Dos) > 0 {
			dos = strings.Join(bk.Dos, "; ")
		}
		if len(bk.Donts) > 0 {
			donts = strings.Join(bk.Donts, "; ")
		}
	}

	// Hard character limits for platforms that enforce them strictly.
	platformHardLimits := map[string]int{
		"twitter": 280,
		"bluesky": 300,
		"threads": 500,
	}
	var hardLimitRule string
	if limit, ok := platformHardLimits[strings.ToLower(slot.Platform)]; ok {
		hardLimitRule = fmt.Sprintf(
			"\n⚠️ CRITICAL HARD LIMIT: This platform enforces a STRICT %d-character maximum. "+
				"Your caption MUST be %d characters or fewer — count every character including spaces, "+
				"emojis (which count as 2), and newlines. Write tight, punchy, every-word-counts copy.\n",
			limit, limit)
	}

	var linkedinHashtagRule string
	if strings.ToLower(slot.Platform) == "linkedin" {
		linkedinHashtagRule = "\n10. LinkedIn hashtags: add 3-5 relevant industry hashtags at the very end of the caption."
	}

	var dosRule, dontsRule string
	if dos != "" {
		dosRule = fmt.Sprintf("\nBrand Do's: %s", dos)
	}
	if donts != "" {
		dontsRule = fmt.Sprintf("\nBrand Don'ts (NEVER do these): %s", donts)
	}

	systemPrompt := fmt.Sprintf(
		`You are an elite social media strategist who has grown 100+ accounts to 1M+ followers.
%s
PLATFORM GUIDANCE:
%s

YOUR TASK: Write a high-converting, scroll-stopping caption that drives maximum engagement.

RULES:
1. Hook first — the opening line must stop the scroll. Use a bold claim, surprising stat, counter-intuitive take, or relatable pain point.
2. Structure for readability — use short paragraphs, line breaks, and strategic formatting.
3. Match the platform's native voice — don't sound like an ad. Sound like a top creator on this platform.
4. Include a strong CTA — tell readers exactly what to do (save, share, comment, follow).
5. Be specific and concrete — avoid generic advice. Use numbers, examples, and vivid language.
6. Write for EMOTION — content that triggers curiosity, surprise, or "I need to save this" performs best.
7. NEVER use clichés like "In today's fast-paced world", "Game-changer", "Unlock your potential", "Dive into".
8. Tone: %s
9. Target audience: %s%s%s%s

Return ONLY the caption text — no hashtags, no JSON, no markdown wrapper. Just the caption.`,
		hardLimitRule, platformGuide, brandVoice, targetAudience, linkedinHashtagRule, dosRule, dontsRule,
	)

	userPrompt := fmt.Sprintf(`Campaign Goal: %s
Content Pillar: %s
Key Message: %s

Write the caption now. Make it feel authentic and human — like it was written by someone who genuinely cares about their audience.`, campaign.Goal, slot.ContentPillar, slot.KeyMessage)

	req := openAIRequest{
		Model: "gpt-4o", // Use full model for best quality campaign content
		Messages: []openAIMsg{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
		Temperature: 0.75,
		MaxTokens:   800,
	}

	return o.callOpenAI(ctx, openaiKey, req)
}

// captionPlatformGuide returns detailed platform-specific writing guidance.
func captionPlatformGuide(platform string) string {
	guides := map[string]string{
		"instagram": `Instagram Feed Post:
- Hook in the first line (this appears above "...more") — make it impossible to scroll past
- Use line breaks for readability (no walls of text)
- 2,200 char limit but 150-300 is optimal for engagement
- Include a clear CTA (save this, share with a friend, comment below)
- Use emojis strategically to break up text (not excessively)
- Write as if speaking to one person, not a crowd`,

		"tiktok": `TikTok:
- Keep caption under 150 characters (longer gets truncated)
- First line must be a pattern interrupt, bold claim, or question
- Casual, authentic voice — NO corporate speak
- Include a CTA: "Follow for more", "Save this", "Stitch this"`,

		"linkedin": `LinkedIn:
- First line is EVERYTHING — it appears before "...see more"
- Open with a bold statement, counter-intuitive take, or personal story
- Short paragraphs (1-2 sentences max per paragraph)
- Line breaks between every paragraph for mobile readability
- 3,000 char limit but optimal is 1,300-1,500
- End with a question to drive comments
- Write in first person, share lessons learned`,

		"twitter": `Twitter/X:
- 280 character STRICT limit — every word must earn its place
- Lead with the most compelling part of your message
- 1-2 hashtags max, inline (not at the end)
- Controversial takes and strong opinions drive engagement`,

		"facebook": `Facebook:
- Optimal length: 40-80 characters for highest engagement
- Storytelling posts (300-500 chars) perform well in groups
- Ask questions that invite comments
- 0-3 hashtags (Facebook de-prioritizes hashtag-heavy posts)
- Personal stories and behind-the-scenes content performs best`,

		"youtube": `YouTube Description:
- First 150 characters appear in search results — front-load keywords
- Structure: 2-3 keyword-rich paragraphs describing the video
- Include timestamps for key sections
- Total length: 500-2000 chars optimal for SEO`,

		"pinterest": `Pinterest Pin:
- Up to 500 characters
- Front-load the most important keywords (SEO-first platform)
- Write as a search query answer — what would someone search to find this?
- Include a clear value proposition with "how-to" or "tips for" framing`,

		"threads": `Threads:
- Casual, conversational tone
- 500 character limit
- 0-3 hashtags (less is more)
- Hot takes, personal opinions, and relatable observations perform best`,

		"bluesky": `Bluesky:
- 300 character limit
- Authentic, community-first tone
- Skip the marketing speak — be genuine
- Conversational, thoughtful — quality over virality`,
	}
	if g, ok := guides[strings.ToLower(platform)]; ok {
		return g
	}
	return "Write a compelling, platform-appropriate caption with a strong hook and clear CTA."
}

// ─── generateHashtags ─────────────────────────────────────────────────────────

func (o *Orchestrator) generateHashtags(ctx context.Context, openaiKey, caption string, slot PostSlot, campaign *models.Campaign, bk *models.BrandKit) []string {
	// Start with brand hashtags if available.
	var brandTags []string
	if bk != nil {
		brandTags = bk.BrandHashtags
	}

	if openaiKey == "" {
		return brandTags
	}

	req := openAIRequest{
		Model: "gpt-4o-mini",
		Messages: []openAIMsg{
			{Role: "system", Content: fmt.Sprintf(`You are a social media growth specialist who understands hashtag strategy deeply.

PLATFORM: %s

Generate a strategic hashtag set using the 3-tier strategy:
- 5 HIGH-VOLUME tags (500K+ posts) — for discovery
- 5 MID-TIER tags (50K–500K posts) — for competition balance
- 5 NICHE-SPECIFIC tags (under 50K posts) — for ranking potential

RULES:
1. Every hashtag must be directly relevant to the caption content
2. Mix broad appeal with laser-targeted niche tags
3. Avoid banned or shadow-banned hashtags
4. Each hashtag should be a single word or short camelCase phrase (no spaces, no # prefix)
5. Order from most to least popular

Return JSON: {"hashtags": ["tag1", "tag2", ...]}`, slot.Platform)},
			{Role: "user", Content: fmt.Sprintf("Caption: %s\nContent Pillar: %s\nCampaign Goal: %s", caption, slot.ContentPillar, campaign.Goal)},
		},
		Temperature: 0.5,
		MaxTokens:   300,
	}

	raw, err := o.callOpenAI(ctx, openaiKey, req)
	if err != nil {
		o.log.Warn("generateHashtags: openai failed", zap.Error(err))
		return brandTags
	}

	var out struct {
		Hashtags []string `json:"hashtags"`
	}
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		// Try to extract from raw text.
		return brandTags
	}

	// Merge brand tags first, then AI tags.
	seen := make(map[string]bool)
	result := make([]string, 0, len(brandTags)+len(out.Hashtags))
	for _, t := range brandTags {
		if !seen[t] {
			seen[t] = true
			result = append(result, t)
		}
	}
	for _, t := range out.Hashtags {
		if !seen[t] {
			seen[t] = true
			result = append(result, t)
		}
	}
	return result
}

// ─── buildRichImagePrompt ─────────────────────────────────────────────────────

// buildRichImagePrompt uses GPT-4o-mini to generate a detailed, art-directed
// image prompt from campaign context — far richer than template-based strings.
func (o *Orchestrator) buildRichImagePrompt(ctx context.Context, openaiKey string, slot PostSlot, campaign *models.Campaign, bk *models.BrandKit) string {
	if openaiKey == "" {
		return buildFallbackImagePrompt(slot, bk)
	}

	systemPrompt := `You are a world-class art director and creative director specializing in social media visual content for brands.

Your task: given a social media post brief, write a detailed text-to-image AI prompt that produces a stunning, professional, scroll-stopping visual.

RULES FOR YOUR PROMPT:
1. Describe a SPECIFIC visual scene — what exactly is shown, from what angle, with what lighting
2. Include: subject matter, composition, lighting quality, mood, color palette, photographic or artistic style
3. Use quality descriptors: "professional photography", "8K resolution", "shallow depth of field f/1.8", "cinematic lighting", "award-winning composition", "Behance portfolio quality"
4. NEVER mention text, words, letters, numbers, logos, or typography — the image must be wordless
5. Communicate the key message VISUALLY through metaphor, composition, or subject matter — not through text in the image
6. Avoid cliché stock-photo descriptions like "business people shaking hands" or "smiling person at desk"
7. Be specific, evocative, and visually compelling — think like a top creative director shooting for Vogue or Wired
8. Keep the prompt to 2-3 punchy sentences — focused and powerful

Return ONLY the image prompt text. No explanation, no preamble, no JSON.`

	var userPrompt strings.Builder
	userPrompt.WriteString(fmt.Sprintf("Platform: %s\n", slot.Platform))
	userPrompt.WriteString(fmt.Sprintf("Content pillar: %s\n", slot.ContentPillar))
	userPrompt.WriteString(fmt.Sprintf("Key message to convey visually: %s\n", slot.KeyMessage))
	userPrompt.WriteString(fmt.Sprintf("Visual style: %s\n", slot.VisualStyle))
	userPrompt.WriteString(fmt.Sprintf("Campaign goal: %s\n", campaign.Goal))
	if campaign.Brief != "" {
		brief := campaign.Brief
		if len(brief) > 400 {
			brief = brief[:400]
		}
		userPrompt.WriteString(fmt.Sprintf("Brand brief: %s\n", brief))
	}
	if bk != nil {
		if bk.Industry != "" {
			userPrompt.WriteString(fmt.Sprintf("Industry: %s\n", bk.Industry))
		}
		if bk.PrimaryColor != "" {
			userPrompt.WriteString(fmt.Sprintf("Brand primary color: %s\n", bk.PrimaryColor))
			if bk.SecondaryColor != "" {
				userPrompt.WriteString(fmt.Sprintf("Brand secondary color: %s\n", bk.SecondaryColor))
			}
		}
	}
	userPrompt.WriteString("\nGenerate a detailed, cinematic image prompt for this post. The image must contain NO text or words whatsoever.")

	req := openAIRequest{
		Model: "gpt-4o-mini",
		Messages: []openAIMsg{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt.String()},
		},
		Temperature: 0.85,
		MaxTokens:   250,
	}

	prompt, err := o.callOpenAI(ctx, openaiKey, req)
	if err != nil {
		o.log.Warn("buildRichImagePrompt: GPT call failed, using fallback", zap.Error(err))
		return buildFallbackImagePrompt(slot, bk)
	}
	return strings.TrimSpace(prompt)
}

// buildFallbackImagePrompt constructs a basic image prompt without GPT.
func buildFallbackImagePrompt(slot PostSlot, bk *models.BrandKit) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Professional %s aesthetic visual composition. ", slot.VisualStyle))
	sb.WriteString(fmt.Sprintf("Theme: %s. ", slot.ContentPillar))
	if bk != nil && bk.PrimaryColor != "" {
		sb.WriteString(fmt.Sprintf("Color palette dominated by %s. ", bk.PrimaryColor))
	}
	sb.WriteString("Cinematic lighting, sharp details, premium editorial quality, modern aesthetic, no text or typography.")
	return sb.String()
}

// ─── generateImage ────────────────────────────────────────────────────────────

func (o *Orchestrator) generateImage(ctx context.Context, falKey string, slot PostSlot, campaign *models.Campaign, bk *models.BrandKit) (string, error) {
	if falKey == "" {
		return "", fmt.Errorf("generateImage: fal.ai API key not configured")
	}

	// Build a rich, GPT-crafted scene description — far better than template strings.
	openaiKey, _ := o.loadAPIKeys(ctx)
	richPrompt := o.buildRichImagePrompt(ctx, openaiKey, slot, campaign, bk)

	// Append universal quality boosters.
	finalPrompt := richPrompt + ", ultra-sharp details, 8K resolution, masterpiece quality, professional photography, perfect composition"

	imageSize := platformToImageSize(slot.Platform)

	reqBody := map[string]interface{}{
		"prompt": finalPrompt,
		// Strongly suppress any text/typography generation.
		"negative_prompt":       "text, words, letters, numbers, typography, watermark, logo, caption, subtitle, blurry, low quality, distorted, deformed, ugly, amateur, noise, grainy, out of focus, overexposed, underexposed, cartoon, illustration, anime",
		"image_size":            imageSize,
		"num_images":            1,
		"num_inference_steps":   28,  // flux/dev full quality (vs schnell's 4)
		"guidance_scale":        3.5, // flux/dev optimal guidance
		"enable_safety_checker": true,
	}

	// Use flux/dev (full diffusion model — same as manual AI Studio).
	result, err := o.falQueueRequest(ctx, falKey, "fal-ai/flux/dev", reqBody)
	if err != nil {
		return "", fmt.Errorf("generateImage: fal.ai: %w", err)
	}

	return extractFirstImageURL(result), nil
}

// platformToImageSize maps a platform to a fal.ai image_size preset.
func platformToImageSize(platform string) string {
	switch strings.ToLower(platform) {
	case "instagram":
		return "square_hd" // 1:1 feed
	case "tiktok", "reels", "stories":
		return "portrait_4_3" // closest to 9:16 in fal presets
	case "linkedin":
		return "landscape_16_9" // 1.91:1 ≈ 16:9
	case "twitter":
		return "landscape_16_9" // 16:9
	default:
		return "square_hd"
	}
}

// ─── buildRichVideoPrompt ─────────────────────────────────────────────────────

// buildRichVideoPrompt uses GPT-4o-mini to generate a cinematic, detailed
// Kling video prompt from campaign context — describing actual scenes with motion.
func (o *Orchestrator) buildRichVideoPrompt(ctx context.Context, openaiKey string, slot PostSlot, campaign *models.Campaign, bk *models.BrandKit) string {
	if openaiKey == "" {
		return buildFallbackVideoPrompt(slot, bk)
	}

	systemPrompt := `You are a world-class video director and creative director specializing in short-form social media video content.

Your task: given a social media video brief, write a detailed text-to-video AI prompt for Kling (a cinematic AI video model).

RULES FOR YOUR PROMPT:
1. Describe a SPECIFIC cinematic scene with motion — what moves, how the camera moves, what's in frame
2. Include: subject, camera movement (slow push-in, drone pull-back, tracking shot, etc.), lighting, mood, color grade
3. Reference cinematic quality: "smooth slow motion", "golden hour lighting", "anamorphic lens flare", "film grain", "Dolby Vision color grading"
4. NEVER mention text, words, letters, or on-screen graphics — the video must be wordless
5. Communicate the key message through VISUAL STORYTELLING — metaphor, composition, and motion
6. Describe specific motion: "camera slowly drifts through...", "subject turns to reveal...", "particles float upward..."
7. Keep under 3 sentences — focused and cinematic
8. Make it feel like a high-end brand film or music video, not stock footage

Return ONLY the video prompt text. No explanation, no JSON.`

	var userPrompt strings.Builder
	userPrompt.WriteString(fmt.Sprintf("Platform: %s\n", slot.Platform))
	userPrompt.WriteString(fmt.Sprintf("Content pillar: %s\n", slot.ContentPillar))
	userPrompt.WriteString(fmt.Sprintf("Key message to convey visually: %s\n", slot.KeyMessage))
	userPrompt.WriteString(fmt.Sprintf("Visual style: %s\n", slot.VisualStyle))
	userPrompt.WriteString(fmt.Sprintf("Campaign goal: %s\n", campaign.Goal))
	if campaign.Brief != "" {
		brief := campaign.Brief
		if len(brief) > 300 {
			brief = brief[:300]
		}
		userPrompt.WriteString(fmt.Sprintf("Brand brief: %s\n", brief))
	}
	if bk != nil && bk.PrimaryColor != "" {
		userPrompt.WriteString(fmt.Sprintf("Brand color palette: primary %s", bk.PrimaryColor))
		if bk.SecondaryColor != "" {
			userPrompt.WriteString(fmt.Sprintf(", secondary %s", bk.SecondaryColor))
		}
		userPrompt.WriteString("\n")
	}
	userPrompt.WriteString("\nGenerate a cinematic, motion-rich video prompt. No text or words in the video.")

	req := openAIRequest{
		Model: "gpt-4o-mini",
		Messages: []openAIMsg{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt.String()},
		},
		Temperature: 0.85,
		MaxTokens:   200,
	}

	prompt, err := o.callOpenAI(ctx, openaiKey, req)
	if err != nil {
		o.log.Warn("buildRichVideoPrompt: GPT call failed, using fallback", zap.Error(err))
		return buildFallbackVideoPrompt(slot, bk)
	}
	return strings.TrimSpace(prompt)
}

// buildFallbackVideoPrompt constructs a basic video prompt without GPT.
func buildFallbackVideoPrompt(slot PostSlot, bk *models.BrandKit) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Cinematic %s social media video. ", slot.VisualStyle))
	sb.WriteString(fmt.Sprintf("Theme: %s — ", slot.ContentPillar))
	sb.WriteString("smooth camera movement, dynamic motion, professional color grading, ")
	if bk != nil && bk.PrimaryColor != "" {
		sb.WriteString(fmt.Sprintf("color palette dominated by %s, ", bk.PrimaryColor))
	}
	sb.WriteString("no text overlays, engaging for social media, high production value.")
	return sb.String()
}

// ─── generateVideo ────────────────────────────────────────────────────────────

// generateVideo generates a short-form social video via Kling V3 Pro (fal.ai).
// The task timeout is 10 minutes so we have headroom for Kling's ~2–5 min jobs.
func (o *Orchestrator) generateVideo(ctx context.Context, falKey string, slot PostSlot, campaign *models.Campaign, bk *models.BrandKit) (string, error) {
	if falKey == "" {
		return "", fmt.Errorf("generateVideo: fal.ai API key not configured")
	}

	// Build a rich, cinematic video prompt via GPT rather than a template string.
	openaiKey, _ := o.loadAPIKeys(ctx)
	videoPrompt := o.buildRichVideoPrompt(ctx, openaiKey, slot, campaign, bk)

	// Platform → aspect ratio + duration
	aspectRatio, duration := platformToVideoParams(slot.Platform)

	reqBody := map[string]interface{}{
		"prompt":       videoPrompt,
		"duration":     duration,
		"aspect_ratio": aspectRatio,
	}

	o.log.Info("generateVideo: submitting Kling job",
		zap.String("platform", slot.Platform),
		zap.String("aspect_ratio", aspectRatio),
		zap.Int("duration", duration),
	)

	// Use the long-timeout client so the HTTP connection itself doesn't die
	// while we wait for Kling to finish.
	result, err := o.falQueueRequestWithClient(ctx, o.videoHTTPClient, falKey, "fal-ai/kling-video/v3/pro/text-to-video", reqBody)
	if err != nil {
		return "", fmt.Errorf("generateVideo: kling: %w", err)
	}

	// Extract video URL from Kling response: {"video": {"url": "..."}}
	if v, ok := result["video"].(map[string]interface{}); ok {
		if url, _ := v["url"].(string); url != "" {
			o.log.Info("generateVideo: Kling job complete", zap.String("video_url", url))
			return url, nil
		}
	}

	o.log.Warn("generateVideo: no video URL in Kling response", zap.Any("result_keys", func() []string {
		keys := make([]string, 0, len(result))
		for k := range result {
			keys = append(keys, k)
		}
		return keys
	}()))
	return "", nil
}

// platformToVideoParams returns the aspect ratio and duration (seconds) for Kling
// based on the target social platform.
func platformToVideoParams(platform string) (aspectRatio string, duration int) {
	switch strings.ToLower(platform) {
	case "tiktok", "reels", "stories", "instagram":
		return "9:16", 5 // vertical short-form
	case "youtube":
		return "16:9", 10
	case "linkedin", "facebook":
		return "16:9", 5
	case "twitter":
		return "16:9", 5
	default:
		return "9:16", 5
	}
}

// ─── generateCarousel ─────────────────────────────────────────────────────────

// generateCarousel generates 3 brand-consistent images for a carousel post
// and returns all URLs. The caption is expected to be slide-aware.
func (o *Orchestrator) generateCarousel(ctx context.Context, falKey string, slot PostSlot, campaign *models.Campaign, bk *models.BrandKit) ([]string, error) {
	if falKey == "" {
		return nil, fmt.Errorf("generateCarousel: fal.ai API key not configured")
	}

	slideCount := 3
	var urls []string

	// Base color/brand context.
	colorCtx := ""
	if bk != nil && bk.PrimaryColor != "" {
		colorCtx = fmt.Sprintf("Color palette: primary %s", bk.PrimaryColor)
		if bk.SecondaryColor != "" {
			colorCtx += fmt.Sprintf(", secondary %s", bk.SecondaryColor)
		}
		colorCtx += ". "
	}

	openaiKey, _ := o.loadAPIKeys(ctx)

	for i := 0; i < slideCount; i++ {
		slideRoleStr := slideRole(i, slideCount)

		// Build a GPT-powered prompt for each carousel slide with its specific role.
		var userPrompt strings.Builder
		userPrompt.WriteString(fmt.Sprintf("Platform: %s\n", slot.Platform))
		userPrompt.WriteString(fmt.Sprintf("Content pillar: %s\n", slot.ContentPillar))
		userPrompt.WriteString(fmt.Sprintf("Key message: %s\n", slot.KeyMessage))
		userPrompt.WriteString(fmt.Sprintf("Visual style: %s\n", slot.VisualStyle))
		userPrompt.WriteString(fmt.Sprintf("Campaign goal: %s\n", campaign.Goal))
		userPrompt.WriteString(fmt.Sprintf("Carousel slide role: %s (slide %d of %d)\n", slideRoleStr, i+1, slideCount))
		if colorCtx != "" {
			userPrompt.WriteString(colorCtx + "\n")
		}
		if campaign.Brief != "" {
			brief := campaign.Brief
			if len(brief) > 200 {
				brief = brief[:200]
			}
			userPrompt.WriteString(fmt.Sprintf("Brand brief: %s\n", brief))
		}
		userPrompt.WriteString("\nGenerate a detailed image prompt for this carousel slide. Must be visually consistent with the other slides but serve this slide's specific role. No text, words, or typography in the image.")

		slidePrompt := buildFallbackImagePrompt(slot, bk)
		if openaiKey != "" {
			req := openAIRequest{
				Model: "gpt-4o-mini",
				Messages: []openAIMsg{
					{Role: "system", Content: `You are a world-class art director. Write a detailed text-to-image AI prompt for a carousel slide. Describe a specific visual scene with composition, lighting, mood, and style. NEVER include text, words, or typography. Keep to 2-3 sentences. Return ONLY the prompt text.`},
					{Role: "user", Content: userPrompt.String()},
				},
				Temperature: 0.8,
				MaxTokens:   200,
			}
			if p, err := o.callOpenAI(ctx, openaiKey, req); err == nil {
				slidePrompt = strings.TrimSpace(p)
			}
		}

		// Append quality boosters.
		finalSlidePrompt := slidePrompt + ", ultra-sharp details, 8K resolution, professional photography, consistent visual branding"

		reqBody := map[string]interface{}{
			"prompt":                finalSlidePrompt,
			"negative_prompt":       "text, words, letters, numbers, typography, watermark, logo, blurry, low quality, distorted, deformed, ugly, amateur, noise, grainy",
			"image_size":            "square_hd", // carousels are 1:1
			"num_images":            1,
			"num_inference_steps":   28,
			"guidance_scale":        3.5,
			"enable_safety_checker": true,
		}

		result, err := o.falQueueRequest(ctx, falKey, "fal-ai/flux/dev", reqBody)
		if err != nil {
			o.log.Warn("generateCarousel: slide failed", zap.Int("slide", i+1), zap.Error(err))
			continue
		}
		if url := extractFirstImageURL(result); url != "" {
			urls = append(urls, url)
		}
	}

	return urls, nil
}

// slideRole returns a descriptive role string for a carousel slide by index.
func slideRole(idx, total int) string {
	if total <= 1 {
		return "main content"
	}
	switch idx {
	case 0:
		return "hook/cover slide — eye-catching, makes viewer swipe"
	case total - 1:
		return "closing slide — CTA, summary, or key takeaway"
	default:
		return fmt.Sprintf("content slide %d — supporting detail or step", idx+1)
	}
}

// ─── fal.ai helpers ───────────────────────────────────────────────────────────

// falQueueRequest submits a job using the standard (120 s) HTTP client.
func (o *Orchestrator) falQueueRequest(ctx context.Context, falKey, model string, body map[string]interface{}) (map[string]interface{}, error) {
	return o.falQueueRequestWithClient(ctx, o.httpClient, falKey, model, body)
}

// falQueueRequestWithClient submits a job to fal.ai's async queue and polls until done.
// Mirrors the pattern from internal/services/ai/ai.go.
func (o *Orchestrator) falQueueRequestWithClient(ctx context.Context, client *http.Client, falKey, model string, body map[string]interface{}) (map[string]interface{}, error) {
	// 1. Submit to queue.
	b, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	submitURL := fmt.Sprintf("https://queue.fal.run/%s", model)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, submitURL, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Key "+falKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
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
		return nil, fmt.Errorf("fal.ai queue submit: no request_id in response: %s", string(rawBody))
	}

	statusURL, _ := submitResp["status_url"].(string)
	if statusURL == "" {
		statusURL = fmt.Sprintf("https://queue.fal.run/%s/requests/%s/status", model, requestID)
	}
	responseURL, _ := submitResp["response_url"].(string)
	if responseURL == "" {
		responseURL = fmt.Sprintf("https://queue.fal.run/%s/requests/%s", model, requestID)
	}

	o.log.Info("fal.ai queue submitted", zap.String("request_id", requestID), zap.String("model", model))

	// 2. Poll until completed or failed.
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("fal.ai queue: context cancelled waiting for %s", requestID)
		case <-ticker.C:
			sreq, err := http.NewRequestWithContext(ctx, http.MethodGet, statusURL, nil)
			if err != nil {
				return nil, err
			}
			sreq.Header.Set("Authorization", "Key "+falKey)
			sresp, err := client.Do(sreq)
			if err != nil {
				o.log.Warn("fal.ai queue poll network error", zap.String("request_id", requestID), zap.Error(err))
				continue
			}
			sBody, _ := io.ReadAll(sresp.Body)
			sresp.Body.Close()

			if sresp.StatusCode >= 400 {
				return nil, fmt.Errorf("fal.ai queue status error %d: %s", sresp.StatusCode, string(sBody))
			}

			var statusResp map[string]interface{}
			if err := json.Unmarshal(sBody, &statusResp); err != nil {
				o.log.Warn("fal.ai queue poll decode error", zap.Error(err))
				continue
			}

			status := strings.ToUpper(fmt.Sprintf("%v", statusResp["status"]))
			o.log.Info("fal.ai queue status", zap.String("request_id", requestID), zap.String("status", status))

			switch status {
			case "COMPLETED":
				// 3. Fetch result.
				rreq, err := http.NewRequestWithContext(ctx, http.MethodGet, responseURL, nil)
				if err != nil {
					return nil, err
				}
				rreq.Header.Set("Authorization", "Key "+falKey)
				rresp, err := client.Do(rreq)
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
				if errMsg == "" {
					errMsg, _ = statusResp["error_message"].(string)
				}
				return nil, fmt.Errorf("fal.ai queue job failed: %s", errMsg)
			}
			// IN_QUEUE, IN_PROGRESS — keep polling
		}
	}
}

// extractFirstImageURL extracts the URL of the first image from a fal.ai response.
func extractFirstImageURL(raw map[string]interface{}) string {
	images, _ := raw["images"].([]interface{})
	if len(images) > 0 {
		if img, ok := images[0].(map[string]interface{}); ok {
			url, _ := img["url"].(string)
			return url
		}
	}
	return ""
}

// ─── callOpenAI ───────────────────────────────────────────────────────────────

// callOpenAI makes a synchronous call to the OpenAI chat completions endpoint
// using net/http (no SDK dependency) and returns the assistant message content.
// It retries automatically on 429 (rate-limit) responses with exponential backoff.
func (o *Orchestrator) callOpenAI(ctx context.Context, apiKey string, req openAIRequest) (string, error) {
	b, err := json.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("callOpenAI: marshal: %w", err)
	}

	const maxRetries = 4
	backoff := 2 * time.Second
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			// Respect context cancellation during backoff sleep.
			select {
			case <-ctx.Done():
				return "", fmt.Errorf("callOpenAI: context cancelled during retry backoff: %w", ctx.Err())
			case <-time.After(backoff):
			}
			backoff *= 2 // 2s → 4s → 8s → 16s
		}

		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
			"https://api.openai.com/v1/chat/completions", bytes.NewReader(b))
		if err != nil {
			return "", fmt.Errorf("callOpenAI: build request: %w", err)
		}
		httpReq.Header.Set("Authorization", "Bearer "+apiKey)
		httpReq.Header.Set("Content-Type", "application/json")

		resp, err := o.httpClient.Do(httpReq)
		if err != nil {
			return "", fmt.Errorf("callOpenAI: http: %w", err)
		}

		rawBody, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return "", fmt.Errorf("callOpenAI: read body: %w", err)
		}

		// Retry on 429 (rate limit) or 503 (service unavailable).
		if resp.StatusCode == 429 || resp.StatusCode == 503 {
			if attempt < maxRetries {
				o.log.Warn("callOpenAI: rate-limited, retrying",
					zap.Int("attempt", attempt+1),
					zap.Duration("backoff", backoff),
					zap.Int("status", resp.StatusCode))
				continue
			}
			return "", fmt.Errorf("callOpenAI: rate-limited after %d retries (status %d)", maxRetries, resp.StatusCode)
		}
		if resp.StatusCode >= 400 {
			return "", fmt.Errorf("callOpenAI: API error %d: %s", resp.StatusCode, string(rawBody))
		}

		var oaiResp openAIResponse
		if err := json.Unmarshal(rawBody, &oaiResp); err != nil {
			return "", fmt.Errorf("callOpenAI: decode: %w", err)
		}
		if len(oaiResp.Choices) == 0 {
			return "", fmt.Errorf("callOpenAI: no choices in response")
		}
		return strings.TrimSpace(oaiResp.Choices[0].Message.Content), nil
	}
	return "", fmt.Errorf("callOpenAI: exhausted retries")
}
