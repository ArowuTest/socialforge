// Package ai — Copilot module.
//
// Copilot is a workspace-aware chat assistant. Unlike the single-shot caption /
// hashtag generators, Copilot can call tools to fetch the user's actual posts,
// analytics, and brand kit before answering — so prompts like "show me my top
// 5 posts" or "draft 3 captions like my best one" work without the user
// having to paste data in.
//
// It uses OpenAI's function-calling. Each user message costs CreditCostCopilot
// credits, regardless of how many tool round-trips the model makes (capped at
// maxToolLoops below to bound cost).
package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/sashabaranov/go-openai"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/models"
)

// maxToolLoops bounds how many tool-call rounds the model can make before we
// force a final answer. 4 covers "fetch top posts → fetch brand kit → reason
// → reply" comfortably.
const maxToolLoops = 4

// CopilotMessage is one entry in the chat history.
type CopilotMessage struct {
	Role    string `json:"role"`    // "user" | "assistant"
	Content string `json:"content"`
}

// CopilotToolCall echoes a single tool invocation so callers can see which
// tools the model used and with what arguments. Useful for debugging "why did
// it return all-time when I asked for this month".
type CopilotToolCall struct {
	Name string `json:"name"`
	Args string `json:"args,omitempty"`
}

// CopilotResponse is what Copilot returns to the caller.
type CopilotResponse struct {
	Reply     string            `json:"reply"`
	ToolsUsed []string          `json:"tools_used,omitempty"`
	ToolCalls []CopilotToolCall `json:"tool_calls,omitempty"`
}

// Copilot answers a user message using workspace context. Tool calls are
// dispatched server-side so the client never sees raw DB rows leaking through
// — the model decides when it needs more data, we resolve it, and the final
// reply is what the user sees.
func (s *Service) Copilot(
	ctx context.Context,
	workspaceID, userID uuid.UUID,
	userMessage string,
	history []CopilotMessage,
) (*CopilotResponse, *models.AIJob, error) {
	userMessage = strings.TrimSpace(userMessage)
	if userMessage == "" {
		return nil, nil, fmt.Errorf("Copilot: message is required")
	}

	cost := s.getCreditCost("copilot", CreditCostCopilot)
	if err := s.DeductCredits(ctx, workspaceID, cost); err != nil {
		return nil, nil, err
	}

	openaiClient, err := s.requireOpenAIClient()
	if err != nil {
		job, _ := s.saveJob(ctx, workspaceID, userID, "copilot",
			models.JSONMap{"message": userMessage}, nil, cost, err.Error())
		return nil, job, fmt.Errorf("Copilot: %w", err)
	}

	// Build the conversation. History is capped at 10 prior turns to bound
	// token cost — older context is dropped silently.
	systemPrompt := `You are the user's social-media Copilot inside SocialForge.

You have FOUR tools and must use them aggressively — guessing about workspace data when a tool can fetch the truth is a failure:
  • get_top_posts(since_days=N, limit=N)   → best-performing published posts
  • get_recent_posts(limit=N, status=?)    → most recent posts incl. drafts
  • get_brand_kit()                        → voice, audience, dos/donts, pillars, hashtags
  • get_analytics_summary(days=N)          → impressions, engagements, reach totals

CALLING PATTERNS (follow these exactly):

  User: "what's my best post"
  → get_top_posts({"limit": 5})        // default 30-day window
  → answer with the top result + its engagement number

  User: "show my top 3 this month" / "best posts in May" / "last 30 days"
  → get_top_posts({"limit": 3, "since_days": 30})

  User: "what worked all-time" / "best ever"
  → get_top_posts({"limit": 5, "since_days": 0})   // 0 = all-time

  User: "draft a caption like my best post"
  → 1) get_top_posts({"limit": 1})
  → 2) get_brand_kit()                              // for voice
  → 3) write the new caption in a fenced code block matching that voice

  User: "draft something on-brand about X"
  → get_brand_kit() FIRST, then write
  → if brand_kit returns null, write a competent generic post and note "set up your brand kit for on-brand drafts"

  User: "how's my engagement"  / "performance this month"
  → get_analytics_summary({"days": 30})

  User: "what did I post last week"
  → get_recent_posts({"limit": 10, "status": "published"})

If a tool returns an error or empty result, SAY SO ("no published posts in the last 30 days yet") rather than making something up. Never claim numbers the tools did not return.

Style:
- Concise. 2–4 sentences unless the user clearly wants depth.
- Markdown sparingly — bullets fine, headings rarely needed.
- When drafting content, return it in a fenced code block so the user can copy it.
- Speak plainly. Don't apologise for limitations; just answer.

Today's date: ` + time.Now().UTC().Format("2006-01-02")

	messages := []openai.ChatCompletionMessage{
		{Role: openai.ChatMessageRoleSystem, Content: systemPrompt},
	}
	historyTail := history
	if len(historyTail) > 10 {
		historyTail = historyTail[len(historyTail)-10:]
	}
	for _, h := range historyTail {
		role := openai.ChatMessageRoleUser
		if h.Role == "assistant" {
			role = openai.ChatMessageRoleAssistant
		}
		messages = append(messages, openai.ChatCompletionMessage{Role: role, Content: h.Content})
	}
	messages = append(messages, openai.ChatCompletionMessage{
		Role:    openai.ChatMessageRoleUser,
		Content: userMessage,
	})

	tools := copilotTools()
	toolsUsed := []string{}
	toolCalls := []CopilotToolCall{}

	// Tool-call loop. Each iteration is one OpenAI call; the model either
	// emits tool calls (which we resolve and feed back) or returns a final
	// assistant message.
	var finalReply string
	for i := 0; i < maxToolLoops; i++ {
		// Force a plain answer on the last loop (no more tool calls).
		toolChoice := "auto"
		if i == maxToolLoops-1 {
			toolChoice = "none"
		}

		resp, err := openaiClient.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
			Model:      s.modelFor(ctx, "copilot", "gpt-4o"),
			Messages:   messages,
			Tools:      tools,
			ToolChoice: toolChoice,
			Temperature: s.temperatureFor(ctx, "copilot", 0.6),
		})
		if err != nil {
			job, _ := s.saveJob(ctx, workspaceID, userID, "copilot",
				models.JSONMap{"message": userMessage}, nil, cost, err.Error())
			return nil, job, fmt.Errorf("Copilot: openai: %w", err)
		}
		if len(resp.Choices) == 0 {
			return nil, nil, fmt.Errorf("Copilot: empty response from model")
		}
		choice := resp.Choices[0].Message

		if len(choice.ToolCalls) == 0 {
			finalReply = strings.TrimSpace(choice.Content)
			break
		}

		// Append the assistant turn with tool calls, then resolve each.
		messages = append(messages, choice)
		for _, tc := range choice.ToolCalls {
			result := s.runCopilotTool(ctx, workspaceID, tc.Function.Name, tc.Function.Arguments)
			toolsUsed = append(toolsUsed, tc.Function.Name)
			toolCalls = append(toolCalls, CopilotToolCall{Name: tc.Function.Name, Args: tc.Function.Arguments})
			messages = append(messages, openai.ChatCompletionMessage{
				Role:       openai.ChatMessageRoleTool,
				ToolCallID: tc.ID,
				Content:    result,
			})
		}
	}

	if finalReply == "" {
		finalReply = "Sorry — I couldn't put a clear answer together for that one. Could you rephrase?"
	}

	job, _ := s.saveJob(ctx, workspaceID, userID, "copilot",
		models.JSONMap{"message": userMessage, "history_len": len(historyTail)},
		models.JSONMap{"reply": finalReply, "tools_used": toolsUsed},
		cost, "")

	return &CopilotResponse{Reply: finalReply, ToolsUsed: toolsUsed, ToolCalls: toolCalls}, job, nil
}

// ── Tool registry ────────────────────────────────────────────────────────────

func copilotTools() []openai.Tool {
	return []openai.Tool{
		{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name:        "get_top_posts",
				Description: "Return the workspace's top-performing published posts ranked by engagement. Default window is the last 30 days. ALWAYS pass since_days to match the user's intent: 'this month' or 'recent' → 30, 'last week' → 7, 'this quarter' → 90, 'this year' → 365, 'all-time' / 'ever' / 'overall' → pass since_days=0 explicitly.",
				Parameters: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"limit": map[string]any{
							"type":        "integer",
							"description": "How many top posts to return. Default 5, max 20.",
						},
						"since_days": map[string]any{
							"type":        "integer",
							"description": "Only consider posts published in the last N days. Pass 0 ONLY for all-time. Defaults to 30 if omitted.",
						},
					},
				},
			},
		},
		{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name:        "get_recent_posts",
				Description: "Return the workspace's most recent posts (any status). Use this for 'what have I posted lately', 'show my drafts', or to find context for follow-up questions.",
				Parameters: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"limit": map[string]any{
							"type":        "integer",
							"description": "How many posts to return. Default 5, max 20.",
						},
						"status": map[string]any{
							"type":        "string",
							"description": "Optional filter: 'draft', 'scheduled', 'published', 'failed'.",
						},
					},
				},
			},
		},
		{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name:        "get_brand_kit",
				Description: "Return the workspace's default brand kit — voice, audience, dos/donts, content pillars, hashtags. Use this when the user asks to draft content 'in my brand voice' or 'on-brand'.",
				Parameters: map[string]any{
					"type":       "object",
					"properties": map[string]any{},
				},
			},
		},
		{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name:        "get_analytics_summary",
				Description: "Return aggregate analytics totals (impressions, engagements, reach, posts published) for a recent window. Use this for 'how am I doing this month', 'overall performance', or trend questions.",
				Parameters: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"days": map[string]any{
							"type":        "integer",
							"description": "Window size in days. Default 30, max 90.",
						},
					},
				},
			},
		},
	}
}

// runCopilotTool dispatches a function call from the model. Returns a JSON
// string that goes back into the conversation as the tool result. Errors are
// returned as JSON objects too — the model will see and react to them.
func (s *Service) runCopilotTool(ctx context.Context, workspaceID uuid.UUID, name, argsJSON string) string {
	switch name {
	case "get_top_posts":
		return s.toolGetTopPosts(ctx, workspaceID, argsJSON)
	case "get_recent_posts":
		return s.toolGetRecentPosts(ctx, workspaceID, argsJSON)
	case "get_brand_kit":
		return s.toolGetBrandKit(ctx, workspaceID)
	case "get_analytics_summary":
		return s.toolGetAnalyticsSummary(ctx, workspaceID, argsJSON)
	default:
		return toolErr(fmt.Sprintf("unknown tool: %s", name))
	}
}

func toolErr(msg string) string {
	b, _ := json.Marshal(map[string]string{"error": msg})
	return string(b)
}

func toolJSON(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return toolErr(err.Error())
	}
	return string(b)
}

// ── Tool implementations ─────────────────────────────────────────────────────
// These query GORM directly to keep the Copilot self-contained. They return
// trimmed projections (not full models) so the model isn't fed irrelevant DB
// columns that waste tokens.

func (s *Service) toolGetTopPosts(ctx context.Context, workspaceID uuid.UUID, argsJSON string) string {
	var args struct {
		Limit     int  `json:"limit"`
		SinceDays *int `json:"since_days"` // pointer to distinguish "missing" from explicit 0 (all-time)
	}
	_ = json.Unmarshal([]byte(argsJSON), &args)
	if args.Limit <= 0 {
		args.Limit = 5
	}
	if args.Limit > 20 {
		args.Limit = 20
	}
	// Default window: 30 days. Explicit 0 = all-time. Anything else clamped to [1, 365].
	effectiveSinceDays := 30
	if args.SinceDays != nil {
		if *args.SinceDays == 0 {
			effectiveSinceDays = 0
		} else if *args.SinceDays < 0 {
			effectiveSinceDays = 30
		} else if *args.SinceDays > 365 {
			effectiveSinceDays = 365
		} else {
			effectiveSinceDays = *args.SinceDays
		}
	}

	type row struct {
		ID          uuid.UUID `json:"id"`
		Content     string    `json:"content"`
		Platforms   string    `json:"platforms"`
		PublishedAt time.Time `json:"published_at"`
		Likes       int       `json:"likes"`
		Comments    int       `json:"comments"`
		Shares      int       `json:"shares"`
		Impressions int       `json:"impressions"`
		Engagement  int       `json:"engagement_total"`
	}

	// Build the query — since_days adds a published_at >= cutoff filter so the
	// model can honour "this month" / "last week" requests. Engagement metrics
	// live on post_platforms (one row per platform per post) — summed here so
	// posts cross-published to multiple platforms aggregate correctly.
	sql := `
		SELECT p.id, p.content, p.platforms::text AS platforms, p.published_at,
		       COALESCE(SUM(pp.likes), 0)        AS likes,
		       COALESCE(SUM(pp.comments), 0)     AS comments,
		       COALESCE(SUM(pp.shares), 0)       AS shares,
		       COALESCE(SUM(pp.impressions), 0)  AS impressions,
		       COALESCE(SUM(pp.likes + pp.comments + pp.shares), 0) AS engagement
		FROM posts p
		LEFT JOIN post_platforms pp ON pp.post_id = p.id
		WHERE p.workspace_id = ? AND p.status = 'published' AND p.deleted_at IS NULL`
	params := []any{workspaceID}
	windowNote := "all-time"
	if effectiveSinceDays > 0 {
		sql += ` AND p.published_at >= ?`
		params = append(params, time.Now().UTC().AddDate(0, 0, -effectiveSinceDays))
		windowNote = fmt.Sprintf("last %d days", effectiveSinceDays)
	}
	sql += `
		GROUP BY p.id
		ORDER BY engagement DESC, p.published_at DESC
		LIMIT ?`
	params = append(params, args.Limit)

	var rows []row
	if err := s.db.WithContext(ctx).Raw(sql, params...).Scan(&rows).Error; err != nil {
		return toolErr(err.Error())
	}
	if len(rows) == 0 {
		return toolJSON(map[string]any{
			"posts":  []any{},
			"window": windowNote,
			"note":   "No published posts in this window. Note: engagement metrics are populated ~25h after publish, so very recent posts may not yet have data.",
		})
	}
	// Trim content to 200 chars so the model doesn't gorge on long posts.
	for i := range rows {
		if len(rows[i].Content) > 200 {
			rows[i].Content = rows[i].Content[:200] + "…"
		}
	}
	return toolJSON(map[string]any{"posts": rows, "window": windowNote})
}

func (s *Service) toolGetRecentPosts(ctx context.Context, workspaceID uuid.UUID, argsJSON string) string {
	var args struct {
		Limit  int    `json:"limit"`
		Status string `json:"status"`
	}
	_ = json.Unmarshal([]byte(argsJSON), &args)
	if args.Limit <= 0 {
		args.Limit = 5
	}
	if args.Limit > 20 {
		args.Limit = 20
	}

	type row struct {
		ID          uuid.UUID  `json:"id"`
		Content     string     `json:"content"`
		Status      string     `json:"status"`
		Platforms   string     `json:"platforms"`
		ScheduledAt *time.Time `json:"scheduled_at,omitempty"`
		PublishedAt *time.Time `json:"published_at,omitempty"`
		CreatedAt   time.Time  `json:"created_at"`
	}
	q := s.db.WithContext(ctx).Table("posts").
		Select("id, content, status, platforms::text AS platforms, scheduled_at, published_at, created_at").
		Where("workspace_id = ? AND deleted_at IS NULL", workspaceID).
		Order("created_at DESC").
		Limit(args.Limit)
	if args.Status != "" {
		q = q.Where("status = ?", args.Status)
	}
	var rows []row
	if err := q.Scan(&rows).Error; err != nil {
		return toolErr(err.Error())
	}
	for i := range rows {
		if len(rows[i].Content) > 200 {
			rows[i].Content = rows[i].Content[:200] + "…"
		}
	}
	return toolJSON(map[string]any{"posts": rows})
}

func (s *Service) toolGetBrandKit(ctx context.Context, workspaceID uuid.UUID) string {
	var bk models.BrandKit
	err := s.db.WithContext(ctx).
		Where("workspace_id = ? AND is_default = TRUE", workspaceID).
		First(&bk).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return toolJSON(map[string]any{"brand_kit": nil, "note": "No default brand kit set for this workspace."})
		}
		return toolErr(err.Error())
	}
	return toolJSON(map[string]any{
		"name":             bk.Name,
		"brand_voice":      bk.BrandVoice,
		"target_audience":  bk.TargetAudience,
		"dos":              bk.Dos,
		"donts":            bk.Donts,
		"content_pillars":  bk.ContentPillars,
		"brand_hashtags":   bk.BrandHashtags,
	})
}

func (s *Service) toolGetAnalyticsSummary(ctx context.Context, workspaceID uuid.UUID, argsJSON string) string {
	var args struct{ Days int `json:"days"` }
	_ = json.Unmarshal([]byte(argsJSON), &args)
	if args.Days <= 0 {
		args.Days = 30
	}
	if args.Days > 90 {
		args.Days = 90
	}
	since := time.Now().UTC().AddDate(0, 0, -args.Days)

	var summary struct {
		PostsPublished int `json:"posts_published"`
		Impressions    int `json:"impressions"`
		Engagements    int `json:"engagements"`
		Reach          int `json:"reach"`
	}
	// Engagement metrics live on post_platforms (one row per platform per post)
	// — totals are summed across platforms.
	err := s.db.WithContext(ctx).Raw(`
		SELECT
		  (SELECT COUNT(*) FROM posts WHERE workspace_id = ? AND status='published' AND published_at >= ? AND deleted_at IS NULL) AS posts_published,
		  COALESCE((SELECT SUM(impressions) FROM post_platforms pp JOIN posts p ON p.id = pp.post_id WHERE p.workspace_id = ? AND p.published_at >= ?), 0) AS impressions,
		  COALESCE((SELECT SUM(likes + comments + shares) FROM post_platforms pp JOIN posts p ON p.id = pp.post_id WHERE p.workspace_id = ? AND p.published_at >= ?), 0) AS engagements,
		  COALESCE((SELECT SUM(reach) FROM post_platforms pp JOIN posts p ON p.id = pp.post_id WHERE p.workspace_id = ? AND p.published_at >= ?), 0) AS reach`,
		workspaceID, since, workspaceID, since, workspaceID, since, workspaceID, since).
		Scan(&summary).Error
	if err != nil {
		return toolErr(err.Error())
	}
	return toolJSON(map[string]any{
		"window_days":     args.Days,
		"posts_published": summary.PostsPublished,
		"impressions":     summary.Impressions,
		"engagements":     summary.Engagements,
		"reach":           summary.Reach,
	})
}

