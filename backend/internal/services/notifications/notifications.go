// Package notifications delivers transactional emails via the Resend API using
// plain net/http calls (Resend has no official Go SDK).
package notifications

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"go.uber.org/zap"

	"github.com/socialforge/backend/internal/config"
	"github.com/socialforge/backend/internal/models"
)

const resendEndpoint = "https://api.resend.com/emails"

// ─── EmailPayload ─────────────────────────────────────────────────────────────

// EmailPayload is the JSON body sent to the Resend API.
type EmailPayload struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	Html    string   `json:"html"`
}

// ─── Service ──────────────────────────────────────────────────────────────────

// Service sends transactional email notifications via Resend.
type Service struct {
	apiKey    string
	fromEmail string
	appName   string
	appURL    string
	client    *http.Client
	log       *zap.Logger
}

// NewService constructs a notification Service from the supplied config.
func NewService(cfg *config.Config, log *zap.Logger) *Service {
	return &Service{
		apiKey:    cfg.Notifications.Resend.APIKey,
		fromEmail: cfg.Notifications.Resend.FromEmail,
		appName:   cfg.Notifications.AppName,
		appURL:    cfg.Notifications.AppURL,
		client:    &http.Client{Timeout: 15 * time.Second},
		log:       log.Named("notifications"),
	}
}

// ─── send ─────────────────────────────────────────────────────────────────────

// send POSTs a single email via the Resend API.
func (s *Service) send(ctx context.Context, to, subject, htmlBody string) error {
	payload := EmailPayload{
		From:    fmt.Sprintf("%s <%s>", s.appName, s.fromEmail),
		To:      []string{to},
		Subject: subject,
		Html:    htmlBody,
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal resend payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, resendEndpoint, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("build resend request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		s.log.Error("resend http error",
			zap.String("to", to),
			zap.String("subject", subject),
			zap.Error(err),
		)
		return fmt.Errorf("resend http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		s.log.Error("resend api error",
			zap.Int("status", resp.StatusCode),
			zap.String("body", string(body)),
			zap.String("to", to),
			zap.String("subject", subject),
		)
		return fmt.Errorf("resend api returned status %d", resp.StatusCode)
	}

	s.log.Info("email sent",
		zap.String("to", to),
		zap.String("subject", subject),
	)
	return nil
}

// ─── SendWelcome ──────────────────────────────────────────────────────────────

// SendWelcome sends a welcome email to a newly registered user.
func (s *Service) SendWelcome(ctx context.Context, user *models.User, workspace *models.Workspace) error {
	calendarURL := s.appURL + "/calendar"
	subject := fmt.Sprintf("Welcome to %s \u2014 let's grow your audience \U0001f680", s.appName)
	preheader := "Your workspace is ready — start scheduling posts today."

	body := fmt.Sprintf(`
<h1 %s>Welcome to %s, %s!</h1>
<p %s>We're thrilled to have you on board. Your workspace <strong>%s</strong> is ready and waiting.</p>
<p %s>Here's what you can do right now:</p>
<ul style="margin:0 0 16px;padding-left:20px;color:#374151;font-size:15px;line-height:2;">
  <li>Schedule posts to 8 platforms simultaneously</li>
  <li>Generate AI content, captions, and hashtags in seconds</li>
  <li>Track analytics and engagement across all platforms</li>
  <li>Build your agency with client workspaces and white-labelling</li>
</ul>
<p %s>Ready to get started?</p>`,
		h1Style, s.appName, user.Name,
		pStyle,
		workspace.Name,
		pStyle,
		pStyle,
	)

	html := baseTemplate(s.appName, s.appURL, subject, preheader, body, calendarURL, "Open Dashboard")
	return s.send(ctx, user.Email, subject, html)
}

// ─── SendClientInvite ─────────────────────────────────────────────────────────

// SendClientInvite sends a workspace invitation to a client or team member.
// inviterName is the display name of the person who sent the invite.
func (s *Service) SendClientInvite(
	ctx context.Context,
	inviterName, clientEmail, clientName, inviteURL string,
) error {
	subject := fmt.Sprintf("You've been invited to %s", s.appName)
	preheader := fmt.Sprintf("%s has invited you to manage your social media on %s.", inviterName, s.appName)

	greeting := clientName
	if greeting == "" {
		greeting = "there"
	}

	body := fmt.Sprintf(`
<h1 %s>You've been invited! \U0001f44b</h1>
<p %s>Hi %s,</p>
<p %s><strong>%s</strong> has invited you to help manage your social media presence on <strong>%s</strong>.</p>
<div %s>
  <p style="margin:0;font-size:14px;color:#5B21B6;font-weight:600;">What is %s?</p>
  <p style="margin:8px 0 0;font-size:14px;color:#374151;line-height:1.6;">
    %s is an all-in-one social media management platform. Schedule posts, generate AI content,
    and track analytics — all from a single, beautiful dashboard.
  </p>
</div>
<p %s>Click the button below to accept your invitation and get started:</p>`,
		h1Style,
		pStyle, greeting,
		pStyle, inviterName, s.appName,
		highlightBoxStyle, s.appName,
		s.appName,
		pStyle,
	)

	html := baseTemplate(s.appName, s.appURL, subject, preheader, body, inviteURL, "Accept Invite")
	return s.send(ctx, clientEmail, subject, html)
}

// ─── SendPostPublishFailure ────────────────────────────────────────────────────

// SendPostPublishFailure notifies the user when one or more platforms failed to
// publish their post. platformErrors maps platform name → error message.
func (s *Service) SendPostPublishFailure(
	ctx context.Context,
	userEmail, userName string,
	postTitle string,
	platformErrors map[string]string,
) error {
	n := len(platformErrors)
	subject := "\u26a0\ufe0f Post failed to publish"
	preheader := fmt.Sprintf("Your post could not be published to %d platform(s). Please retry.", n)

	if postTitle == "" {
		postTitle = "your post"
	}

	// Build a list of platform failures.
	var sb strings.Builder
	sb.WriteString(`<ul style="margin:0 0 20px;padding-left:20px;color:#374151;font-size:15px;line-height:2;">`)
	for platform, errMsg := range platformErrors {
		sb.WriteString(fmt.Sprintf(
			`<li><strong>%s</strong>: <span style="color:#DC2626;">%s</span></li>`,
			platform, errMsg,
		))
	}
	sb.WriteString(`</ul>`)

	body := fmt.Sprintf(`
<h1 %s>Publishing failed on %d platform(s)</h1>
<p %s>Hi %s,</p>
<p %s>Unfortunately, <strong>%s</strong> could not be published to the following platform(s):</p>
%s
<p %s>Please review the errors and retry publishing from your dashboard.</p>`,
		h1Style, n,
		pStyle, userName,
		pStyle, postTitle,
		sb.String(),
		pStyle,
	)

	retryURL := s.appURL + "/compose"
	html := baseTemplate(s.appName, s.appURL, subject, preheader, body, retryURL, "View Post")
	return s.send(ctx, userEmail, subject, html)
}

// ─── SendPasswordReset ────────────────────────────────────────────────────────

// SendPasswordReset delivers a password-reset link to the user.
func (s *Service) SendPasswordReset(ctx context.Context, userEmail, userName, resetURL string) error {
	subject := fmt.Sprintf("Reset your %s password", s.appName)
	preheader := "Use the link below to reset your password. It expires in 1 hour."

	body := fmt.Sprintf(`
<h1 %s>Reset your password</h1>
<p %s>Hi %s,</p>
<p %s>We received a request to reset the password for your <strong>%s</strong> account.</p>
<p %s>Click the button below to choose a new password. This link is valid for <strong>1 hour</strong>.</p>
<div %s>
  <p style="margin:0;font-size:13px;color:#5B21B6;">
    If you didn't request a password reset, you can safely ignore this email — your account
    password will not be changed.
  </p>
</div>`,
		h1Style,
		pStyle, userName,
		pStyle, s.appName,
		pStyle,
		highlightBoxStyle,
	)

	html := baseTemplate(s.appName, s.appURL, subject, preheader, body, resetURL, "Reset Password")
	return s.send(ctx, userEmail, subject, html)
}

// ─── SendTrialEnding ──────────────────────────────────────────────────────────

// SendTrialEnding warns the user that their trial is ending soon.
func (s *Service) SendTrialEnding(ctx context.Context, userEmail, userName string, daysLeft int) error {
	subject := fmt.Sprintf("Your %s trial ends in %d day(s)", s.appName, daysLeft)
	preheader := fmt.Sprintf("Upgrade now to keep all your features — only %d day(s) left.", daysLeft)

	upgradeURL := s.appURL + "/settings/billing"

	dayWord := "days"
	if daysLeft == 1 {
		dayWord = "day"
	}

	body := fmt.Sprintf(`
<h1 %s>Your trial ends in %d %s</h1>
<p %s>Hi %s,</p>
<p %s>Your free trial of <strong>%s</strong> is coming to an end. After it expires you will lose access to:</p>
<ul style="margin:0 0 16px;padding-left:20px;color:#374151;font-size:15px;line-height:2;">
  <li>AI content generation credits</li>
  <li>Scheduled posts beyond the free-plan limit</li>
  <li>Advanced analytics and platform insights</li>
  <li>Team member collaboration</li>
  <li>Multiple social account connections</li>
</ul>
<div %s>
  <p style="margin:0;font-size:14px;color:#5B21B6;font-weight:600;">Keep everything you've built</p>
  <p style="margin:8px 0 0;font-size:14px;color:#374151;line-height:1.6;">
    Upgrade to a paid plan today and continue growing your audience without interruption.
    Plans start from just $29/month.
  </p>
</div>
<p %s>Upgrade now and never miss a beat:</p>`,
		h1Style, daysLeft, dayWord,
		pStyle, userName,
		pStyle, s.appName,
		highlightBoxStyle,
		pStyle,
	)

	html := baseTemplate(s.appName, s.appURL, subject, preheader, body, upgradeURL, "Upgrade Now")
	return s.send(ctx, userEmail, subject, html)
}
