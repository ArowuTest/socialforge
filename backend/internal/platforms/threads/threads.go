// Package threads implements the SocialForge platform adapter for Threads
// (Meta) using the Threads API.
//
// Flow summary:
//  1. GetAuthURL   – builds the Threads OAuth authorization URL.
//  2. ExchangeCode – exchanges code for a short-lived token, extends to a
//                    long-lived token, fetches profile, persists SocialAccount.
//  3. Post         – three-step publish: create media container → poll for
//                    FINISHED → publish. Supports TEXT, IMAGE, VIDEO, CAROUSEL.
package threads

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"golang.org/x/oauth2"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/config"
	"github.com/socialforge/backend/internal/crypto"
	"github.com/socialforge/backend/internal/models"
)

const (
	threadsAuthURL     = "https://threads.net/oauth/authorize"
	threadsTokenURL    = "https://graph.threads.net/oauth/access_token"
	threadsLLTokenURL  = "https://graph.threads.net/access_token"
	threadsAPIBase     = "https://graph.threads.net"
)

// PostRequest carries the data needed to publish a Threads post.
type PostRequest struct {
	Text      string
	MediaURLs []string
	PostType  string // "text" | "image" | "video" | "carousel"
}

// Client is the Threads platform adapter.
type Client struct {
	cfg    config.OAuthPlatformConfig
	secret string
	db     *gorm.DB
	log    *zap.Logger
	http   *http.Client
}

// New creates a new Threads Client.
func New(cfg config.OAuthPlatformConfig, encryptionSecret string, db *gorm.DB, log *zap.Logger) *Client {
	return &Client{
		cfg:    cfg,
		secret: encryptionSecret,
		db:     db,
		log:    log.Named("threads"),
		http:   &http.Client{Timeout: 60 * time.Second},
	}
}

// oauthConfig returns the oauth2 configuration for Threads.
func (c *Client) oauthConfig() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     c.cfg.ClientID,
		ClientSecret: c.cfg.ClientSecret,
		RedirectURL:  c.cfg.RedirectURL,
		Scopes: []string{
			"threads_basic",
			"threads_content_publish",
		},
		Endpoint: oauth2.Endpoint{
			AuthURL:  threadsAuthURL,
			TokenURL: threadsTokenURL,
		},
	}
}

// GetAuthURL returns the Threads OAuth authorization URL.
func (c *Client) GetAuthURL(workspaceID uuid.UUID, state string) string {
	conf := c.oauthConfig()
	authURL := conf.AuthCodeURL(state, oauth2.AccessTypeOffline)
	c.log.Info("generated Threads auth URL", zap.String("workspace_id", workspaceID.String()))
	return authURL
}

// ExchangeCode exchanges the authorization code for a short-lived token,
// extends it to a long-lived token, fetches the user profile, and persists a
// SocialAccount.
func (c *Client) ExchangeCode(
	ctx context.Context,
	code, state string,
	workspaceID uuid.UUID,
) (*models.SocialAccount, error) {
	// Step 1: exchange code for short-lived token.
	shortToken, err := c.exchangeShortLivedToken(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("threads: exchange short-lived token: %w", err)
	}

	// Step 2: extend to long-lived token.
	longToken, expiresIn, err := c.exchangeForLongLivedToken(ctx, shortToken)
	if err != nil {
		return nil, fmt.Errorf("threads: long-lived token: %w", err)
	}

	// Step 3: fetch user profile.
	profile, err := c.fetchProfile(ctx, longToken)
	if err != nil {
		return nil, fmt.Errorf("threads: fetch profile: %w", err)
	}

	encAccess, err := crypto.Encrypt(longToken, c.secret)
	if err != nil {
		return nil, fmt.Errorf("threads: encrypt access token: %w", err)
	}

	expiry := time.Now().Add(time.Duration(expiresIn) * time.Second)

	conf := c.oauthConfig()

	account := &models.SocialAccount{
		WorkspaceID:   workspaceID,
		Platform:      models.PlatformThreads,
		AccountID:     profile.ID,
		AccountName:   profile.Username,
		AccountHandle: profile.Username,
		AccountType:   "personal",
		AvatarURL:     profile.ThreadsProfilePictureURL,
		AccessToken:   encAccess,
		RefreshToken:  "",
		TokenExpiresAt: &expiry,
		Scopes:        models.StringSlice(conf.Scopes),
		IsActive:      true,
		ProfileURL:    "https://www.threads.net/@" + profile.Username,
		Metadata: models.JSONMap{
			"biography": profile.ThreadsBiography,
		},
	}

	if err := c.db.WithContext(ctx).
		Where(models.SocialAccount{WorkspaceID: workspaceID, Platform: models.PlatformThreads, AccountID: profile.ID}).
		Assign(*account).
		FirstOrCreate(account).Error; err != nil {
		return nil, fmt.Errorf("threads: upsert social account: %w", err)
	}

	c.log.Info("threads account connected",
		zap.String("workspace_id", workspaceID.String()),
		zap.String("user_id", profile.ID),
		zap.String("username", profile.Username),
	)

	return account, nil
}

// Post publishes content to Threads using the three-step container → poll → publish flow.
func (c *Client) Post(
	ctx context.Context,
	account *models.SocialAccount,
	req PostRequest,
) (string, error) {
	token, err := crypto.Decrypt(account.AccessToken, c.secret)
	if err != nil {
		return "", fmt.Errorf("threads: decrypt access token: %w", err)
	}

	userID := account.AccountID

	// Step 1: create the media container.
	var containerID string

	switch req.PostType {
	case "image":
		if len(req.MediaURLs) == 0 {
			return "", fmt.Errorf("threads: image post requires at least one media URL")
		}
		containerID, err = c.createImageContainer(ctx, token, userID, req.MediaURLs[0], req.Text)
	case "video":
		if len(req.MediaURLs) == 0 {
			return "", fmt.Errorf("threads: video post requires at least one media URL")
		}
		containerID, err = c.createVideoContainer(ctx, token, userID, req.MediaURLs[0], req.Text)
	case "carousel":
		if len(req.MediaURLs) < 2 {
			return "", fmt.Errorf("threads: carousel post requires at least 2 media URLs")
		}
		containerID, err = c.createCarouselContainer(ctx, token, userID, req.MediaURLs, req.Text)
	default:
		// Text post.
		containerID, err = c.createTextContainer(ctx, token, userID, req.Text)
	}
	if err != nil {
		return "", fmt.Errorf("threads: create container: %w", err)
	}

	// Step 2: poll until the container status is FINISHED.
	if err := c.waitForContainerFinished(ctx, token, containerID); err != nil {
		return "", fmt.Errorf("threads: container not ready: %w", err)
	}

	// Step 3: publish.
	threadID, err := c.publishContainer(ctx, token, userID, containerID)
	if err != nil {
		return "", fmt.Errorf("threads: publish container: %w", err)
	}

	c.log.Info("threads post published",
		zap.String("thread_id", threadID),
		zap.String("post_type", req.PostType),
	)
	return threadID, nil
}

// ─── container creation helpers ──────────────────────────────────────────────

func (c *Client) createTextContainer(ctx context.Context, token, userID, text string) (string, error) {
	body := map[string]interface{}{
		"media_type": "TEXT",
		"text":       text,
	}
	return c.createContainer(ctx, token, userID, body)
}

func (c *Client) createImageContainer(ctx context.Context, token, userID, imageURL, text string) (string, error) {
	body := map[string]interface{}{
		"media_type": "IMAGE",
		"image_url":  imageURL,
		"text":       text,
	}
	return c.createContainer(ctx, token, userID, body)
}

func (c *Client) createVideoContainer(ctx context.Context, token, userID, videoURL, text string) (string, error) {
	body := map[string]interface{}{
		"media_type": "VIDEO",
		"video_url":  videoURL,
		"text":       text,
	}
	return c.createContainer(ctx, token, userID, body)
}

// createCarouselContainer creates child containers for each media item, then
// creates the parent carousel container.
func (c *Client) createCarouselContainer(ctx context.Context, token, userID string, mediaURLs []string, text string) (string, error) {
	childIDs := make([]string, 0, len(mediaURLs))

	for i, mediaURL := range mediaURLs {
		lower := strings.ToLower(mediaURL)
		var childBody map[string]interface{}

		if strings.HasSuffix(lower, ".mp4") || strings.HasSuffix(lower, ".mov") {
			childBody = map[string]interface{}{
				"media_type":       "VIDEO",
				"video_url":        mediaURL,
				"is_carousel_item": true,
			}
		} else {
			childBody = map[string]interface{}{
				"media_type":       "IMAGE",
				"image_url":        mediaURL,
				"is_carousel_item": true,
			}
		}

		childID, err := c.createContainer(ctx, token, userID, childBody)
		if err != nil {
			return "", fmt.Errorf("threads: create carousel child %d: %w", i, err)
		}

		// Wait for each child to finish processing.
		if err := c.waitForContainerFinished(ctx, token, childID); err != nil {
			return "", fmt.Errorf("threads: carousel child %d not ready: %w", i, err)
		}

		childIDs = append(childIDs, childID)
	}

	carouselBody := map[string]interface{}{
		"media_type": "CAROUSEL",
		"children":   strings.Join(childIDs, ","),
		"text":       text,
	}
	return c.createContainer(ctx, token, userID, carouselBody)
}

// createContainer POSTs to /{user-id}/threads and returns the container ID.
func (c *Client) createContainer(ctx context.Context, token, userID string, body map[string]interface{}) (string, error) {
	endpoint := fmt.Sprintf("%s/%s/threads", threadsAPIBase, userID)

	// Threads uses form-encoded POST.
	params := url.Values{"access_token": {token}}
	for k, v := range body {
		switch val := v.(type) {
		case string:
			params.Set(k, val)
		case bool:
			if val {
				params.Set(k, "true")
			} else {
				params.Set(k, "false")
			}
		default:
			params.Set(k, fmt.Sprintf("%v", v))
		}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint,
		bytes.NewBufferString(params.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode >= 400 {
		c.log.Error("threads API error",
			zap.Int("status", resp.StatusCode),
			zap.String("body", string(respBody)),
		)
		return "", fmt.Errorf("threads: HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		ID    string `json:"id"`
		Error *threadsError `json:"error,omitempty"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("threads: decode container response: %w", err)
	}
	if result.Error != nil {
		return "", fmt.Errorf("threads: container API error %d: %s", result.Error.Code, result.Error.Message)
	}
	return result.ID, nil
}

// waitForContainerFinished polls the container status until it reaches FINISHED,
// ERROR, or times out.
func (c *Client) waitForContainerFinished(ctx context.Context, token, containerID string) error {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	deadline := time.Now().Add(5 * time.Minute)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if time.Now().After(deadline) {
				return fmt.Errorf("threads: timed out waiting for container %s to be FINISHED", containerID)
			}

			statusURL := fmt.Sprintf("%s/%s?fields=status&access_token=%s",
				threadsAPIBase, containerID, url.QueryEscape(token))

			req, err := http.NewRequestWithContext(ctx, http.MethodGet, statusURL, nil)
			if err != nil {
				c.log.Warn("threads: container status request error", zap.Error(err))
				continue
			}

			resp, err := c.http.Do(req)
			if err != nil {
				c.log.Warn("threads: container status request failed", zap.Error(err))
				continue
			}

			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()

			var status struct {
				Status string `json:"status"`
			}
			if err := json.Unmarshal(body, &status); err != nil {
				continue
			}

			switch status.Status {
			case "FINISHED":
				return nil
			case "ERROR", "EXPIRED":
				return fmt.Errorf("threads: container %s entered terminal state: %s", containerID, status.Status)
			}
			// IN_PROGRESS or other transient states: keep polling.
		}
	}
}

// publishContainer calls /{user-id}/threads_publish with the container ID.
func (c *Client) publishContainer(ctx context.Context, token, userID, containerID string) (string, error) {
	endpoint := fmt.Sprintf("%s/%s/threads_publish", threadsAPIBase, userID)

	params := url.Values{
		"creation_id":  {containerID},
		"access_token": {token},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint,
		bytes.NewBufferString(params.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode >= 400 {
		c.log.Error("threads publish error",
			zap.Int("status", resp.StatusCode),
			zap.String("body", string(body)),
		)
		return "", fmt.Errorf("threads: publish HTTP %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		ID    string `json:"id"`
		Error *threadsError `json:"error,omitempty"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("threads: decode publish response: %w", err)
	}
	if result.Error != nil {
		return "", fmt.Errorf("threads: publish API error %d: %s", result.Error.Code, result.Error.Message)
	}
	return result.ID, nil
}

// ─── token helpers ────────────────────────────────────────────────────────────

// exchangeShortLivedToken POSTs to the Threads token endpoint for a short-lived
// token using authorization_code grant.
func (c *Client) exchangeShortLivedToken(ctx context.Context, code string) (string, error) {
	params := url.Values{
		"client_id":     {c.cfg.ClientID},
		"client_secret": {c.cfg.ClientSecret},
		"grant_type":    {"authorization_code"},
		"redirect_uri":  {c.cfg.RedirectURL},
		"code":          {code},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, threadsTokenURL,
		bytes.NewBufferString(params.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("threads: short-lived token HTTP %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		AccessToken string `json:"access_token"`
		UserID      string `json:"user_id"`
		Error       *threadsError `json:"error,omitempty"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("threads: decode short-lived token: %w", err)
	}
	if result.Error != nil {
		return "", fmt.Errorf("threads: short-lived token error %d: %s", result.Error.Code, result.Error.Message)
	}
	return result.AccessToken, nil
}

// exchangeForLongLivedToken exchanges a short-lived token for a long-lived one.
// Returns the token and its expiry in seconds.
func (c *Client) exchangeForLongLivedToken(ctx context.Context, shortToken string) (string, int64, error) {
	reqURL := fmt.Sprintf(
		"%s?grant_type=th_exchange_token&client_secret=%s&access_token=%s",
		threadsLLTokenURL,
		url.QueryEscape(c.cfg.ClientSecret),
		url.QueryEscape(shortToken),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return "", 0, err
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return "", 0, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", 0, err
	}

	if resp.StatusCode >= 400 {
		return "", 0, fmt.Errorf("threads: long-lived token HTTP %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		ExpiresIn   int64  `json:"expires_in"`
		Error       *threadsError `json:"error,omitempty"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", 0, fmt.Errorf("threads: decode long-lived token: %w", err)
	}
	if result.Error != nil {
		return "", 0, fmt.Errorf("threads: long-lived token error %d: %s", result.Error.Code, result.Error.Message)
	}
	return result.AccessToken, result.ExpiresIn, nil
}

// fetchProfile retrieves the Threads user profile.
func (c *Client) fetchProfile(ctx context.Context, token string) (*threadsProfile, error) {
	profileURL := fmt.Sprintf(
		"%s/me?fields=id,username,threads_profile_picture_url,threads_biography&access_token=%s",
		threadsAPIBase, url.QueryEscape(token),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, profileURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("threads: fetch profile HTTP %d: %s", resp.StatusCode, string(body))
	}

	var profile threadsProfile
	if err := json.Unmarshal(body, &profile); err != nil {
		return nil, fmt.Errorf("threads: decode profile: %w", err)
	}
	return &profile, nil
}

// ─── response types ──────────────────────────────────────────────────────────

type threadsProfile struct {
	ID                       string `json:"id"`
	Username                 string `json:"username"`
	ThreadsProfilePictureURL string `json:"threads_profile_picture_url"`
	ThreadsBiography         string `json:"threads_biography"`
}

type threadsError struct {
	Message string `json:"message"`
	Type    string `json:"type"`
	Code    int    `json:"code"`
}
