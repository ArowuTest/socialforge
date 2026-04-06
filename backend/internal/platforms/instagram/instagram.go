// Package instagram implements the SocialForge platform adapter for Instagram
// using the Facebook Graph API v19.0.
//
// Flow summary:
//  1. GetAuthURL   – builds the Facebook OAuth dialog URL (Instagram needs FB OAuth).
//  2. ExchangeCode – exchanges the short-lived code for a long-lived token, then
//                    walks /me/accounts to find the connected IG Business account.
//  3. RefreshToken – long-lived tokens last ~60 days; re-exchange via the LL-token
//                    endpoint to obtain a fresh long-lived token.
//  4. Post         – dispatches to image, video/reel, carousel, or story helpers.
package instagram

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
	"golang.org/x/oauth2/facebook"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/config"
	"github.com/socialforge/backend/internal/crypto"
	"github.com/socialforge/backend/internal/models"
)

const (
	graphBaseURL    = "https://graph.facebook.com/v19.0"
	longLivedTokenURL = "https://graph.facebook.com/v19.0/oauth/access_token"
)

// Client is the Instagram platform adapter.
type Client struct {
	cfg    config.OAuthPlatformConfig
	secret string // encryption secret for tokens
	db     *gorm.DB
	log    *zap.Logger
	http   *http.Client
}

// New creates a new Instagram Client.
func New(cfg config.OAuthPlatformConfig, encryptionSecret string, db *gorm.DB, log *zap.Logger) *Client {
	return &Client{
		cfg:    cfg,
		secret: encryptionSecret,
		db:     db,
		log:    log.Named("instagram"),
		http:   &http.Client{Timeout: 30 * time.Second},
	}
}

// oauthConfig returns the oauth2 configuration for the Facebook/Instagram flow.
func (c *Client) oauthConfig() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     c.cfg.ClientID,
		ClientSecret: c.cfg.ClientSecret,
		RedirectURL:  c.cfg.RedirectURL,
		Scopes: []string{
			"instagram_basic",
			"instagram_content_publish",
			"pages_show_list",
			"pages_read_engagement",
		},
		Endpoint: facebook.Endpoint,
	}
}

// GetAuthURL returns the Facebook OAuth dialog URL that the user must visit to
// grant Instagram permissions. state should be a CSRF-safe random string that
// also encodes the workspaceID.
func (c *Client) GetAuthURL(workspaceID uuid.UUID, state string) string {
	conf := c.oauthConfig()
	authURL := conf.AuthCodeURL(state,
		oauth2.AccessTypeOffline,
		oauth2.SetAuthURLParam("display", "popup"),
	)
	c.log.Info("generated Instagram auth URL", zap.String("workspace_id", workspaceID.String()))
	return authURL
}

// ExchangeCode exchanges the short-lived code returned by Facebook's OAuth dialog
// for a long-lived token, then fetches the connected Instagram Business account
// and persists a SocialAccount record.
func (c *Client) ExchangeCode(ctx context.Context, code, state string, workspaceID uuid.UUID) (*models.SocialAccount, error) {
	conf := c.oauthConfig()

	// Step 1: exchange code for short-lived token.
	shortToken, err := conf.Exchange(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("instagram: exchange code: %w", err)
	}

	// Step 2: extend to long-lived token (valid ~60 days).
	longToken, expiry, err := c.exchangeForLongLivedToken(ctx, shortToken.AccessToken)
	if err != nil {
		return nil, fmt.Errorf("instagram: long-lived token: %w", err)
	}

	// Step 3: fetch Facebook pages and find the linked IG Business account.
	igAccount, err := c.fetchIGBusinessAccount(ctx, longToken)
	if err != nil {
		return nil, fmt.Errorf("instagram: fetch IG account: %w", err)
	}

	// Step 4: encrypt tokens.
	encAccess, err := crypto.Encrypt(longToken, c.secret)
	if err != nil {
		return nil, fmt.Errorf("instagram: encrypt access token: %w", err)
	}

	expiryTime := time.Now().Add(time.Duration(expiry) * time.Second)

	account := &models.SocialAccount{
		WorkspaceID:  workspaceID,
		Platform:     models.PlatformInstagram,
		AccountID:    igAccount.ID,
		AccountName:  igAccount.Name,
		AccountType:  "business",
		AvatarURL:    igAccount.ProfilePictureURL,
		AccessToken:  encAccess,
		RefreshToken: "", // Instagram uses long-lived tokens, no separate refresh token
		TokenExpiresAt: &expiryTime,
		Scopes:         models.StringSlice(conf.Scopes),
		PageID:       igAccount.PageID,
		PageName:     igAccount.PageName,
		IsActive:     true,
	}

	if err := c.db.WithContext(ctx).
		Where(models.SocialAccount{WorkspaceID: workspaceID, Platform: models.PlatformInstagram, AccountID: igAccount.ID}).
		Assign(*account).
		FirstOrCreate(account).Error; err != nil {
		return nil, fmt.Errorf("instagram: upsert social account: %w", err)
	}

	c.log.Info("instagram account connected",
		zap.String("workspace_id", workspaceID.String()),
		zap.String("ig_account_id", igAccount.ID),
		zap.String("ig_account_name", igAccount.Name),
	)

	return account, nil
}

// RefreshToken refreshes a long-lived Instagram token before it expires.
// Instagram long-lived tokens can be refreshed at any time before they expire.
func (c *Client) RefreshToken(ctx context.Context, account *models.SocialAccount) error {
	currentToken, err := crypto.Decrypt(account.AccessToken, c.secret)
	if err != nil {
		return fmt.Errorf("instagram: decrypt access token: %w", err)
	}

	reqURL := fmt.Sprintf(
		"%s/refresh_access_token?grant_type=ig_refresh_token&access_token=%s",
		graphBaseURL, url.QueryEscape(currentToken),
	)

	resp, err := c.http.Get(reqURL)
	if err != nil {
		return fmt.Errorf("instagram: refresh token request: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		ExpiresIn   int64  `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("instagram: decode refresh response: %w", err)
	}
	if result.AccessToken == "" {
		return fmt.Errorf("instagram: empty access token in refresh response")
	}

	encAccess, err := crypto.Encrypt(result.AccessToken, c.secret)
	if err != nil {
		return fmt.Errorf("instagram: encrypt refreshed token: %w", err)
	}

	expiry := time.Now().Add(time.Duration(result.ExpiresIn) * time.Second)
	if err := c.db.WithContext(ctx).Model(account).Updates(map[string]interface{}{
		"access_token": encAccess,
		"token_expires_at": expiry,
	}).Error; err != nil {
		return fmt.Errorf("instagram: update token in db: %w", err)
	}

	account.AccessToken = encAccess
	account.TokenExpiresAt = &expiry

	c.log.Info("instagram token refreshed",
		zap.String("account_id", account.ID.String()),
		zap.Time("new_expiry", expiry),
	)
	return nil
}

// Post publishes content to Instagram. The post type determines which sub-flow
// is used: IMAGE, VIDEO/REEL, CAROUSEL, or STORY.
func (c *Client) Post(ctx context.Context, account *models.SocialAccount, req *models.PostRequest) (*models.PostResult, error) {
	token, err := crypto.Decrypt(account.AccessToken, c.secret)
	if err != nil {
		return nil, fmt.Errorf("instagram: decrypt token: %w", err)
	}

	igAccountID := account.AccountID

	switch req.Type {
	case models.PostTypeImage:
		return c.postSingleImage(ctx, igAccountID, token, req)
	case models.PostTypeVideo, models.PostTypeReel:
		return c.postVideo(ctx, igAccountID, token, req)
	case models.PostTypeCarousel:
		return c.postCarousel(ctx, igAccountID, token, req)
	case models.PostTypeStory:
		return c.postStory(ctx, igAccountID, token, req)
	default:
		return nil, fmt.Errorf("instagram: unsupported post type: %s", req.Type)
	}
}

// ─── image post ─────────────────────────────────────────────────────────────

func (c *Client) postSingleImage(ctx context.Context, igID, token string, req *models.PostRequest) (*models.PostResult, error) {
	if len(req.MediaURLs) == 0 {
		return nil, fmt.Errorf("instagram: image post requires at least one media URL")
	}

	caption := buildCaption(req.Caption, req.Hashtags)

	// Create media container.
	containerID, err := c.createImageContainer(ctx, igID, token, req.MediaURLs[0], caption)
	if err != nil {
		return nil, err
	}

	// Publish the container.
	postID, err := c.publishContainer(ctx, igID, token, containerID)
	if err != nil {
		return nil, err
	}

	c.log.Info("instagram image published",
		zap.String("ig_account_id", igID),
		zap.String("post_id", postID),
	)

	return &models.PostResult{
		PlatformPostID: postID,
		PostURL:        fmt.Sprintf("https://www.instagram.com/p/%s/", postID),
	}, nil
}

func (c *Client) createImageContainer(ctx context.Context, igID, token, imageURL, caption string) (string, error) {
	params := url.Values{
		"image_url":     {imageURL},
		"caption":       {caption},
		"access_token":  {token},
	}
	endpoint := fmt.Sprintf("%s/%s/media", graphBaseURL, igID)

	var result struct {
		ID    string `json:"id"`
		Error *graphAPIError `json:"error,omitempty"`
	}
	if err := c.doPost(ctx, endpoint, params, &result); err != nil {
		return "", fmt.Errorf("instagram: create image container: %w", err)
	}
	if result.Error != nil {
		return "", fmt.Errorf("instagram: create image container API error: %s", result.Error.Message)
	}
	return result.ID, nil
}

// ─── video / reel post ───────────────────────────────────────────────────────

func (c *Client) postVideo(ctx context.Context, igID, token string, req *models.PostRequest) (*models.PostResult, error) {
	if len(req.MediaURLs) == 0 {
		return nil, fmt.Errorf("instagram: video post requires at least one media URL")
	}

	caption := buildCaption(req.Caption, req.Hashtags)
	mediaType := "REELS"
	if req.Type == models.PostTypeVideo {
		mediaType = "VIDEO"
	}

	params := url.Values{
		"video_url":     {req.MediaURLs[0]},
		"caption":       {caption},
		"media_type":    {mediaType},
		"access_token":  {token},
	}
	if req.ThumbnailURL != "" {
		params.Set("thumb_offset", "0")
	}

	endpoint := fmt.Sprintf("%s/%s/media", graphBaseURL, igID)
	var containerResult struct {
		ID    string         `json:"id"`
		Error *graphAPIError `json:"error,omitempty"`
	}
	if err := c.doPost(ctx, endpoint, params, &containerResult); err != nil {
		return nil, fmt.Errorf("instagram: create video container: %w", err)
	}
	if containerResult.Error != nil {
		return nil, fmt.Errorf("instagram: create video container API error: %s", containerResult.Error.Message)
	}

	// Poll until the container is ready to publish (video encoding takes time).
	if err := c.waitForContainerReady(ctx, containerResult.ID, token); err != nil {
		return nil, fmt.Errorf("instagram: video container not ready: %w", err)
	}

	postID, err := c.publishContainer(ctx, igID, token, containerResult.ID)
	if err != nil {
		return nil, err
	}

	c.log.Info("instagram video/reel published",
		zap.String("ig_account_id", igID),
		zap.String("post_id", postID),
		zap.String("media_type", mediaType),
	)

	return &models.PostResult{
		PlatformPostID: postID,
		PostURL:        fmt.Sprintf("https://www.instagram.com/p/%s/", postID),
	}, nil
}

// waitForContainerReady polls the container status every 5 seconds for up to 5
// minutes waiting for the video to finish processing.
func (c *Client) waitForContainerReady(ctx context.Context, containerID, token string) error {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	deadline := time.Now().Add(5 * time.Minute)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if time.Now().After(deadline) {
				return fmt.Errorf("timed out waiting for container %s to be ready", containerID)
			}

			statusURL := fmt.Sprintf("%s/%s?fields=status_code,status&access_token=%s",
				graphBaseURL, containerID, url.QueryEscape(token))

			resp, err := c.http.Get(statusURL)
			if err != nil {
				c.log.Warn("polling container status failed", zap.Error(err))
				continue
			}
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()

			var status struct {
				StatusCode string `json:"status_code"`
				Status     string `json:"status"`
			}
			if err := json.Unmarshal(body, &status); err != nil {
				continue
			}

			switch status.StatusCode {
			case "FINISHED":
				return nil
			case "ERROR", "EXPIRED":
				return fmt.Errorf("container %s entered terminal state: %s", containerID, status.StatusCode)
			}
			// IN_PROGRESS or other transient states: keep polling.
		}
	}
}

// ─── carousel post ───────────────────────────────────────────────────────────

func (c *Client) postCarousel(ctx context.Context, igID, token string, req *models.PostRequest) (*models.PostResult, error) {
	if len(req.CarouselItems) < 2 {
		return nil, fmt.Errorf("instagram: carousel requires at least 2 items")
	}
	if len(req.CarouselItems) > 10 {
		return nil, fmt.Errorf("instagram: carousel supports at most 10 items")
	}

	// Create a container for each item.
	childIDs := make([]string, 0, len(req.CarouselItems))
	for i, item := range req.CarouselItems {
		params := url.Values{"access_token": {token}, "is_carousel_item": {"true"}}
		switch item.MediaType {
		case "VIDEO":
			params.Set("media_type", "VIDEO")
			params.Set("video_url", item.MediaURL)
		default:
			params.Set("image_url", item.MediaURL)
		}

		endpoint := fmt.Sprintf("%s/%s/media", graphBaseURL, igID)
		var res struct {
			ID    string         `json:"id"`
			Error *graphAPIError `json:"error,omitempty"`
		}
		if err := c.doPost(ctx, endpoint, params, &res); err != nil {
			return nil, fmt.Errorf("instagram: carousel item %d container: %w", i, err)
		}
		if res.Error != nil {
			return nil, fmt.Errorf("instagram: carousel item %d API error: %s", i, res.Error.Message)
		}
		childIDs = append(childIDs, res.ID)
	}

	// Create the carousel container.
	caption := buildCaption(req.Caption, req.Hashtags)
	carouselParams := url.Values{
		"media_type":   {"CAROUSEL"},
		"children":     {strings.Join(childIDs, ",")},
		"caption":      {caption},
		"access_token": {token},
	}
	endpoint := fmt.Sprintf("%s/%s/media", graphBaseURL, igID)
	var carouselRes struct {
		ID    string         `json:"id"`
		Error *graphAPIError `json:"error,omitempty"`
	}
	if err := c.doPost(ctx, endpoint, carouselParams, &carouselRes); err != nil {
		return nil, fmt.Errorf("instagram: carousel container: %w", err)
	}
	if carouselRes.Error != nil {
		return nil, fmt.Errorf("instagram: carousel container API error: %s", carouselRes.Error.Message)
	}

	postID, err := c.publishContainer(ctx, igID, token, carouselRes.ID)
	if err != nil {
		return nil, err
	}

	c.log.Info("instagram carousel published",
		zap.String("ig_account_id", igID),
		zap.String("post_id", postID),
		zap.Int("items", len(childIDs)),
	)

	return &models.PostResult{
		PlatformPostID: postID,
		PostURL:        fmt.Sprintf("https://www.instagram.com/p/%s/", postID),
	}, nil
}

// ─── story post ──────────────────────────────────────────────────────────────

func (c *Client) postStory(ctx context.Context, igID, token string, req *models.PostRequest) (*models.PostResult, error) {
	if len(req.MediaURLs) == 0 {
		return nil, fmt.Errorf("instagram: story post requires at least one media URL")
	}

	params := url.Values{
		"media_type":   {"STORIES"},
		"access_token": {token},
	}
	// Determine whether image or video based on extension heuristic.
	mediaURL := req.MediaURLs[0]
	lower := strings.ToLower(mediaURL)
	if strings.HasSuffix(lower, ".mp4") || strings.HasSuffix(lower, ".mov") {
		params.Set("video_url", mediaURL)
	} else {
		params.Set("image_url", mediaURL)
	}

	endpoint := fmt.Sprintf("%s/%s/media", graphBaseURL, igID)
	var res struct {
		ID    string         `json:"id"`
		Error *graphAPIError `json:"error,omitempty"`
	}
	if err := c.doPost(ctx, endpoint, params, &res); err != nil {
		return nil, fmt.Errorf("instagram: story container: %w", err)
	}
	if res.Error != nil {
		return nil, fmt.Errorf("instagram: story container API error: %s", res.Error.Message)
	}

	postID, err := c.publishContainer(ctx, igID, token, res.ID)
	if err != nil {
		return nil, err
	}

	c.log.Info("instagram story published",
		zap.String("ig_account_id", igID),
		zap.String("post_id", postID),
	)

	return &models.PostResult{PlatformPostID: postID}, nil
}

// ─── shared helpers ──────────────────────────────────────────────────────────

func (c *Client) publishContainer(ctx context.Context, igID, token, containerID string) (string, error) {
	params := url.Values{
		"creation_id":  {containerID},
		"access_token": {token},
	}
	endpoint := fmt.Sprintf("%s/%s/media_publish", graphBaseURL, igID)
	var res struct {
		ID    string         `json:"id"`
		Error *graphAPIError `json:"error,omitempty"`
	}
	if err := c.doPost(ctx, endpoint, params, &res); err != nil {
		return "", fmt.Errorf("instagram: publish container: %w", err)
	}
	if res.Error != nil {
		return "", fmt.Errorf("instagram: publish API error: %s", res.Error.Message)
	}
	return res.ID, nil
}

// exchangeForLongLivedToken exchanges a short-lived Facebook token for a
// long-lived Instagram token (~60 days). Returns the token and expiry seconds.
func (c *Client) exchangeForLongLivedToken(ctx context.Context, shortToken string) (string, int64, error) {
	reqURL := fmt.Sprintf(
		"%s?grant_type=fb_exchange_token&client_id=%s&client_secret=%s&fb_exchange_token=%s",
		longLivedTokenURL,
		url.QueryEscape(c.cfg.ClientID),
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

	var result struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		ExpiresIn   int64  `json:"expires_in"`
		Error       *graphAPIError `json:"error,omitempty"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", 0, err
	}
	if result.Error != nil {
		return "", 0, fmt.Errorf("graph API error %d: %s", result.Error.Code, result.Error.Message)
	}
	return result.AccessToken, result.ExpiresIn, nil
}

// igAccountInfo groups the data fetched from /me/accounts.
type igAccountInfo struct {
	ID                string
	Name              string
	ProfilePictureURL string
	PageID            string
	PageName          string
}

// fetchIGBusinessAccount uses the long-lived token to walk the user's FB pages
// and find the connected Instagram Business/Creator account.
func (c *Client) fetchIGBusinessAccount(ctx context.Context, token string) (*igAccountInfo, error) {
	pagesURL := fmt.Sprintf(
		"%s/me/accounts?fields=id,name,instagram_business_account{id,name,profile_picture_url}&access_token=%s",
		graphBaseURL, url.QueryEscape(token),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, pagesURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var pages struct {
		Data []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
			IGB  *struct {
				ID                string `json:"id"`
				Name              string `json:"name"`
				ProfilePictureURL string `json:"profile_picture_url"`
			} `json:"instagram_business_account,omitempty"`
		} `json:"data"`
		Error *graphAPIError `json:"error,omitempty"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&pages); err != nil {
		return nil, err
	}
	if pages.Error != nil {
		return nil, fmt.Errorf("graph API error %d: %s", pages.Error.Code, pages.Error.Message)
	}

	for _, page := range pages.Data {
		if page.IGB != nil {
			return &igAccountInfo{
				ID:                page.IGB.ID,
				Name:              page.IGB.Name,
				ProfilePictureURL: page.IGB.ProfilePictureURL,
				PageID:            page.ID,
				PageName:          page.Name,
			}, nil
		}
	}

	return nil, fmt.Errorf("no Instagram Business account found connected to any Facebook page")
}

// doPost sends a POST request with url.Values body to the Graph API and decodes
// the JSON response into dst.
func (c *Client) doPost(ctx context.Context, endpoint string, params url.Values, dst interface{}) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint,
		bytes.NewBufferString(params.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	if resp.StatusCode >= 400 {
		c.log.Error("instagram API HTTP error",
			zap.Int("status", resp.StatusCode),
			zap.String("body", string(body)),
		)
		return fmt.Errorf("instagram: HTTP %d: %s", resp.StatusCode, string(body))
	}

	return json.Unmarshal(body, dst)
}

// buildCaption joins caption text with hashtags.
func buildCaption(caption string, hashtags []string) string {
	if len(hashtags) == 0 {
		return caption
	}
	tags := make([]string, len(hashtags))
	for i, h := range hashtags {
		if !strings.HasPrefix(h, "#") {
			h = "#" + h
		}
		tags[i] = h
	}
	if caption == "" {
		return strings.Join(tags, " ")
	}
	return caption + "\n\n" + strings.Join(tags, " ")
}

// graphAPIError models the Facebook Graph API error object.
type graphAPIError struct {
	Message string `json:"message"`
	Type    string `json:"type"`
	Code    int    `json:"code"`
	Subcode int    `json:"error_subcode"`
}
