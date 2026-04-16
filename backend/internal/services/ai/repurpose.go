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

// platformSystemPrompt returns the system prompt to use when repurposing
// content for the given target platform.
func platformSystemPrompt(platform string) string {
	prompts := map[string]string{
		"twitter": "Rewrite as a punchy tweet under 280 chars with 2-3 hashtags. Hook in first 5 words. " +
			"Return JSON with keys: content (string), hashtags ([]string), media_prompt (string).",
		"linkedin": "Rewrite as a LinkedIn post 150-300 words. Professional tone. Line breaks for readability. " +
			"3-5 hashtags. Return JSON with keys: content (string), hashtags ([]string), media_prompt (string).",
		"instagram": "Rewrite as an Instagram caption. Conversational, 150-200 words. Heavy emojis. " +
			"10-15 hashtags at end. Return JSON with keys: content (string), hashtags ([]string), media_prompt (string).",
		"tiktok": "Rewrite as a TikTok video script/caption. Gen-Z tone, hook first, 100-150 words, 5 hashtags. " +
			"Return JSON with keys: content (string), hashtags ([]string), media_prompt (string).",
		"facebook": "Rewrite as a Facebook post. Conversational, 100-200 words, encourage comments. " +
			"Return JSON with keys: content (string), hashtags ([]string), media_prompt (string).",
		"youtube": "Rewrite as a YouTube video description. Include title suggestion, description 200 words, " +
			"timestamps placeholder, tags. Return JSON with keys: content (string), hashtags ([]string), media_prompt (string).",
		"pinterest": "Rewrite as a Pinterest pin description. Keyword-rich, 100-150 words, include what it is + why it's useful. " +
			"Return JSON with keys: content (string), hashtags ([]string), media_prompt (string).",
		"threads": "Rewrite as a Threads post. Conversational, under 500 chars, 1-3 hashtags. " +
			"Return JSON with keys: content (string), hashtags ([]string), media_prompt (string).",
	}

	if p, ok := prompts[strings.ToLower(platform)]; ok {
		return p
	}
	return fmt.Sprintf(
		"Rewrite the content optimised for %s. "+
			"Return JSON with keys: content (string), hashtags ([]string), media_prompt (string).",
		platform,
	)
}

// ─── RepurposeFromURL ─────────────────────────────────────────────────────────

// RepurposeFromURL fetches the web page at rawURL, extracts its main article
// text, then repurposes it for each of the targetPlatforms.
func RepurposeFromURL(
	ctx context.Context,
	rawURL string,
	targetPlatforms []string,
	openaiClient *openai.Client,
) (map[string]PlatformDraft, error) {
	text, err := extractTextFromURL(ctx, rawURL)
	if err != nil {
		return nil, fmt.Errorf("repurpose: extract text from URL: %w", err)
	}

	if len(strings.TrimSpace(text)) < 50 {
		return nil, fmt.Errorf("repurpose: could not extract enough text from %s", rawURL)
	}

	return repurposeText(ctx, text, targetPlatforms, openaiClient)
}

// ─── RepurposeFromText ────────────────────────────────────────────────────────

// RepurposeFromText repurposes the supplied text (from fromPlatform) for each
// of the targetPlatforms.
func RepurposeFromText(
	ctx context.Context,
	content string,
	fromPlatform string,
	targetPlatforms []string,
	openaiClient *openai.Client,
) (map[string]PlatformDraft, error) {
	if strings.TrimSpace(content) == "" {
		return nil, fmt.Errorf("repurpose: content must not be empty")
	}
	return repurposeText(ctx, content, targetPlatforms, openaiClient)
}

// ─── RepurposeFromYouTube ─────────────────────────────────────────────────────

// RepurposeFromYouTube fetches the YouTube video's title, description, and tags
// via the YouTube Data API v3, then repurposes the combined text.
func RepurposeFromYouTube(
	ctx context.Context,
	videoID string,
	targetPlatforms []string,
	youtubeAPIKey string,
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

	return repurposeText(ctx, sourceContent, targetPlatforms, openaiClient)
}

// ─── repurposeText (core) ─────────────────────────────────────────────────────

// repurposeText issues one OpenAI chat completion per target platform and
// returns a map of platform → PlatformDraft.
func repurposeText(
	ctx context.Context,
	content string,
	targetPlatforms []string,
	openaiClient *openai.Client,
) (map[string]PlatformDraft, error) {
	if len(targetPlatforms) == 0 {
		return nil, fmt.Errorf("repurpose: at least one target platform is required")
	}

	results := make(map[string]PlatformDraft, len(targetPlatforms))

	for _, platform := range targetPlatforms {
		systemPrompt := platformSystemPrompt(platform)

		resp, err := openaiClient.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
			Model: "gpt-4o-mini",
			Messages: []openai.ChatCompletionMessage{
				{
					Role:    openai.ChatMessageRoleSystem,
					Content: systemPrompt,
				},
				{
					Role:    openai.ChatMessageRoleUser,
					Content: content,
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
