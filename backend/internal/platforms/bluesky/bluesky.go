// Package bluesky implements the SocialForge platform adapter for Bluesky
// using the AT Protocol.
//
// Unlike other platform adapters that use OAuth, Bluesky authenticates via
// app passwords (identifier + password -> createSession -> JWT tokens).
//
// Flow summary:
//  1. ConnectWithAppPassword – authenticates with identifier + app password,
//     persists the encrypted tokens and account metadata.
//  2. RefreshToken – refreshes the AT Protocol session using the refresh JWT.
//     Falls back to re-authenticating with the stored app password.
//  3. Post – creates a Bluesky post with optional images and rich-text facets.
package bluesky

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/crypto"
	"github.com/socialforge/backend/internal/models"
)

const (
	defaultPDS     = "https://bsky.social"
	createSession  = "/xrpc/com.atproto.server.createSession"
	refreshSession = "/xrpc/com.atproto.server.refreshSession"
	createRecord   = "/xrpc/com.atproto.repo.createRecord"
	uploadBlob     = "/xrpc/com.atproto.repo.uploadBlob"
	getProfile     = "/xrpc/app.bsky.actor.getProfile"
)

// Client implements the Bluesky AT Protocol adapter.
// It satisfies both publishing.PlatformClient (Post) and
// publishing.OAuthRefresher (RefreshToken).
type Client struct {
	pdsHost string
	secret  string
	db      *gorm.DB
	log     *zap.Logger
	http    *http.Client
}

// New creates a new Bluesky Client.
func New(encryptionSecret string, db *gorm.DB, log *zap.Logger) *Client {
	return &Client{
		pdsHost: defaultPDS,
		secret:  encryptionSecret,
		db:      db,
		log:     log.Named("bluesky"),
		http:    &http.Client{Timeout: 30 * time.Second},
	}
}

// sessionResponse from createSession / refreshSession.
type sessionResponse struct {
	AccessJwt  string `json:"accessJwt"`
	RefreshJwt string `json:"refreshJwt"`
	Handle     string `json:"handle"`
	DID        string `json:"did"`
	Email      string `json:"email,omitempty"`
}

// ConnectWithAppPassword authenticates with an app password and persists the account.
// This is NOT OAuth -- it is AT Protocol session-based auth.
func (c *Client) ConnectWithAppPassword(
	ctx context.Context,
	workspaceID uuid.UUID,
	identifier, appPassword string,
) (*models.SocialAccount, error) {
	body, _ := json.Marshal(map[string]string{
		"identifier": identifier,
		"password":   appPassword,
	})

	resp, err := c.apiRequest(ctx, "", http.MethodPost, c.pdsHost+createSession, body)
	if err != nil {
		return nil, fmt.Errorf("bluesky: create session: %w", err)
	}

	var session sessionResponse
	if err := json.Unmarshal(resp, &session); err != nil {
		return nil, fmt.Errorf("bluesky: decode session: %w", err)
	}

	// Encrypt tokens.
	encAccess, err := crypto.Encrypt(session.AccessJwt, c.secret)
	if err != nil {
		return nil, fmt.Errorf("bluesky: encrypt access token: %w", err)
	}
	encRefresh, err := crypto.Encrypt(session.RefreshJwt, c.secret)
	if err != nil {
		return nil, fmt.Errorf("bluesky: encrypt refresh token: %w", err)
	}
	// Also store the encrypted app password for re-auth if refresh fails.
	encAppPwd, err := crypto.Encrypt(appPassword, c.secret)
	if err != nil {
		return nil, fmt.Errorf("bluesky: encrypt app password: %w", err)
	}

	// Fetch profile for avatar and display name.
	profile, _ := c.fetchProfile(ctx, session.AccessJwt, session.DID)
	avatarURL := ""
	displayName := session.Handle
	if profile != nil {
		avatarURL = profile.Avatar
		if profile.DisplayName != "" {
			displayName = profile.DisplayName
		}
	}

	account := &models.SocialAccount{
		WorkspaceID:   workspaceID,
		Platform:      models.PlatformBluesky,
		AccountID:     session.DID,
		AccountName:   displayName,
		AccountHandle: session.Handle,
		AccountType:   "personal",
		AvatarURL:     avatarURL,
		AccessToken:   encAccess,
		RefreshToken:  encRefresh,
		Metadata:      models.JSONMap{"app_password": encAppPwd, "did": session.DID, "pds": c.pdsHost},
		IsActive:      true,
		ProfileURL:    fmt.Sprintf("https://bsky.app/profile/%s", session.Handle),
	}

	if err := c.db.WithContext(ctx).
		Where(models.SocialAccount{WorkspaceID: workspaceID, Platform: models.PlatformBluesky, AccountID: session.DID}).
		Assign(*account).
		FirstOrCreate(account).Error; err != nil {
		return nil, fmt.Errorf("bluesky: upsert account: %w", err)
	}

	c.log.Info("bluesky account connected",
		zap.String("workspace_id", workspaceID.String()),
		zap.String("handle", session.Handle),
		zap.String("did", session.DID),
	)

	return account, nil
}

// RefreshToken refreshes the AT Protocol session using the refresh JWT.
// If refresh fails, falls back to re-authenticating with the stored app password.
func (c *Client) RefreshToken(ctx context.Context, account *models.SocialAccount) error {
	refreshJwt, err := crypto.Decrypt(account.RefreshToken, c.secret)
	if err != nil {
		return c.reAuthWithAppPassword(ctx, account)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.pdsHost+refreshSession, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+refreshJwt)

	resp, err := c.http.Do(req)
	if err != nil {
		return c.reAuthWithAppPassword(ctx, account)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return c.reAuthWithAppPassword(ctx, account)
	}

	var session sessionResponse
	if err := json.NewDecoder(resp.Body).Decode(&session); err != nil {
		return c.reAuthWithAppPassword(ctx, account)
	}

	encAccess, _ := crypto.Encrypt(session.AccessJwt, c.secret)
	encRefresh, _ := crypto.Encrypt(session.RefreshJwt, c.secret)

	return c.db.WithContext(ctx).Model(account).Updates(map[string]interface{}{
		"access_token":  encAccess,
		"refresh_token": encRefresh,
	}).Error
}

// reAuthWithAppPassword re-creates the session using the stored app password.
func (c *Client) reAuthWithAppPassword(ctx context.Context, account *models.SocialAccount) error {
	metadata := account.Metadata
	encPwd, ok := metadata["app_password"].(string)
	if !ok {
		return fmt.Errorf("bluesky: no app password stored for re-auth")
	}

	appPwd, err := crypto.Decrypt(encPwd, c.secret)
	if err != nil {
		return fmt.Errorf("bluesky: decrypt app password: %w", err)
	}

	body, _ := json.Marshal(map[string]string{
		"identifier": account.AccountHandle,
		"password":   appPwd,
	})

	respBody, err := c.apiRequest(ctx, "", http.MethodPost, c.pdsHost+createSession, body)
	if err != nil {
		return fmt.Errorf("bluesky: re-auth: %w", err)
	}

	var session sessionResponse
	if err := json.Unmarshal(respBody, &session); err != nil {
		return err
	}

	encAccess, _ := crypto.Encrypt(session.AccessJwt, c.secret)
	encRefresh, _ := crypto.Encrypt(session.RefreshJwt, c.secret)

	return c.db.WithContext(ctx).Model(account).Updates(map[string]interface{}{
		"access_token":  encAccess,
		"refresh_token": encRefresh,
	}).Error
}

// Post creates a new Bluesky post (text, optionally with images).
func (c *Client) Post(ctx context.Context, account *models.SocialAccount, postReq *models.PostRequest) (*models.PostResult, error) {
	token, err := crypto.Decrypt(account.AccessToken, c.secret)
	if err != nil {
		return nil, fmt.Errorf("bluesky: decrypt token: %w", err)
	}

	did := account.AccountID
	caption := buildCaption(postReq.Caption, postReq.Hashtags)

	// Build the post record.
	now := time.Now().UTC().Format(time.RFC3339)
	record := map[string]interface{}{
		"$type":     "app.bsky.feed.post",
		"text":      caption,
		"createdAt": now,
	}

	// Parse facets (hashtags, mentions, links) for rich text.
	facets := parseFacets(caption)
	if len(facets) > 0 {
		record["facets"] = facets
	}

	// Handle image embed if present.
	if len(postReq.MediaURLs) > 0 {
		images := make([]map[string]interface{}, 0)
		for _, mediaURL := range postReq.MediaURLs {
			blob, uploadErr := c.uploadImage(ctx, token, mediaURL)
			if uploadErr != nil {
				c.log.Warn("bluesky: image upload failed, continuing", zap.Error(uploadErr))
				continue
			}
			images = append(images, map[string]interface{}{
				"alt":   postReq.Caption,
				"image": blob,
			})
		}
		if len(images) > 0 {
			record["embed"] = map[string]interface{}{
				"$type":  "app.bsky.embed.images",
				"images": images,
			}
		}
	}

	createBody, _ := json.Marshal(map[string]interface{}{
		"repo":       did,
		"collection": "app.bsky.feed.post",
		"record":     record,
	})

	respBody, err := c.apiRequest(ctx, token, http.MethodPost, c.pdsHost+createRecord, createBody)
	if err != nil {
		return nil, fmt.Errorf("bluesky: create record: %w", err)
	}

	var createResp struct {
		URI string `json:"uri"`
		CID string `json:"cid"`
	}
	if err := json.Unmarshal(respBody, &createResp); err != nil {
		return nil, fmt.Errorf("bluesky: decode create response: %w", err)
	}

	// Build the web URL from the AT URI.
	// at://did:plc:xxx/app.bsky.feed.post/rkey -> https://bsky.app/profile/handle/post/rkey
	postURL := ""
	parts := strings.Split(createResp.URI, "/")
	if len(parts) >= 5 {
		rkey := parts[len(parts)-1]
		postURL = fmt.Sprintf("https://bsky.app/profile/%s/post/%s", account.AccountHandle, rkey)
	}

	c.log.Info("bluesky post created",
		zap.String("uri", createResp.URI),
		zap.String("cid", createResp.CID),
	)

	return &models.PostResult{
		PlatformPostID: createResp.URI,
		PostURL:        postURL,
	}, nil
}

// uploadImage downloads an image from URL and uploads it as a blob.
func (c *Client) uploadImage(ctx context.Context, token, imageURL string) (map[string]interface{}, error) {
	imgReq, err := http.NewRequestWithContext(ctx, http.MethodGet, imageURL, nil)
	if err != nil {
		return nil, err
	}
	imgResp, err := c.http.Do(imgReq)
	if err != nil {
		return nil, err
	}
	defer imgResp.Body.Close()

	imgData, err := io.ReadAll(imgResp.Body)
	if err != nil {
		return nil, err
	}

	contentType := imgResp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "image/jpeg"
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.pdsHost+uploadBlob, bytes.NewReader(imgData))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", contentType)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("bluesky: upload blob HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	var blobResp struct {
		Blob map[string]interface{} `json:"blob"`
	}
	if err := json.Unmarshal(respBody, &blobResp); err != nil {
		return nil, err
	}

	return blobResp.Blob, nil
}

// fetchProfile gets a user's profile info.
func (c *Client) fetchProfile(ctx context.Context, token, did string) (*profileResponse, error) {
	url := fmt.Sprintf("%s%s?actor=%s", c.pdsHost, getProfile, did)
	respBody, err := c.apiRequest(ctx, token, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	var profile profileResponse
	if err := json.Unmarshal(respBody, &profile); err != nil {
		return nil, err
	}
	return &profile, nil
}

type profileResponse struct {
	DID         string `json:"did"`
	Handle      string `json:"handle"`
	DisplayName string `json:"displayName"`
	Avatar      string `json:"avatar"`
}

// apiRequest is a generic HTTP helper for AT Protocol endpoints.
func (c *Client) apiRequest(ctx context.Context, token, method, url string, body []byte) ([]byte, error) {
	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return nil, err
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("bluesky API %d: %s", resp.StatusCode, string(respBody))
	}

	return respBody, nil
}

// parseFacets extracts hashtag facets from text for rich text rendering.
func parseFacets(text string) []map[string]interface{} {
	var facets []map[string]interface{}
	runes := []rune(text)

	for i := 0; i < len(runes); i++ {
		// Hashtag detection.
		if runes[i] == '#' && (i == 0 || runes[i-1] == ' ' || runes[i-1] == '\n') {
			start := i
			j := i + 1
			for j < len(runes) && runes[j] != ' ' && runes[j] != '\n' && runes[j] != '#' {
				j++
			}
			if j > i+1 {
				tag := string(runes[start+1 : j])
				facets = append(facets, map[string]interface{}{
					"index": map[string]interface{}{
						"byteStart": len(string(runes[:start])),
						"byteEnd":   len(string(runes[:j])),
					},
					"features": []map[string]interface{}{
						{
							"$type": "app.bsky.richtext.facet#tag",
							"tag":   tag,
						},
					},
				})
			}
		}
	}

	return facets
}

// buildCaption assembles the post text from caption and hashtags.
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
