package queue

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
)

// ─── Task type constants ──────────────────────────────────────────────────────

const (
	TypePublishPost       = "post:publish"
	TypeAIGenerate        = "ai:generate"
	TypeRepurposeContent  = "ai:repurpose"
	TypeRefreshTokens     = "oauth:refresh_tokens"
	TypeSendNotification  = "notification:send"
	TypeCleanupAuditLogs  = "maintenance:cleanup_audit_logs"
	TypeEnqueueDuePosts   = "scheduler:enqueue_due_posts"
	TypeRetryFailedPosts  = "scheduler:retry_failed_posts"
	TypeExpireAIJobs      = "maintenance:expire_ai_jobs"
)

// ─── Publish Post ─────────────────────────────────────────────────────────────

// PublishPostPayload carries the data required for the publish-post task.
type PublishPostPayload struct {
	PostID      uuid.UUID `json:"post_id"`
	WorkspaceID uuid.UUID `json:"workspace_id"`
	// Optional override — when set the task was enqueued manually (PublishNow).
	ForcePublish bool `json:"force_publish,omitempty"`
}

// NewPublishPostTask creates an asynq.Task for publishing a single post.
// maxRetry is the maximum number of attempts before the task is marked failed.
func NewPublishPostTask(payload PublishPostPayload, opts ...asynq.Option) (*asynq.Task, error) {
	b, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("queue: marshal PublishPostPayload: %w", err)
	}
	defaults := []asynq.Option{
		asynq.MaxRetry(3),
		asynq.Timeout(2 * time.Minute),
		asynq.Queue("critical"),
	}
	return asynq.NewTask(TypePublishPost, b, append(defaults, opts...)...), nil
}

// ─── AI Generate ──────────────────────────────────────────────────────────────

// AIJobType enumerates the kinds of AI generation tasks.
type AIJobType string

const (
	AIJobCaption   AIJobType = "caption"
	AIJobHashtags  AIJobType = "hashtags"
	AIJobImage     AIJobType = "image"
	AIJobVideo     AIJobType = "video"
	AIJobCarousel  AIJobType = "carousel"
	AIJobRepurpose AIJobType = "repurpose"
	AIJobAnalyse   AIJobType = "analyse"
)

// AIGeneratePayload carries the data required for the AI generation task.
type AIGeneratePayload struct {
	JobID       uuid.UUID  `json:"job_id"`
	WorkspaceID uuid.UUID  `json:"workspace_id"`
	JobType     AIJobType  `json:"job_type"`
	// Input parameters — interpretation depends on JobType.
	Prompt         string   `json:"prompt,omitempty"`
	Platform       string   `json:"platform,omitempty"`
	Tone           string   `json:"tone,omitempty"`
	TargetAudience string   `json:"target_audience,omitempty"`
	Style          string   `json:"style,omitempty"`
	Niche          string   `json:"niche,omitempty"`
	Content        string   `json:"content,omitempty"`
	SourceURL      string   `json:"source_url,omitempty"`
	Platforms      []string `json:"platforms,omitempty"`
	Slides         int      `json:"slides,omitempty"`
	Duration       int      `json:"duration,omitempty"` // seconds for video
	UserID         uuid.UUID `json:"user_id"`
}

// NewAIGenerateTask creates an asynq.Task for an AI generation job.
func NewAIGenerateTask(payload AIGeneratePayload, opts ...asynq.Option) (*asynq.Task, error) {
	b, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("queue: marshal AIGeneratePayload: %w", err)
	}
	defaults := []asynq.Option{
		asynq.MaxRetry(2),
		asynq.Timeout(5 * time.Minute),
		asynq.Queue("default"),
	}
	return asynq.NewTask(TypeAIGenerate, b, append(defaults, opts...)...), nil
}

// ─── Repurpose Content ────────────────────────────────────────────────────────

// RepurposeSource specifies where the source content comes from.
type RepurposeSource string

const (
	RepurposeSourceURL      RepurposeSource = "url"
	RepurposeSourceYouTube  RepurposeSource = "youtube"
	RepurposeSourcePDF      RepurposeSource = "pdf"
	RepurposeSourcePost     RepurposeSource = "post"
)

// RepurposeContentPayload carries the data required for the repurpose task.
type RepurposeContentPayload struct {
	JobID           uuid.UUID       `json:"job_id"`
	WorkspaceID     uuid.UUID       `json:"workspace_id"`
	UserID          uuid.UUID       `json:"user_id"`
	Source          RepurposeSource `json:"source"`
	SourceURL       string          `json:"source_url,omitempty"`
	YouTubeVideoID  string          `json:"youtube_video_id,omitempty"`
	FilePath        string          `json:"file_path,omitempty"`
	PostContent     string          `json:"post_content,omitempty"`
	FromPlatform    string          `json:"from_platform,omitempty"`
	TargetPlatforms []string        `json:"target_platforms"`
}

// NewRepurposeContentTask creates an asynq.Task for content repurposing.
func NewRepurposeContentTask(payload RepurposeContentPayload, opts ...asynq.Option) (*asynq.Task, error) {
	b, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("queue: marshal RepurposeContentPayload: %w", err)
	}
	defaults := []asynq.Option{
		asynq.MaxRetry(2),
		asynq.Timeout(10 * time.Minute),
		asynq.Queue("default"),
	}
	return asynq.NewTask(TypeRepurposeContent, b, append(defaults, opts...)...), nil
}

// ─── Refresh Tokens ───────────────────────────────────────────────────────────

// RefreshTokensPayload is intentionally empty; the worker queries the DB itself.
type RefreshTokensPayload struct{}

// NewRefreshTokensTask creates an asynq.Task that triggers the OAuth token refresh sweep.
func NewRefreshTokensTask(opts ...asynq.Option) (*asynq.Task, error) {
	b, _ := json.Marshal(RefreshTokensPayload{})
	defaults := []asynq.Option{
		asynq.MaxRetry(1),
		asynq.Timeout(5 * time.Minute),
		asynq.Queue("low"),
	}
	return asynq.NewTask(TypeRefreshTokens, b, append(defaults, opts...)...), nil
}

// ─── Send Notification ────────────────────────────────────────────────────────

// NotificationChannel specifies the delivery channel.
type NotificationChannel string

const (
	ChannelEmail   NotificationChannel = "email"
	ChannelWebhook NotificationChannel = "webhook"
	ChannelInApp   NotificationChannel = "in_app"
)

// SendNotificationPayload carries the data required for the notification task.
type SendNotificationPayload struct {
	WorkspaceID uuid.UUID           `json:"workspace_id"`
	UserID      uuid.UUID           `json:"user_id"`
	Channel     NotificationChannel `json:"channel"`
	Subject     string              `json:"subject"`
	Body        string              `json:"body"`
	TemplateID  string              `json:"template_id,omitempty"`
	Data        map[string]string   `json:"data,omitempty"`
}

// NewSendNotificationTask creates an asynq.Task for sending a notification.
func NewSendNotificationTask(payload SendNotificationPayload, opts ...asynq.Option) (*asynq.Task, error) {
	b, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("queue: marshal SendNotificationPayload: %w", err)
	}
	defaults := []asynq.Option{
		asynq.MaxRetry(3),
		asynq.Timeout(30 * time.Second),
		asynq.Queue("low"),
	}
	return asynq.NewTask(TypeSendNotification, b, append(defaults, opts...)...), nil
}
