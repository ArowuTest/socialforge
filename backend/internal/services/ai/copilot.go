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

// CopilotResponse is what Copilot returns to the caller.
type CopilotResponse struct {
	Reply     string   `json:"reply"`
	ToolsUsed []string `json:"tools_used,omitempty"`
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

You can fetch the user's actual posts, analytics, and brand kit via tools before answering. Always prefer tool data over guessing — if the user asks "what's my best post" you MUST call get_top_posts, never make up content. When the user asks you to draft something "like my best post" you should first fetch the best post, then write in its style.

Style:
- Be concise. Default to 2–4 sentence answers unless the user clearly wants a long response.
- Use markdown sparingly — bullets are fine, headings are usually overkill.
- When you draft content, return it in a fenced code block so the user can copy it.
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

	return &CopilotResponse{Reply: finalReply, ToolsUsed: toolsUsed}, job, nil
}

// ── Tool registry ────────────────────────────────────────────────────────────

func copilotTools() []openai.Tool {
	return []openai.Tool{
		{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name:        "get_top_posts",
				Description: "Return the workspace's top-performing published posts ranked by engagement. Use this for 'best post', 'top posts', 'what worked', etc. ALWAYS pass since_days when the user asks about a time window — 'this month' → 30, 'last week' → 7, 'this year' → 365. Omit since_days only when the user clearly wants all-time tops.",
				Parameters: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"limit": map[string]any{
							"type":        "integer",
							"description": "How many top posts to return. Default 5, max 20.",
						},
						"since_days": map[string]any{
							"type":        "integer",
							"description": "Only consider posts published in the last N days. Omit or pass 0 for all-time.",
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
		Limit     int `json:"limit"`
		SinceDays int `json:"since_days"`
	}
	_ = json.Unmarshal([]byte(argsJSON), &args)
	if args.Limit <= 0 {
		args.Limit = 5
	}
	if args.Limit > 20 {
		args.Limit = 20
	}
	if args.SinceDays < 0 {
		args.SinceDays = 0
	}
	if args.SinceDays > 365 {
		args.SinceDays = 365
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
	// model can honour "this month" / "last week" requests.
	sql := `
		SELECT p.id, p.content, p.platforms::text AS platforms, p.published_at,
		       COALESCE(SUM(pa.likes), 0)        AS likes,
		       COALESCE(SUM(pa.comments), 0)     AS comments,
		       COALESCE(SUM(pa.shares), 0)       AS shares,
		       COALESCE(SUM(pa.impressions), 0)  AS impressions,
		       COALESCE(SUM(pa.likes + pa.comments + pa.shares), 0) AS engagement
		FROM posts p
		LEFT JOIN post_analytics pa ON pa.post_id = p.id
		WHERE p.workspace_id = ? AND p.status = 'published' AND p.deleted_at IS NULL`
	params := []any{workspaceID}
	windowNote := "all-time"
	if args.SinceDays > 0 {
		sql += ` AND p.published_at >= ?`
		params = append(params, time.Now().UTC().AddDate(0, 0, -args.SinceDays))
		windowNote = fmt.Sprintf("last %d days", args.SinceDays)
	}
	sql += `
		GROUP BY p.id
		ORDER BY engagement DESC, p.published_at DESC
		LIMIT ?`
	params = append(params, args.Limit)

	var rows []row
	err := s.db.WithContext(ctx).Raw(sql, params...).Scan(&rows).Error
	if err != nil {
		// Fallback for envs without post_analytics rows yet: just return recent published posts.
		if isMissingTable(err) {
			return s.toolGetRecentPosts(ctx, workspaceID, `{"limit":`+itoa(args.Limit)+`,"status":"published"}`)
		}
		return toolErr(err.Error())
	}
	if len(rows) == 0 {
		return toolJSON(map[string]any{
			"posts":  []any{},
			"window": windowNote,
			"note":   "No published posts found in this window.",
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
	err := s.db.WithContext(ctx).Raw(`
		SELECT
		  (SELECT COUNT(*) FROM posts WHERE workspace_id = ? AND status='published' AND published_at >= ? AND deleted_at IS NULL) AS posts_published,
		  COALESCE((SELECT SUM(impressions) FROM post_analytics pa JOIN posts p ON p.id = pa.post_id WHERE p.workspace_id = ? AND p.published_at >= ?), 0) AS impressions,
		  COALESCE((SELECT SUM(likes + comments + shares) FROM post_analytics pa JOIN posts p ON p.id = pa.post_id WHERE p.workspace_id = ? AND p.published_at >= ?), 0) AS engagements,
		  COALESCE((SELECT SUM(reach) FROM post_analytics pa JOIN posts p ON p.id = pa.post_id WHERE p.workspace_id = ? AND p.published_at >= ?), 0) AS reach`,
		workspaceID, since, workspaceID, since, workspaceID, since, workspaceID, since).
		Scan(&summary).Error
	if err != nil {
		if isMissingTable(err) {
			// Older envs may not have post_analytics yet — just give post count.
			var count int64
			s.db.WithContext(ctx).Table("posts").
				Where("workspace_id = ? AND status='published' AND published_at >= ? AND deleted_at IS NULL", workspaceID, since).
				Count(&count)
			return toolJSON(map[string]any{
				"posts_published": count,
				"window_days":     args.Days,
				"note":            "Analytics data not yet populated for this workspace.",
			})
		}
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

func isMissingTable(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "does not exist") || strings.Contains(msg, "no such table")
}

func itoa(n int) string {
	return fmt.Sprintf("%d", n)
}
