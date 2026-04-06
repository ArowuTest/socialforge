// Package facebook implements the SocialForge platform adapter for Facebook
// using the Facebook Graph API.
//
// Flow summary:
//  1. GetAuthURL   – builds the Facebook OAuth dialog URL.
//  2. ExchangeCode – exchanges the short-lived code for a long-lived user token,
//                    fetches all managed pages, and persists a SocialAccount per
//                    page.
//  3. Post         – dispatches to feed (text), photo, or video helpers.
package facebook

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
	facebookOAuth "golang.org/x/oauth2/facebook"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/config"
	"github.com/socialforge/backend/internal/crypto"
	"github.com/socialforge/backend/internal/models"
)

const (
	graphBase   = "https://graph.facebook.com"
	graphV      = "https://graph.facebook.com/v19.0"
)

// PostRequest carries the data needed to publish a Facebook post.
type PostRequest struct {
	Content  string
	MediaURL string // first image or video URL
	PostType string // "text" | "photo" | "video"
	Caption  string // video description / photo caption
}

// Client is the Facebook platform adapter.
type Client struct {
	cfg    config.OAuthPlatformConfig
	secret string
	db     *gorm.DB
	log    *zap.Logger
	http   *http.Client
}

// New creates a new Facebook Client.
func New(cfg config.OAuthPlatformConfig, encryptionSecret string, db *gorm.DB, log *zap.Logger) *Client {
	return &Client{
		cfg:    cfg,
		secret: encryptionSecret,
		db:     db,
		log:    log.Named("facebook"),
		http:   &http.Client{Timeout: 60 * time.Second},
	}
}

// oauthConfig returns the oauth2 configuration for Facebook.
func (c *Client) oauthConfig() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     c.cfg.ClientID,
		ClientSecret: c.cfg.ClientSecret,
		RedirectURL:  c.cfg.RedirectURL,
		Scopes: []string{
			"pages_manage_posts",
			"pages_read_engagement",
			"pages_show_list",
			"publish_video",
		},
		Endpoint: facebookOAuth.Endpoint,
	}
}

// GetAuthURL returns the Facebook OAuth dialog URL.
func (c *Client) GetAuthURL(workspaceID uuid.UUID, state string) string {
	conf := c.oauthConfig()
	authURL := conf.AuthCodeURL(state, oauth2.AccessTypeOffline)
	c.log.Info("generated Facebook auth URL", zap.String("workspace_id", workspaceID.String()))
	return authURL
}

// ExchangeCode exchanges the short-lived code for a long-lived user token,
// then fetches and persists all managed Facebook pages as SocialAccount records.
func (c *Client) ExchangeCode(
	ctx context.Context,
	code, state string,
	workspaceID uuid.UUID,
) ([]*models.SocialAccount, error) {
	conf := c.oauthConfig()

	// Step 1: exchange code for short-lived user token.
	shortToken, err := conf.Exchange(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("facebook: exchange code: %w", err)
	}

	// Step 2: extend to long-lived user token (~60 days).
	longToken, expiresIn, err := c.exchangeForLongLivedToken(ctx, shortToken.AccessToken)
	if err != nil {
		return nil, fmt.Errorf("facebook: long-lived token: %w", err)
	}

	// Step 3: fetch all managed pages.
	pages, err := c.fetchManagedPages(ctx, longToken)
	if err != nil {
		return nil, fmt.Errorf("facebook: fetch pages: %w", err)
	}

	if len(pages) == 0 {
		return nil, fmt.Errorf("facebook: no managed pages found for this account")
	}

	expiry := time.Now().Add(time.Duration(expiresIn) * time.Second)

	accounts := make([]*models.SocialAccount, 0, len(pages))
	for _, page := range pages {
		encPageToken, err := crypto.Encrypt(page.AccessToken, c.secret)
		if err != nil {
			return nil, fmt.Errorf("facebook: encrypt page token for page %s: %w", page.ID, err)
		}

		account := &models.SocialAccount{
			WorkspaceID:   workspaceID,
			Platform:      models.PlatformFacebook,
			AccountID:     page.ID,
			AccountName:   page.Name,
			AccountType:   "page",
			AvatarURL:     page.PictureURL,
			AccessToken:   encPageToken,
			RefreshToken:  "",
			TokenExpiresAt: &expiry,
			Scopes:        models.StringSlice(conf.Scopes),
			IsActive:      true,
			ProfileURL:    "https://www.facebook.com/" + page.ID,
			Metadata: models.JSONMap{
				"category": page.Category,
				"fan_count": page.FanCount,
			},
		}

		if err := c.db.WithContext(ctx).
			Where(models.SocialAccount{WorkspaceID: workspaceID, Platform: models.PlatformFacebook, AccountID: page.ID}).
			Assign(*account).
			FirstOrCreate(account).Error; err != nil {
			return nil, fmt.Errorf("facebook: upsert social account for page %s: %w", page.ID, err)
		}

		accounts = append(accounts, account)
		c.log.Info("facebook page connected",
			zap.String("workspace_id", workspaceID.String()),
			zap.String("page_id", page.ID),
			zap.String("page_name", page.Name),
		)
	}

	return accounts, nil
}

// Post publishes content to a Facebook page, dispatching by post type.
func (c *Client) Post(
	ctx context.Context,
	account *models.SocialAccount,
	req PostRequest,
) (string, error) {
	pageToken, err := crypto.Decrypt(account.AccessToken, c.secret)
	if err != nil {
		return "", fmt.Errorf("facebook: decrypt page token: %w", err)
	}

	pageID := account.AccountID

	switch req.PostType {
	case "photo":
		return c.postPhoto(ctx, pageID, pageToken, req)
	case "video":
		return c.postVideo(ctx, pageID, pageToken, req)
	default:
		return c.postFeed(ctx, pageID, pageToken, req.Content)
	}
}

// ─── post types ──────────────────────────────────────────────────────────────

func (c *Client) postFeed(ctx context.Context, pageID, pageToken, message string) (string, error) {
	params := url.Values{
		"message":      {message},
		"access_token": {pageToken},
	}

	endpoint := fmt.Sprintf("%s/%s/feed", graphV, pageID)
	postID, err := c.doFormPost(ctx, endpoint, params)
	if err != nil {
		return "", fmt.Errorf("facebook: post to feed: %w", err)
	}

	c.log.Info("facebook feed post published", zap.String("post_id", postID))
	return postID, nil
}

func (c *Client) postPhoto(ctx context.Context, pageID, pageToken string, req PostRequest) (string, error) {
	caption := req.Caption
	if caption == "" {
		caption = req.Content
	}

	params := url.Values{
		"url":          {req.MediaURL},
		"caption":      {caption},
		"access_token": {pageToken},
	}

	endpoint := fmt.Sprintf("%s/%s/photos", graphV, pageID)
	postID, err := c.doFormPost(ctx, endpoint, params)
	if err != nil {
		return "", fmt.Errorf("facebook: post photo: %w", err)
	}

	c.log.Info("facebook photo post published", zap.String("post_id", postID))
	return postID, nil
}

func (c *Client) postVideo(ctx context.Context, pageID, pageToken string, req PostRequest) (string, error) {
	description := req.Caption
	if description == "" {
		description = req.Content
	}

	params := url.Values{
		"file_url":     {req.MediaURL},
		"description":  {description},
		"access_token": {pageToken},
	}

	endpoint := fmt.Sprintf("%s/%s/videos", graphV, pageID)
	postID, err := c.doFormPost(ctx, endpoint, params)
	if err != nil {
		return "", fmt.Errorf("facebook: post video: %w", err)
	}

	c.log.Info("facebook video post published", zap.String("post_id", postID))
	return postID, nil
}

// ─── API helpers ─────────────────────────────────────────────────────────────

// doFormPost sends a form-encoded POST to the Graph API and returns the "id" field.
func (c *Client) doFormPost(ctx context.Context, endpoint string, params url.Values) (string, error) {
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
		c.log.Error("facebook API error",
			zap.Int("status", resp.StatusCode),
			zap.String("body", string(body)),
		)
		return "", fmt.Errorf("facebook: HTTP %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		ID    string         `json:"id"`
		Error *graphAPIError `json:"error,omitempty"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("facebook: decode response: %w", err)
	}
	if result.Error != nil {
		return "", fmt.Errorf("facebook: API error %d: %s", result.Error.Code, result.Error.Message)
	}
	return result.ID, nil
}

// exchangeForLongLivedToken exchanges a short-lived token for a long-lived one.
func (c *Client) exchangeForLongLivedToken(ctx context.Context, shortToken string) (string, int64, error) {
	reqURL := fmt.Sprintf(
		"%s/oauth/access_token?grant_type=fb_exchange_token&client_id=%s&client_secret=%s&fb_exchange_token=%s",
		graphBase,
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

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", 0, err
	}

	var result struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		ExpiresIn   int64  `json:"expires_in"`
		Error       *graphAPIError `json:"error,omitempty"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", 0, fmt.Errorf("facebook: decode long-lived token: %w", err)
	}
	if result.Error != nil {
		return "", 0, fmt.Errorf("facebook: long-lived token error %d: %s", result.Error.Code, result.Error.Message)
	}
	return result.AccessToken, result.ExpiresIn, nil
}

// fbPage groups the data returned by /me/accounts.
type fbPage struct {
	ID          string
	Name        string
	AccessToken string
	Category    string
	FanCount    int64
	PictureURL  string
}

// fetchManagedPages returns all Facebook pages the user manages, each with its
// own page-level access token.
func (c *Client) fetchManagedPages(ctx context.Context, userToken string) ([]fbPage, error) {
	accountsURL := fmt.Sprintf(
		"%s/me/accounts?fields=id,name,access_token,category,fan_count,picture&access_token=%s",
		graphV, url.QueryEscape(userToken),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, accountsURL, nil)
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

	var result struct {
		Data []struct {
			ID          string `json:"id"`
			Name        string `json:"name"`
			AccessToken string `json:"access_token"`
			Category    string `json:"category"`
			FanCount    int64  `json:"fan_count"`
			Picture     *struct {
				Data struct {
					URL string `json:"url"`
				} `json:"data"`
			} `json:"picture,omitempty"`
		} `json:"data"`
		Error *graphAPIError `json:"error,omitempty"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("facebook: decode pages response: %w", err)
	}
	if result.Error != nil {
		return nil, fmt.Errorf("facebook: fetch pages error %d: %s", result.Error.Code, result.Error.Message)
	}

	pages := make([]fbPage, 0, len(result.Data))
	for _, d := range result.Data {
		p := fbPage{
			ID:          d.ID,
			Name:        d.Name,
			AccessToken: d.AccessToken,
			Category:    d.Category,
			FanCount:    d.FanCount,
		}
		if d.Picture != nil {
			p.PictureURL = d.Picture.Data.URL
		}
		pages = append(pages, p)
	}
	return pages, nil
}

// ─── shared types ─────────────────────────────────────────────────────────────

type graphAPIError struct {
	Message string `json:"message"`
	Type    string `json:"type"`
	Code    int    `json:"code"`
}

// buildPostURL returns the public URL for a Facebook post.
func buildPostURL(pageID, postID string) string {
	// Composite ID is "pageID_postID", or just postID for some endpoints.
	compositeID := postID
	if !strings.Contains(postID, "_") {
		compositeID = pageID + "_" + postID
	}
	return "https://www.facebook.com/" + compositeID
}
