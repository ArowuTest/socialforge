package queue

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/models"
)

// ─── Publisher interface ──────────────────────────────────────────────────────

// Publisher is the interface each platform-specific publisher must implement.
type Publisher interface {
	PublishPost(ctx context.Context, post *models.Post, account *models.SocialAccount) (externalID string, externalURL string, err error)
}

// ─── AIService interface ──────────────────────────────────────────────────────

// AIService is the interface the queue worker uses to invoke AI jobs.
type AIService interface {
	ProcessJob(ctx context.Context, payload interface{}) (map[string]interface{}, error)
}

// RepurposeService is the interface the queue worker uses for repurposing.
type RepurposeService interface {
	ProcessRepurpose(ctx context.Context, payload RepurposeContentPayload) (map[string]interface{}, error)
}

// ─── OAuthRefresher interface ─────────────────────────────────────────────────

// OAuthRefresher refreshes a single social account's access token in-place.
type OAuthRefresher interface {
	RefreshToken(ctx context.Context, account *models.SocialAccount) error
}

// ─── NotificationSender interface ────────────────────────────────────────────

// NotificationSender delivers transactional notifications.
type NotificationSender interface {
	SendRaw(ctx context.Context, to, subject, htmlBody string) error
}

// ─── CampaignOrchestrator interface ──────────────────────────────────────────

// CampaignOrchestrator handles AI-driven campaign and post generation.
type CampaignOrchestrator interface {
	GenerateCampaign(ctx context.Context, campaignID, workspaceID uuid.UUID) error
	GenerateCampaignPost(ctx context.Context, campaignPostID, campaignID, workspaceID uuid.UUID) error
}

// ─── WorkerDeps ───────────────────────────────────────────────────────────────

// WorkerDeps bundles all dependencies needed by the queue handlers.
type WorkerDeps struct {
	DB                    *gorm.DB
	Logger                *zap.Logger
	Publisher             Publisher
	AIService             AIService
	RepurposeService      RepurposeService
	OAuthRefresher        OAuthRefresher
	NotificationSender    NotificationSender
	CampaignOrchestrator  CampaignOrchestrator
	// AsynqClient is used by handlers that need to enqueue follow-up tasks
	// (e.g. automation actions, delayed republishing). Optional: handlers guard
	// nil before use so the server still starts without it.
	AsynqClient *asynq.Client
}

// ─── PublishPostHandler ───────────────────────────────────────────────────────

type PublishPostHandler struct {
	deps WorkerDeps
}

func (h *PublishPostHandler) ProcessTask(ctx context.Context, t *asynq.Task) error {
	var p PublishPostPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("publishPostHandler: unmarshal payload: %w", err)
	}

	log := h.deps.Logger.With(
		zap.String("post_id", p.PostID.String()),
		zap.String("workspace_id", p.WorkspaceID.String()),
	)
	log.Info("publishing post")

	// Fetch post. No Preload needed — the publisher resolves social accounts
	// via PostPlatforms internally.
	var post models.Post
	if err := h.deps.DB.WithContext(ctx).
		First(&post, "id = ? AND workspace_id = ?", p.PostID, p.WorkspaceID).Error; err != nil {
		return fmt.Errorf("publishPostHandler: fetch post %s: %w", p.PostID, err)
	}

	// Guard: skip if already published or cancelled.
	if post.Status == "published" || post.Status == "cancelled" {
		log.Info("post already in terminal state, skipping", zap.String("status", string(post.Status)))
		return nil
	}

	// Mark as publishing.
	if err := h.deps.DB.WithContext(ctx).Model(&post).
		Updates(map[string]interface{}{"status": "publishing"}).Error; err != nil {
		return fmt.Errorf("publishPostHandler: set status publishing: %w", err)
	}

	// Call platform publisher with no social account (account lookup via PostPlatforms).
	externalID, externalURL, err := h.deps.Publisher.PublishPost(ctx, &post, nil)
	if err != nil {
		log.Error("platform publish failed", zap.Error(err))
		return h.failPost(ctx, &post, err.Error())
	}

	// Mark as published.
	now := time.Now().UTC()
	if err := h.deps.DB.WithContext(ctx).Model(&post).Updates(map[string]interface{}{
		"status":       "published",
		"published_at": now,
		"external_id":  externalID,
		"external_url": externalURL,
		"failure_reason": "",
	}).Error; err != nil {
		return fmt.Errorf("publishPostHandler: set status published: %w", err)
	}

	// Sync CampaignPost status → published (if this post was launched from a campaign).
	h.deps.DB.WithContext(ctx).
		Table("campaign_posts").
		Where("post_id = ?", post.ID).
		Updates(map[string]interface{}{"status": "published", "updated_at": now})

	// Fire post_published automations for this workspace.
	h.dispatchAutomations(ctx, post.WorkspaceID, models.TriggerPostPublished, map[string]interface{}{
		"post_id":      post.ID.String(),
		"platforms":    []string(post.Platforms),
		"content":      post.Content,
		"title":        post.Title,
		"external_url": externalURL,
		"external_id":  externalID,
	})

	log.Info("post published successfully",
		zap.String("external_id", externalID),
		zap.String("external_url", externalURL),
	)
	return nil
}

// dispatchAutomations finds all enabled automations matching the given trigger
// for the workspace and enqueues a RunAutomationTask for each. Errors are logged
// but never returned — automation dispatch must not block the main publish flow.
func (h *PublishPostHandler) dispatchAutomations(
	ctx context.Context,
	workspaceID uuid.UUID,
	trigger models.AutomationTriggerType,
	triggerData map[string]interface{},
) {
	if h.deps.AsynqClient == nil {
		return
	}
	var automations []models.Automation
	if err := h.deps.DB.WithContext(ctx).
		Where("workspace_id = ? AND trigger_type = ? AND is_enabled = true", workspaceID, trigger).
		Find(&automations).Error; err != nil {
		h.deps.Logger.Warn("dispatchAutomations: query failed",
			zap.String("trigger", string(trigger)),
			zap.Error(err),
		)
		return
	}
	for _, a := range automations {
		payload := RunAutomationPayload{
			AutomationID: a.ID,
			WorkspaceID:  a.WorkspaceID,
			TriggerData:  triggerData,
		}
		task, err := NewRunAutomationTask(payload)
		if err != nil {
			h.deps.Logger.Error("dispatchAutomations: create task", zap.Error(err))
			continue
		}
		if _, err := h.deps.AsynqClient.EnqueueContext(ctx, task, asynq.Queue("default")); err != nil {
			h.deps.Logger.Error("dispatchAutomations: enqueue",
				zap.String("automation_id", a.ID.String()),
				zap.Error(err),
			)
		} else {
			h.deps.Logger.Info("dispatchAutomations: automation queued",
				zap.String("automation_id", a.ID.String()),
				zap.String("trigger", string(trigger)),
			)
		}
	}
}

// failPost marks a post as failed and returns the original error wrapped so asynq
// can decide whether to retry.
func (h *PublishPostHandler) failPost(ctx context.Context, post *models.Post, reason string) error {
	retryCount := post.RetryCount + 1
	if err := h.deps.DB.WithContext(ctx).Model(post).Updates(map[string]interface{}{
		"status":         "failed",
		"failure_reason": reason,
		"retry_count":    retryCount,
	}).Error; err != nil {
		h.deps.Logger.Error("publishPostHandler: failed to mark post as failed",
			zap.String("post_id", post.ID.String()),
			zap.Error(err),
		)
	}

	// Sync CampaignPost status → failed (if this post was launched from a campaign).
	h.deps.DB.WithContext(ctx).
		Table("campaign_posts").
		Where("post_id = ?", post.ID).
		Updates(map[string]interface{}{"status": "failed", "updated_at": time.Now().UTC()})

	// Fire post_failed automations for this workspace.
	h.dispatchAutomations(ctx, post.WorkspaceID, models.TriggerPostFailed, map[string]interface{}{
		"post_id":   post.ID.String(),
		"platforms": []string(post.Platforms),
		"content":   post.Content,
		"title":     post.Title,
		"error":     reason,
	})

	return fmt.Errorf("publishPostHandler: %s", reason)
}

// ─── AIGenerateHandler ────────────────────────────────────────────────────────

type AIGenerateHandler struct {
	deps WorkerDeps
}

func (h *AIGenerateHandler) ProcessTask(ctx context.Context, t *asynq.Task) error {
	var p AIGeneratePayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("aiGenerateHandler: unmarshal payload: %w", err)
	}

	log := h.deps.Logger.With(
		zap.String("job_id", p.JobID.String()),
		zap.String("job_type", string(p.JobType)),
	)
	log.Info("processing AI job")

	// Mark job as processing.
	if err := h.deps.DB.WithContext(ctx).Model(&models.AIJob{}).
		Where("id = ?", p.JobID).
		Updates(map[string]interface{}{"status": "processing"}).Error; err != nil {
		log.Warn("failed to mark AI job processing", zap.Error(err))
	}

	// Call the AI service.
	output, err := h.deps.AIService.ProcessJob(ctx, p)
	now := time.Now().UTC()
	if err != nil {
		log.Error("AI job failed", zap.Error(err))
		h.deps.DB.WithContext(ctx).Model(&models.AIJob{}).Where("id = ?", p.JobID).
			Updates(map[string]interface{}{
				"status":        "failed",
				"error_message": err.Error(),
				"completed_at":  now,
			})
		return fmt.Errorf("aiGenerateHandler: %w", err)
	}

	// Persist output.
	if err := h.deps.DB.WithContext(ctx).Model(&models.AIJob{}).Where("id = ?", p.JobID).
		Updates(map[string]interface{}{
			"status":       "completed",
			"output":       models.JSONMap(output),
			"completed_at": now,
		}).Error; err != nil {
		return fmt.Errorf("aiGenerateHandler: persist output: %w", err)
	}

	log.Info("AI job completed")
	return nil
}

// ─── RepurposeHandler ─────────────────────────────────────────────────────────

type RepurposeHandler struct {
	deps WorkerDeps
}

func (h *RepurposeHandler) ProcessTask(ctx context.Context, t *asynq.Task) error {
	var p RepurposeContentPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("repurposeHandler: unmarshal payload: %w", err)
	}

	log := h.deps.Logger.With(
		zap.String("job_id", p.JobID.String()),
		zap.String("source", string(p.Source)),
	)
	log.Info("processing repurpose job")

	// Mark job as processing.
	if err := h.deps.DB.WithContext(ctx).Model(&models.AIJob{}).Where("id = ?", p.JobID).
		Updates(map[string]interface{}{"status": "processing"}).Error; err != nil {
		log.Warn("failed to mark repurpose job as processing", zap.Error(err))
	}

	output, err := h.deps.RepurposeService.ProcessRepurpose(ctx, p)
	now := time.Now().UTC()
	if err != nil {
		log.Error("repurpose job failed", zap.Error(err))
		h.deps.DB.WithContext(ctx).Model(&models.AIJob{}).Where("id = ?", p.JobID).
			Updates(map[string]interface{}{
				"status":        "failed",
				"error_message": err.Error(),
				"completed_at":  now,
			})
		return fmt.Errorf("repurposeHandler: %w", err)
	}

	if err := h.deps.DB.WithContext(ctx).Model(&models.AIJob{}).Where("id = ?", p.JobID).
		Updates(map[string]interface{}{
			"status":       "completed",
			"output":       models.JSONMap(output),
			"completed_at": now,
		}).Error; err != nil {
		return fmt.Errorf("repurposeHandler: persist output: %w", err)
	}

	log.Info("repurpose job completed")
	return nil
}

// ─── SendNotificationHandler ──────────────────────────────────────────────────

type SendNotificationHandler struct {
	deps WorkerDeps
}

func (h *SendNotificationHandler) ProcessTask(ctx context.Context, t *asynq.Task) error {
	var p SendNotificationPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("sendNotificationHandler: unmarshal payload: %w", err)
	}

	log := h.deps.Logger.With(
		zap.String("user_id", p.UserID.String()),
		zap.String("channel", string(p.Channel)),
	)
	log.Info("processing notification task")

	switch p.Channel {
	case ChannelEmail:
		if h.deps.NotificationSender == nil {
			log.Warn("notification sender not configured, skipping email")
			return nil
		}
		// Resolve the user's email address from the DB.
		var row struct {
			Email string `gorm:"column:email"`
		}
		if err := h.deps.DB.WithContext(ctx).Table("users").
			Select("email").Where("id = ?", p.UserID).First(&row).Error; err != nil {
			return fmt.Errorf("sendNotificationHandler: lookup user email: %w", err)
		}
		if err := h.deps.NotificationSender.SendRaw(ctx, row.Email, p.Subject, p.Body); err != nil {
			return fmt.Errorf("sendNotificationHandler: send email: %w", err)
		}
		log.Info("notification email sent", zap.String("to", row.Email))
	case ChannelInApp:
		// Persist to the notifications table so the frontend bell can display it.
		notif := models.Notification{
			WorkspaceID: p.WorkspaceID,
			UserID:      p.UserID,
			Title:       p.Subject,
			Body:        p.Body,
		}
		if err := h.deps.DB.WithContext(ctx).Create(&notif).Error; err != nil {
			return fmt.Errorf("sendNotificationHandler: create in-app notification: %w", err)
		}
		log.Info("in-app notification stored", zap.String("notification_id", notif.ID.String()))

	case ChannelWebhook:
		// POST the notification payload to the user-configured webhook URL.
		// action_config (passed through Data map) carries: url, secret (optional).
		webhookURL, _ := p.Data["url"]
		if webhookURL == "" {
			log.Warn("webhook notification: no url configured, skipping")
			break
		}

		body := map[string]interface{}{
			"event":        "notification",
			"workspace_id": p.WorkspaceID.String(),
			"subject":      p.Subject,
			"body":         p.Body,
			"sent_at":      time.Now().UTC().Format(time.RFC3339),
		}
		bodyBytes, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("sendNotificationHandler: marshal webhook body: %w", err)
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhookURL, bytes.NewReader(bodyBytes))
		if err != nil {
			return fmt.Errorf("sendNotificationHandler: build webhook request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("User-Agent", "SocialForge-Webhook/1.0")

		// Sign the payload with HMAC-SHA256 when a secret is supplied.
		if secret, ok := p.Data["secret"]; ok && secret != "" {
			mac := hmac.New(sha256.New, []byte(secret))
			mac.Write(bodyBytes)
			sig := hex.EncodeToString(mac.Sum(nil))
			req.Header.Set("X-SocialForge-Signature", "sha256="+sig)
		}

		webhookClient := &http.Client{Timeout: 10 * time.Second}
		resp, err := webhookClient.Do(req)
		if err != nil {
			return fmt.Errorf("sendNotificationHandler: webhook delivery to %s: %w", webhookURL, err)
		}
		resp.Body.Close()

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return fmt.Errorf("sendNotificationHandler: webhook %s returned status %d", webhookURL, resp.StatusCode)
		}
		log.Info("webhook notification delivered",
			zap.String("url", webhookURL),
			zap.Int("status", resp.StatusCode),
		)
	default:
		log.Warn("unknown notification channel, skipping", zap.String("channel", string(p.Channel)))
	}
	return nil
}

// ─── RefreshTokensHandler ─────────────────────────────────────────────────────

type RefreshTokensHandler struct {
	deps WorkerDeps
}

func (h *RefreshTokensHandler) ProcessTask(ctx context.Context, _ *asynq.Task) error {
	log := h.deps.Logger.With(zap.String("handler", "RefreshTokens"))
	log.Info("starting token refresh sweep")

	// Find accounts whose tokens expire within the next 24 hours.
	horizon := time.Now().UTC().Add(24 * time.Hour)
	var accounts []models.SocialAccount
	if err := h.deps.DB.WithContext(ctx).
		Where("token_expires_at <= ? AND is_active = true AND refresh_token != ''", horizon).
		Find(&accounts).Error; err != nil {
		return fmt.Errorf("refreshTokensHandler: query accounts: %w", err)
	}

	log.Info("accounts needing token refresh", zap.Int("count", len(accounts)))
	var refreshErrors int
	for i := range accounts {
		acc := &accounts[i]
		if err := h.deps.OAuthRefresher.RefreshToken(ctx, acc); err != nil {
			log.Error("failed to refresh token",
				zap.String("account_id", acc.ID.String()),
				zap.String("platform", string(acc.Platform)),
				zap.Error(err),
			)
			refreshErrors++
			// Mark account as needing re-auth.
			h.deps.DB.WithContext(ctx).Model(acc).Updates(map[string]interface{}{"is_active": false})
			continue
		}
		// Persist refreshed tokens.
		if err := h.deps.DB.WithContext(ctx).Save(acc).Error; err != nil {
			log.Error("failed to save refreshed token",
				zap.String("account_id", acc.ID.String()),
				zap.Error(err),
			)
		}
	}

	if refreshErrors > 0 {
		log.Warn("token refresh sweep completed with errors",
			zap.Int("errors", refreshErrors),
			zap.Int("total", len(accounts)),
		)
	} else {
		log.Info("token refresh sweep completed successfully", zap.Int("total", len(accounts)))
	}
	return nil
}

// buildAutomationNotificationBody constructs a human-readable notification body
// for the send_notification automation action. It prefers a custom message from
// action_config, falling back to a contextual summary derived from trigger_data.
func buildAutomationNotificationBody(automationName string, actionConfig models.JSONMap, triggerData map[string]interface{}) string {
	// Prefer a user-supplied message.
	if msg, ok := actionConfig["message"].(string); ok && msg != "" {
		return msg
	}

	body := fmt.Sprintf("Your automation \"%s\" was triggered.\n\n", automationName)

	if postID, ok := triggerData["post_id"].(string); ok && postID != "" {
		body += fmt.Sprintf("Post ID: %s\n", postID)
	}
	if title, ok := triggerData["title"].(string); ok && title != "" {
		body += fmt.Sprintf("Title: %s\n", title)
	}
	if platforms, ok := triggerData["platforms"].([]interface{}); ok && len(platforms) > 0 {
		var pNames []string
		for _, p := range platforms {
			if s, ok := p.(string); ok {
				pNames = append(pNames, s)
			}
		}
		if len(pNames) > 0 {
			body += fmt.Sprintf("Platforms: %s\n", joinStrings(pNames, ", "))
		}
	}
	if url, ok := triggerData["external_url"].(string); ok && url != "" {
		body += fmt.Sprintf("Published URL: %s\n", url)
	}
	if errMsg, ok := triggerData["error"].(string); ok && errMsg != "" {
		body += fmt.Sprintf("\nFailure reason: %s\n", errMsg)
	}

	return body
}

// joinStrings is a minimal strings.Join alternative that avoids an import just
// for one call inside this file (strings is already included in some builds).
func joinStrings(parts []string, sep string) string {
	result := ""
	for i, p := range parts {
		if i > 0 {
			result += sep
		}
		result += p
	}
	return result
}

// ─── RunAutomationHandler ─────────────────────────────────────────────────────

type RunAutomationHandler struct {
	deps WorkerDeps
}

func (h *RunAutomationHandler) ProcessTask(ctx context.Context, t *asynq.Task) error {
	var p RunAutomationPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("runAutomationHandler: unmarshal payload: %w", err)
	}

	log := h.deps.Logger.With(
		zap.String("automation_id", p.AutomationID.String()),
		zap.String("workspace_id", p.WorkspaceID.String()),
	)
	log.Info("running automation")

	// Load automation from DB.
	var automation models.Automation
	if err := h.deps.DB.WithContext(ctx).
		First(&automation, "id = ? AND workspace_id = ?", p.AutomationID, p.WorkspaceID).Error; err != nil {
		return fmt.Errorf("runAutomationHandler: fetch automation %s: %w", p.AutomationID, err)
	}

	if !automation.IsEnabled {
		log.Info("automation is disabled, skipping")
		return nil
	}

	// Execute the action based on action_type.
	var actionErr error
	switch automation.ActionType {

	// ── send_notification ────────────────────────────────────────────────────
	// Delivers an email (or in-app) notification to the automation creator.
	// action_config keys:
	//   channel  : "email" | "in_app" | "webhook"  (default: "email")
	//   subject  : custom subject line (optional)
	//   message  : custom body text    (optional)
	//   url      : webhook target URL  (required for channel=webhook)
	//   secret   : HMAC-SHA256 signing secret (optional, for channel=webhook)
	case models.ActionSendNotification:
		channel := ChannelEmail
		if ch, ok := automation.ActionConfig["channel"].(string); ok && ch != "" {
			channel = NotificationChannel(ch)
		}
		subject := "Automation triggered: " + automation.Name
		if s, ok := automation.ActionConfig["subject"].(string); ok && s != "" {
			subject = s
		}
		body := buildAutomationNotificationBody(automation.Name, automation.ActionConfig, p.TriggerData)

		// For webhook channel, pass url + secret via the Data map.
		var extraData map[string]string
		if channel == ChannelWebhook {
			extraData = make(map[string]string)
			if u, ok := automation.ActionConfig["url"].(string); ok {
				extraData["url"] = u
			}
			if s, ok := automation.ActionConfig["secret"].(string); ok {
				extraData["secret"] = s
			}
		}

		notifPayload := SendNotificationPayload{
			WorkspaceID: automation.WorkspaceID,
			UserID:      automation.CreatedBy,
			Channel:     channel,
			Subject:     subject,
			Body:        body,
			Data:        extraData,
		}
		task, err := NewSendNotificationTask(notifPayload)
		if err != nil {
			actionErr = fmt.Errorf("send_notification: create task: %w", err)
			break
		}
		if h.deps.AsynqClient == nil {
			log.Warn("send_notification: no asynq client configured, skipping")
			break
		}
		if _, err := h.deps.AsynqClient.EnqueueContext(ctx, task, asynq.Queue("low")); err != nil {
			actionErr = fmt.Errorf("send_notification: enqueue: %w", err)
		} else {
			log.Info("send_notification: notification enqueued",
				zap.String("channel", string(channel)),
				zap.String("subject", subject),
			)
		}

	// ── auto_repurpose ───────────────────────────────────────────────────────
	// Repurposes the triggering post's content across target platforms via AI.
	// action_config keys:
	//   target_platforms : ["twitter","linkedin","instagram",…]
	// trigger_data keys (set by publish handler):
	//   post_id          : UUID of the published post
	//   content          : caption / body of the post
	case models.ActionAutoRepurpose:
		postIDStr, _ := p.TriggerData["post_id"].(string)
		postID, err := uuid.Parse(postIDStr)
		if err != nil {
			actionErr = fmt.Errorf("auto_repurpose: invalid post_id %q: %w", postIDStr, err)
			break
		}

		var post models.Post
		if err := h.deps.DB.WithContext(ctx).
			First(&post, "id = ? AND workspace_id = ?", postID, automation.WorkspaceID).Error; err != nil {
			actionErr = fmt.Errorf("auto_repurpose: load post %s: %w", postID, err)
			break
		}

		// Resolve target platforms from action_config.
		var targetPlatforms []string
		if tp, ok := automation.ActionConfig["target_platforms"]; ok {
			switch v := tp.(type) {
			case []interface{}:
				for _, item := range v {
					if s, ok := item.(string); ok && s != "" {
						targetPlatforms = append(targetPlatforms, s)
					}
				}
			case []string:
				targetPlatforms = append(targetPlatforms, v...)
			}
		}
		if len(targetPlatforms) == 0 {
			// Default: repurpose to all major text platforms.
			targetPlatforms = []string{"twitter", "linkedin", "instagram", "facebook", "threads"}
		}
		// Remove the source platform to avoid identical repurposing.
		fromPlatform := ""
		if len(post.Platforms) > 0 {
			fromPlatform = string(post.Platforms[0])
			filtered := targetPlatforms[:0]
			for _, tp := range targetPlatforms {
				if tp != fromPlatform {
					filtered = append(filtered, tp)
				}
			}
			targetPlatforms = filtered
		}
		if len(targetPlatforms) == 0 {
			log.Info("auto_repurpose: no target platforms after removing source, skipping")
			break
		}

		// Create an AIJob record for tracking.
		aiJob := models.AIJob{
			WorkspaceID:   automation.WorkspaceID,
			JobType:       models.AIJobRepurposeContent,
			Status:        models.AIJobStatusPending,
			RequestedByID: automation.CreatedBy,
			InputData: models.JSONMap{
				"prompt": fmt.Sprintf("Auto-repurpose via automation '%s'", automation.Name),
			},
		}
		if err := h.deps.DB.WithContext(ctx).Create(&aiJob).Error; err != nil {
			actionErr = fmt.Errorf("auto_repurpose: create ai_job: %w", err)
			break
		}

		repurposePayload := RepurposeContentPayload{
			JobID:           aiJob.ID,
			WorkspaceID:     automation.WorkspaceID,
			UserID:          automation.CreatedBy,
			Source:          RepurposeSourcePost,
			PostContent:     post.Content,
			FromPlatform:    fromPlatform,
			TargetPlatforms: targetPlatforms,
		}
		task, err := NewRepurposeContentTask(repurposePayload)
		if err != nil {
			actionErr = fmt.Errorf("auto_repurpose: create task: %w", err)
			break
		}
		if h.deps.AsynqClient == nil {
			log.Warn("auto_repurpose: no asynq client configured, skipping")
			break
		}
		if _, err := h.deps.AsynqClient.EnqueueContext(ctx, task, asynq.Queue("default")); err != nil {
			actionErr = fmt.Errorf("auto_repurpose: enqueue: %w", err)
		} else {
			log.Info("auto_repurpose: repurpose task enqueued",
				zap.String("ai_job_id", aiJob.ID.String()),
				zap.Strings("target_platforms", targetPlatforms),
			)
		}

	// ── republish_after_delay ────────────────────────────────────────────────
	// Clones the triggering post and schedules it to publish again after a delay.
	// action_config keys:
	//   delay_hours : int (default 24)
	// trigger_data keys (set by publish handler):
	//   post_id     : UUID of the published post
	case models.ActionRepublishAfterDelay:
		delayHours := 24
		if d, ok := automation.ActionConfig["delay_hours"]; ok {
			switch v := d.(type) {
			case float64:
				delayHours = int(v)
			case int:
				delayHours = v
			}
		}

		postIDStr, _ := p.TriggerData["post_id"].(string)
		postID, err := uuid.Parse(postIDStr)
		if err != nil {
			actionErr = fmt.Errorf("republish_after_delay: invalid post_id %q: %w", postIDStr, err)
			break
		}

		var origPost models.Post
		if err := h.deps.DB.WithContext(ctx).
			First(&origPost, "id = ? AND workspace_id = ?", postID, automation.WorkspaceID).Error; err != nil {
			actionErr = fmt.Errorf("republish_after_delay: load post %s: %w", postID, err)
			break
		}

		delay := time.Duration(delayHours) * time.Hour
		scheduledAt := time.Now().UTC().Add(delay)

		// Clone the original post. The scheduler will pick it up when scheduled_at
		// elapses; we also enqueue with ProcessAt so it fires even if the scheduler
		// misses a tick.
		clonedPost := models.Post{
			WorkspaceID: origPost.WorkspaceID,
			AuthorID:    origPost.AuthorID,
			Content:     origPost.Content,
			Title:       origPost.Title,
			Type:        origPost.Type,
			Status:      "scheduled",
			Platforms:   origPost.Platforms,
			MediaURLs:   origPost.MediaURLs,
			Hashtags:    origPost.Hashtags,
			AIGenerated: origPost.AIGenerated,
		}
		clonedPost.ScheduledAt = &scheduledAt
		if err := h.deps.DB.WithContext(ctx).Create(&clonedPost).Error; err != nil {
			actionErr = fmt.Errorf("republish_after_delay: create cloned post: %w", err)
			break
		}

		task, err := NewPublishPostTask(PublishPostPayload{
			PostID:      clonedPost.ID,
			WorkspaceID: clonedPost.WorkspaceID,
		}, asynq.ProcessAt(scheduledAt))
		if err != nil {
			actionErr = fmt.Errorf("republish_after_delay: create publish task: %w", err)
			break
		}
		if h.deps.AsynqClient == nil {
			log.Warn("republish_after_delay: no asynq client configured; post created but task not enqueued — scheduler will pick it up")
			break
		}
		if _, err := h.deps.AsynqClient.EnqueueContext(ctx, task,
			asynq.Queue("critical"),
			asynq.ProcessAt(scheduledAt),
		); err != nil {
			// Task enqueue failure is non-fatal — the 1-minute scheduler sweep
			// will pick up the cloned post via handleEnqueueDuePosts.
			log.Warn("republish_after_delay: enqueue task (scheduler fallback active)",
				zap.String("post_id", clonedPost.ID.String()),
				zap.Error(err),
			)
		} else {
			log.Info("republish_after_delay: post cloned and scheduled",
				zap.String("cloned_post_id", clonedPost.ID.String()),
				zap.Int("delay_hours", delayHours),
				zap.Time("scheduled_at", scheduledAt),
			)
		}

	default:
		log.Warn("unknown action type", zap.String("action_type", string(automation.ActionType)))
	}

	if actionErr != nil {
		log.Error("automation action failed", zap.Error(actionErr))
		// Return the error so asynq can retry (up to MaxRetry).
		return fmt.Errorf("runAutomationHandler: %w", actionErr)
	}

	// Update last_triggered_at and increment run_count.
	now := time.Now().UTC()
	if err := h.deps.DB.WithContext(ctx).Model(&automation).Updates(map[string]interface{}{
		"last_triggered_at": now,
		"run_count":         automation.RunCount + 1,
	}).Error; err != nil {
		log.Error("failed to update automation run metadata", zap.Error(err))
	}

	log.Info("automation executed", zap.String("action_type", string(automation.ActionType)))
	return nil
}

// ─── NewServer ────────────────────────────────────────────────────────────────

// ServerConfig holds asynq server tuning parameters.
type ServerConfig struct {
	Concurrency int
	// Queues maps queue name → priority weight.
	Queues map[string]int
}

// DefaultServerConfig returns sensible production defaults.
func DefaultServerConfig() ServerConfig {
	return ServerConfig{
		Concurrency: 5, // keep CPU/memory low on free tier; raise when scaling
		Queues: map[string]int{
			"critical": 6,
			"default":  3,
			"low":      1,
		},
	}
}

// NewServer creates an asynq.Server wired to Redis and registers all task
// handlers. It does NOT call Run(); the caller is responsible for lifecycle.
func NewServer(redisClient *redis.Client, deps WorkerDeps, cfg ServerConfig) (*asynq.Server, *asynq.ServeMux) {
	srv := asynq.NewServer(
		asynq.RedisClientOpt{
			Addr:      redisClient.Options().Addr,
			Password:  redisClient.Options().Password,
			DB:        redisClient.Options().DB,
			TLSConfig: redisClient.Options().TLSConfig, // required for rediss:// (Upstash)
		},
		asynq.Config{
			Concurrency: cfg.Concurrency,
			Queues:      cfg.Queues,
			ErrorHandler: asynq.ErrorHandlerFunc(func(ctx context.Context, task *asynq.Task, err error) {
				deps.Logger.Error("task failed permanently",
					zap.String("type", task.Type()),
					zap.Error(err),
				)
			}),
			Logger: newAsynqZapLogger(deps.Logger),
		},
	)

	mux := asynq.NewServeMux()

	publishHandler := &PublishPostHandler{deps: deps}
	aiGenHandler := &AIGenerateHandler{deps: deps}
	repurposeHandler := &RepurposeHandler{deps: deps}
	refreshHandler := &RefreshTokensHandler{deps: deps}
	notifHandler := &SendNotificationHandler{deps: deps}
	automationHandler := &RunAutomationHandler{deps: deps}

	mux.HandleFunc(TypePublishPost, publishHandler.ProcessTask)
	mux.HandleFunc(TypeAIGenerate, aiGenHandler.ProcessTask)
	mux.HandleFunc(TypeRepurposeContent, repurposeHandler.ProcessTask)
	mux.HandleFunc(TypeRefreshTokens, refreshHandler.ProcessTask)
	mux.HandleFunc(TypeSendNotification, notifHandler.ProcessTask)
	mux.HandleFunc(TypeRunAutomation, automationHandler.ProcessTask)

	mux.HandleFunc(TypeGenerateCampaign, func(ctx context.Context, t *asynq.Task) error {
		if deps.CampaignOrchestrator == nil {
			deps.Logger.Warn("TypeGenerateCampaign: campaign orchestrator not configured")
			return nil
		}
		var p GenerateCampaignPayload
		if err := json.Unmarshal(t.Payload(), &p); err != nil {
			return fmt.Errorf("TypeGenerateCampaign: unmarshal payload: %w", err)
		}
		return deps.CampaignOrchestrator.GenerateCampaign(ctx, p.CampaignID, p.WorkspaceID)
	})
	mux.HandleFunc(TypeGenerateCampaignPost, func(ctx context.Context, t *asynq.Task) error {
		if deps.CampaignOrchestrator == nil {
			deps.Logger.Warn("TypeGenerateCampaignPost: campaign orchestrator not configured")
			return nil
		}
		var p GenerateCampaignPostPayload
		if err := json.Unmarshal(t.Payload(), &p); err != nil {
			return fmt.Errorf("TypeGenerateCampaignPost: unmarshal payload: %w", err)
		}
		return deps.CampaignOrchestrator.GenerateCampaignPost(ctx, p.CampaignPostID, p.CampaignID, p.WorkspaceID)
	})

	return srv, mux
}

// ─── asynq → zap logger adapter ──────────────────────────────────────────────

type asynqZapLogger struct {
	log *zap.Logger
}

func newAsynqZapLogger(log *zap.Logger) *asynqZapLogger {
	return &asynqZapLogger{log: log.With(zap.String("component", "asynq"))}
}

func (l *asynqZapLogger) Debug(args ...interface{}) {
	l.log.Sugar().Debug(args...)
}
func (l *asynqZapLogger) Info(args ...interface{}) {
	l.log.Sugar().Info(args...)
}
func (l *asynqZapLogger) Warn(args ...interface{}) {
	l.log.Sugar().Warn(args...)
}
func (l *asynqZapLogger) Error(args ...interface{}) {
	l.log.Sugar().Error(args...)
}
func (l *asynqZapLogger) Fatal(args ...interface{}) {
	l.log.Sugar().Fatal(args...)
}
