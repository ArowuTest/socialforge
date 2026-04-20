package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	openai "github.com/sashabaranov/go-openai"
)

// BrandContextScrape holds the structured brand context GPT extracted from a website.
type BrandContextScrape struct {
	BrandDescription string `json:"brand_description"` // mission, products, audience — ready for prompt injection
	BrandVoice       string `json:"brand_voice"`       // inferred tone/style ("friendly and conversational")
	TargetAudience   string `json:"target_audience"`   // inferred ideal customer description
}

// ScrapeBrandContext fetches the website at websiteURL, extracts the main text
// (homepage + /about when available), and calls GPT-4o-mini to produce a
// structured brand context summary. This is stored in brand_kits.brand_description
// and injected into every AI generation prompt for that brand kit.
//
// The scrape is intentionally lightweight — no headless browser, no JS rendering.
// It works well for content-first marketing sites. Dynamic SPAs may return less text.
func (s *Service) ScrapeBrandContext(ctx context.Context, websiteURL string) (*BrandContextScrape, error) {
	// 1. Fetch homepage.
	homepageText, err := extractTextFromURL(ctx, websiteURL)
	if err != nil {
		return nil, fmt.Errorf("ScrapeBrandContext: fetch homepage: %w", err)
	}
	if len(strings.TrimSpace(homepageText)) < 30 {
		return nil, fmt.Errorf("ScrapeBrandContext: could not extract meaningful text from %s", websiteURL)
	}

	// Truncate homepage to avoid token bloat.
	if len(homepageText) > 5000 {
		homepageText = homepageText[:5000]
	}

	// 2. Try /about for richer mission/team context — best-effort, silently skip if missing.
	baseURL := strings.TrimRight(websiteURL, "/")
	combined := homepageText
	for _, path := range []string{"/about", "/about-us", "/company"} {
		aboutText, err := extractTextFromURL(ctx, baseURL+path)
		if err == nil && len(strings.TrimSpace(aboutText)) > 100 {
			appendText := "\n\n[About page:]\n" + aboutText
			if len(combined)+len(appendText) > 8000 {
				appendText = appendText[:8000-len(combined)]
			}
			combined += appendText
			break
		}
	}

	// 3. Call GPT-4o-mini to extract structured brand context.
	openaiClient, err := s.requireOpenAIClient()
	if err != nil {
		return nil, fmt.Errorf("ScrapeBrandContext: %w", err)
	}

	systemPrompt := `You are a brand strategist. Analyse the website content and extract key brand information.

Return a JSON object with exactly these keys:
- "brand_description": 2-4 sentences covering: what the company does, their products/services, their mission or core value proposition, and who they serve. This will be injected directly into AI content generation prompts — be factual, specific, and useful for a social media writer.
- "brand_voice": A short phrase (3-8 words) describing the communication style you observe on the site (e.g. "bold and data-driven", "warm and approachable", "authoritative and technical"). Empty string if the site does not have enough prose to judge.
- "target_audience": 1-2 sentences describing the ideal customer or audience the brand appears to be speaking to. Empty string if unclear.

Rules:
- Only state what the website content clearly demonstrates — never invent information.
- If the site has very little text, describe only what you can confirm from what's there.
- Use present tense ("This company builds...", "They serve...").`

	resp, err := openaiClient.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model: "gpt-4o-mini",
		Messages: []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleSystem, Content: systemPrompt},
			{Role: openai.ChatMessageRoleUser, Content: "Website content:\n\n" + combined},
		},
		ResponseFormat: &openai.ChatCompletionResponseFormat{Type: openai.ChatCompletionResponseFormatTypeJSONObject},
		Temperature:    0.2, // low temp — accurate extraction, not creative output
	})
	if err != nil {
		return nil, fmt.Errorf("ScrapeBrandContext: openai: %w", err)
	}
	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("ScrapeBrandContext: no choices in openai response")
	}

	var result BrandContextScrape
	if err := json.Unmarshal([]byte(resp.Choices[0].Message.Content), &result); err != nil {
		return nil, fmt.Errorf("ScrapeBrandContext: parse JSON: %w", err)
	}

	return &result, nil
}
