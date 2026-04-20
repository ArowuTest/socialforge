// Package ai – repurpose.go provides content repurposing across social platforms.
//
// Three public entry points:
//   - RepurposeFromURL    – fetches a web page, extracts main text, repurposes it.
//   - RepurposeFromText   – repurposes a pre-supplied text for multiple platforms.
//   - RepurposeFromYouTube – fetches a YouTube video's metadata and repurposes it.
//
// All three ultimately call repurposeText which issues one OpenAI call per
// target platform and returns a PlatformDraft for each.
package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	openai "github.com/sashabaranov/go-openai"

	"github.com/socialforge/backend/internal/models"
)

// ─── types ────────────────────────────────────────────────────────────────────

// PlatformDraft holds the AI-generated content for a single target platform.
type PlatformDraft struct {
	Platform    string   `json:"platform"`
	Content     string   `json:"content"`
	Hashtags    []string `json:"hashtags"`
	CharCount   int      `json:"char_count"`
	MediaPrompt string   `json:"media_prompt"`
}

// ─── platform system prompts ─────────────────────────────────────────────────

// buildBrandSection constructs the brand identity block injected into every
// repurpose prompt. Returns an empty string when bk is nil.
func buildBrandSection(bk *models.BrandKit) string {
	if bk == nil {
		return ""
	}
	var sb strings.Builder
	sb.WriteString("\n\n── BRAND IDENTITY (follow exactly) ──")
	// Website-derived brand description is the richest context signal — put it first
	// so the model reads what the company actually does before anything else.
	if bk.BrandDescription != "" {
		sb.WriteString(fmt.Sprintf("\nAbout this brand: %s", bk.BrandDescription))
	}
	if bk.Industry != "" {
		sb.WriteString(fmt.Sprintf("\nIndustry: %s", bk.Industry))
	}
	if bk.BrandVoice != "" {
		sb.WriteString(fmt.Sprintf("\nBrand voice: %s", bk.BrandVoice))
	}
	if bk.TargetAudience != "" {
		sb.WriteString(fmt.Sprintf("\nTarget audience: %s", bk.TargetAudience))
	}
	if len(bk.Dos) > 0 {
		sb.WriteString(fmt.Sprintf("\nAlways do: %s", strings.Join(bk.Dos, "; ")))
	}
	if len(bk.Donts) > 0 {
		sb.WriteString(fmt.Sprintf("\nNEVER do: %s", strings.Join(bk.Donts, "; ")))
	}
	if len(bk.CTAPreferences) > 0 {
		var ctaParts []string
		for k, v := range bk.CTAPreferences {
			ctaParts = append(ctaParts, fmt.Sprintf("%s: %s", k, v))
		}
		sb.WriteString(fmt.Sprintf("\nPreferred CTAs: %s", strings.Join(ctaParts, "; ")))
	}
	// Few-shot examples — the single highest-value signal for brand voice matching.
	if len(bk.ExamplePosts) > 0 {
		examples := bk.ExamplePosts
		if len(examples) > 2 {
			examples = examples[:2]
		}
		sb.WriteString("\nBrand voice examples (match this style precisely):")
		for i, ex := range examples {
			sb.WriteString(fmt.Sprintf("\n  [Example %d] %s", i+1, ex))
		}
	}
	sb.WriteString("\n── END BRAND IDENTITY ──\n")
	return sb.String()
}

// buildRepurposeSystemPrompt returns a detailed, brand-aware system prompt for
// repurposing content on the given platform.
func buildRepurposeSystemPrompt(platform string, bk *models.BrandKit) string {
	brand := buildBrandSection(bk)

	const jsonInstruction = "\n\nReturn ONLY a valid JSON object with exactly these keys:\n- \"content\": the complete post text (string)\n- \"hashtags\": array of hashtags without # prefix (string[])\n- \"media_prompt\": a vivid, wordless image description for this post (string)"

	platformGuides := map[string]string{
		"twitter": fmt.Sprintf(`You are an expert Twitter/X content strategist who turns long-form content into high-engagement tweets.%s

PLATFORM RULES:
- STRICT 280-character limit — count every character including spaces and emojis
- Lead with the sharpest insight, stat, or take from the source content — make it impossible to scroll past
- Strong opinions and counter-intuitive takes outperform neutral summaries
- 1-2 hashtags maximum, woven inline — NOT stacked at the end
- End with a hook question or punchy statement that invites replies
- Sound like a knowledgeable human, not a press release%s`, brand, jsonInstruction),

		"linkedin": fmt.Sprintf(`You are an expert LinkedIn content strategist who creates high-performing professional posts.%s

PLATFORM RULES:
- First line is EVERYTHING — appears before "...see more". Make it a bold claim, story opener, or surprising stat
- Short paragraphs: 1-2 sentences max, with a blank line between each
- Optimal length: 1,200-1,500 characters (longer gets the "see more" fold)
- Write in first person — share a lesson, insight, or personal take from the source content
- 3-5 relevant industry hashtags at the very end
- End with a question that invites professional discussion
- Storytelling > bullet points on this platform%s`, brand, jsonInstruction),

		"instagram": fmt.Sprintf(`You are an expert Instagram content strategist who writes captions that stop the scroll.%s

PLATFORM RULES:
- Hook in the FIRST LINE (before the fold) — bold claim, relatable pain point, or curiosity gap
- Conversational tone — write like you're texting a friend who happens to be your ideal customer
- Use strategic line breaks and short paragraphs for mobile readability
- Emojis: use purposefully to break up text and add personality (not excessively)
- 150-300 words is optimal — long enough to build connection, short enough to hold attention
- Strong CTA: "Save this for later", "Share with someone who needs this", "Drop your answer below"
- 10-15 highly relevant hashtags at the end (mix of niche and broad)%s`, brand, jsonInstruction),

		"tiktok": fmt.Sprintf(`You are an expert TikTok content strategist who writes captions that drive views and follows.%s

PLATFORM RULES:
- 150 characters MAX for the caption — anything longer gets truncated before the first tap
- First line must be a pattern interrupt: a bold claim, shocking stat, or "wait for it" hook
- Authentic, Gen-Z-adjacent voice — conversational, energetic, NO corporate speak
- 3-5 hashtags: 1-2 trending (#fyp, #viral), 2-3 niche-specific
- CTA: "Follow for more", "Save this", "Duet this", "Stitch this"
- Write the media_prompt as a TikTok video concept description (what happens on screen, POV, transitions)%s`, brand, jsonInstruction),

		"facebook": fmt.Sprintf(`You are an expert Facebook content strategist who drives comments and shares.%s

PLATFORM RULES:
- Storytelling posts outperform promotional posts — lead with a relatable situation or story
- Optimal length: 80-200 words for feed posts; 300-500 for groups
- Ask a direct question to invite comments — make it easy to answer
- 0-3 hashtags max (Facebook de-prioritises hashtag-heavy posts)
- Conversational, warm tone — write for communities, not broadcast audiences
- Behind-the-scenes, personal stories, and "I learned this the hard way" format performs best%s`, brand, jsonInstruction),

		"youtube": fmt.Sprintf(`You are an expert YouTube SEO strategist who writes descriptions that rank and drive clicks.%s

PLATFORM RULES:
- First 150 characters appear in search results — front-load the primary keyword naturally
- Structure: 2-3 keyword-rich paragraphs describing the video value proposition
- Include a placeholder for chapter timestamps: [0:00 Intro, X:XX Topic 1, ...]
- Clear CTA: "Subscribe for more", "Watch next:", "Download the free guide:"
- Total length: 500-1500 characters optimal for SEO
- The media_prompt should be a compelling YouTube thumbnail concept%s`, brand, jsonInstruction),

		"pinterest": fmt.Sprintf(`You are an expert Pinterest SEO strategist who writes descriptions that surface in search.%s

PLATFORM RULES:
- Pinterest is a visual search engine — write the description as if answering a search query
- Front-load your most important keyword in the first sentence
- 100-150 words optimal
- Include "how to", "tips for", or "ideas for" framing — people save actionable content
- 3-5 relevant keyword-rich hashtags
- The media_prompt should describe a vertical (2:3 ratio) Pinterest-style image — text overlay friendly%s`, brand, jsonInstruction),

		"threads": fmt.Sprintf(`You are an expert Threads content strategist who writes posts that spark genuine conversation.%s

PLATFORM RULES:
- STRICT 500-character limit — tight, punchy, every word earns its place
- Casual, authentic tone — hot takes, personal opinions, and relatable observations outperform polished prose
- 0-3 hashtags (the Threads community values authenticity over discoverability optimisation)
- Reply-bait: end with a genuine question or debatable statement
- Sound like a real person with actual opinions, not a brand account%s`, brand, jsonInstruction),

		"bluesky": fmt.Sprintf(`You are an expert Bluesky content strategist who writes for a tech-savvy, authenticity-first community.%s

PLATFORM RULES:
- STRICT 300-character limit
- Authentic, community-first tone — skip the marketing speak entirely
- 0-2 hashtags (community conventions are still forming)
- Link posts are welcome — no algorithm penalty
- Thoughtful, genuinely useful takes perform best
- Write as if contributing to a smart conversation, not broadcasting%s`, brand, jsonInstruction),
	}

	if guide, ok := platformGuides[strings.ToLower(platform)]; ok {
		return guide
	}
	return fmt.Sprintf(
		"You are an expert social media strategist. Repurpose the source content for %s with an authentic, platform-native voice that drives maximum engagement.%s%s",
		platform, brand, jsonInstruction,
	)
}

// ─── RepurposeFromURL ─────────────────────────────────────────────────────────

// RepurposeFromURL fetches the web page at rawURL, extracts its main article
// text, then repurposes it for each of the targetPlatforms.
func RepurposeFromURL(
	ctx context.Context,
	rawURL string,
	targetPlatforms []string,
	bk *models.BrandKit,
	openaiClient *openai.Client,
) (map[string]PlatformDraft, error) {
	text, err := extractTextFromURL(ctx, rawURL)
	if err != nil {
		return nil, fmt.Errorf("repurpose: extract text from URL: %w", err)
	}

	if len(strings.TrimSpace(text)) < 50 {
		return nil, fmt.Errorf("repurpose: could not extract enough text from %s", rawURL)
	}

	return repurposeText(ctx, text, targetPlatforms, bk, openaiClient)
}

// ─── RepurposeFromText ────────────────────────────────────────────────────────

// RepurposeFromText repurposes the supplied text (from fromPlatform) for each
// of the targetPlatforms.
func RepurposeFromText(
	ctx context.Context,
	content string,
	fromPlatform string,
	targetPlatforms []string,
	bk *models.BrandKit,
	openaiClient *openai.Client,
) (map[string]PlatformDraft, error) {
	if strings.TrimSpace(content) == "" {
		return nil, fmt.Errorf("repurpose: content must not be empty")
	}
	return repurposeText(ctx, content, targetPlatforms, bk, openaiClient)
}

// ─── RepurposeFromYouTube ─────────────────────────────────────────────────────

// RepurposeFromYouTube fetches the YouTube video's title, description, and tags
// via the YouTube Data API v3, then repurposes the combined text.
func RepurposeFromYouTube(
	ctx context.Context,
	videoID string,
	targetPlatforms []string,
	youtubeAPIKey string,
	bk *models.BrandKit,
	openaiClient *openai.Client,
) (map[string]PlatformDraft, error) {
	videoDetails, err := fetchYouTubeVideoDetails(ctx, videoID, youtubeAPIKey)
	if err != nil {
		return nil, fmt.Errorf("repurpose: fetch YouTube video details: %w", err)
	}

	// Combine title and description as the source content.
	sourceContent := strings.TrimSpace(videoDetails.title + "\n\n" + videoDetails.description)
	if len(strings.TrimSpace(sourceContent)) < 10 {
		return nil, fmt.Errorf("repurpose: YouTube video %s has no usable description", videoID)
	}

	return repurposeText(ctx, sourceContent, targetPlatforms, bk, openaiClient)
}

// ─── repurposeText (core) ─────────────────────────────────────────────────────

// repurposeText issues one OpenAI chat completion per target platform and
// returns a map of platform → PlatformDraft.
func repurposeText(
	ctx context.Context,
	content string,
	targetPlatforms []string,
	bk *models.BrandKit,
	openaiClient *openai.Client,
) (map[string]PlatformDraft, error) {
	if len(targetPlatforms) == 0 {
		return nil, fmt.Errorf("repurpose: at least one target platform is required")
	}

	results := make(map[string]PlatformDraft, len(targetPlatforms))

	for _, platform := range targetPlatforms {
		systemPrompt := buildRepurposeSystemPrompt(platform, bk)

		resp, err := openaiClient.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
			Model: "gpt-4o",
			Messages: []openai.ChatCompletionMessage{
				{
					Role:    openai.ChatMessageRoleSystem,
					Content: systemPrompt,
				},
				{
					Role:    openai.ChatMessageRoleUser,
					Content: "Repurpose the following content for " + platform + ":\n\n" + content,
				},
			},
			ResponseFormat: &openai.ChatCompletionResponseFormat{
				Type: openai.ChatCompletionResponseFormatTypeJSONObject,
			},
			Temperature: 0.75,
		})
		if err != nil {
			return nil, fmt.Errorf("repurpose: openai call for platform %s: %w", platform, err)
		}

		if len(resp.Choices) == 0 {
			return nil, fmt.Errorf("repurpose: no choices returned for platform %s", platform)
		}

		raw := resp.Choices[0].Message.Content

		var parsed struct {
			Content     string   `json:"content"`
			Hashtags    []string `json:"hashtags"`
			MediaPrompt string   `json:"media_prompt"`
		}
		if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
			// Fallback: treat entire response as content.
			parsed.Content = strings.TrimSpace(raw)
			parsed.Hashtags = []string{}
			parsed.MediaPrompt = ""
		}

		// Merge brand hashtags first so brand tags always appear.
		if bk != nil && len(bk.BrandHashtags) > 0 {
			seen := make(map[string]bool, len(parsed.Hashtags))
			for _, t := range parsed.Hashtags {
				seen[t] = true
			}
			merged := make([]string, 0, len(bk.BrandHashtags)+len(parsed.Hashtags))
			for _, t := range bk.BrandHashtags {
				if !seen[t] {
					merged = append(merged, t)
					seen[t] = true
				}
			}
			merged = append(merged, parsed.Hashtags...)
			parsed.Hashtags = merged
		}

		results[platform] = PlatformDraft{
			Platform:    platform,
			Content:     parsed.Content,
			Hashtags:    parsed.Hashtags,
			CharCount:   len([]rune(parsed.Content)),
			MediaPrompt: parsed.MediaPrompt,
		}
	}

	return results, nil
}

// ─── HTML text extraction ─────────────────────────────────────────────────────

// extractTextFromURL fetches the URL and extracts the main article text using
// basic heuristics: prefer <article> or <main> tags, otherwise aggregate all
// <p> block content and return the longest paragraph cluster.
func extractTextFromURL(ctx context.Context, rawURL string) (string, error) {
	httpClient := &http.Client{Timeout: 15 * time.Second}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", fmt.Errorf("build HTTP request: %w", err)
	}
	req.Header.Set("User-Agent", "ChiselPost-Repurpose/1.0")

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetch URL: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("fetch URL returned HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 5*1024*1024)) // cap at 5 MB
	if err != nil {
		return "", fmt.Errorf("read response body: %w", err)
	}

	html := string(body)
	return extractMainText(html), nil
}

// extractMainText applies heuristics to extract the most content-rich text
// from raw HTML without external dependencies.
func extractMainText(html string) string {
	// Try to find an <article> or <main> block first.
	for _, tag := range []string{"article", "main"} {
		if text := extractTagContent(html, tag); len(text) > 200 {
			return stripTags(text)
		}
	}

	// Fallback: collect all <p> blocks, then return the longest contiguous run.
	return extractParagraphs(html)
}

// extractTagContent returns the raw inner HTML between the first occurrence of
// <tag...> and its matching </tag>.
func extractTagContent(html, tag string) string {
	lower := strings.ToLower(html)
	openTag := "<" + tag
	closeTag := "</" + tag + ">"

	start := strings.Index(lower, openTag)
	if start < 0 {
		return ""
	}

	// Find end of opening tag.
	tagEnd := strings.Index(lower[start:], ">")
	if tagEnd < 0 {
		return ""
	}
	contentStart := start + tagEnd + 1

	end := strings.Index(lower[contentStart:], closeTag)
	if end < 0 {
		return ""
	}

	return html[contentStart : contentStart+end]
}

// extractParagraphs collects the text content of all <p> tags and returns
// the largest block of consecutive paragraphs.
func extractParagraphs(html string) string {
	var paragraphs []string
	lower := strings.ToLower(html)
	pos := 0

	for {
		pStart := strings.Index(lower[pos:], "<p")
		if pStart < 0 {
			break
		}
		pStart += pos

		tagEnd := strings.Index(lower[pStart:], ">")
		if tagEnd < 0 {
			break
		}
		contentStart := pStart + tagEnd + 1
		pos = contentStart

		pEnd := strings.Index(lower[contentStart:], "</p>")
		if pEnd < 0 {
			break
		}

		inner := html[contentStart : contentStart+pEnd]
		text := strings.TrimSpace(stripTags(inner))
		if len(text) > 40 {
			paragraphs = append(paragraphs, text)
		}
		pos = contentStart + pEnd + 4
	}

	if len(paragraphs) == 0 {
		return stripTags(html)
	}
	return strings.Join(paragraphs, "\n\n")
}

// stripTags removes HTML tags and decodes common entities.
func stripTags(html string) string {
	var b strings.Builder
	inTag := false

	for _, r := range html {
		switch {
		case r == '<':
			inTag = true
		case r == '>':
			inTag = false
			b.WriteRune(' ')
		case !inTag:
			b.WriteRune(r)
		}
	}

	result := b.String()

	// Decode common HTML entities.
	replacer := strings.NewReplacer(
		"&amp;", "&",
		"&lt;", "<",
		"&gt;", ">",
		"&quot;", `"`,
		"&#39;", "'",
		"&nbsp;", " ",
		"&mdash;", "—",
		"&ndash;", "–",
		"&hellip;", "…",
	)
	result = replacer.Replace(result)

	// Collapse runs of whitespace.
	lines := strings.Split(result, "\n")
	var cleaned []string
	for _, line := range lines {
		line = strings.Join(strings.Fields(line), " ")
		if line != "" {
			cleaned = append(cleaned, line)
		}
	}
	return strings.Join(cleaned, "\n")
}

// ─── YouTube Data API helper ──────────────────────────────────────────────────

type youTubeVideoDetails struct {
	title       string
	description string
	tags        []string
}

// fetchYouTubeVideoDetails calls the YouTube Data API v3 videos.list endpoint
// to retrieve a video's snippet (title, description, tags).
func fetchYouTubeVideoDetails(ctx context.Context, videoID, apiKey string) (*youTubeVideoDetails, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("YouTube API key is required")
	}

	reqURL := fmt.Sprintf(
		"https://www.googleapis.com/youtube/v3/videos?id=%s&part=snippet&key=%s",
		videoID, apiKey,
	)

	httpClient := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("YouTube API request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read YouTube API response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("YouTube API HTTP %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Items []struct {
			Snippet struct {
				Title       string   `json:"title"`
				Description string   `json:"description"`
				Tags        []string `json:"tags"`
			} `json:"snippet"`
		} `json:"items"`
		Error *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error,omitempty"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode YouTube API response: %w", err)
	}
	if result.Error != nil {
		return nil, fmt.Errorf("YouTube API error %d: %s", result.Error.Code, result.Error.Message)
	}
	if len(result.Items) == 0 {
		return nil, fmt.Errorf("YouTube video %q not found", videoID)
	}

	snippet := result.Items[0].Snippet
	return &youTubeVideoDetails{
		title:       snippet.Title,
		description: snippet.Description,
		tags:        snippet.Tags,
	}, nil
}
