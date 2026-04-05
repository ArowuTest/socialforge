// Package tiktok implements the SocialForge platform adapter for TikTok using
// the TikTok for Developers API v2 with PKCE OAuth 2.0.
//
// Flow summary:
//  1. GetAuthURL   – builds the TikTok v2 authorize URL with PKCE code_challenge.
//  2. ExchangeCode – exchanges code + verifier for tokens, fetches user info.
//  3. RefreshToken – uses the refresh token to obtain a new access token.
//  4. Post         – init upload → upload chunks → publish with caption.
package tiktok

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/config"
	"github.com/socialforge/backend/internal/crypto"
	"github.com/socialforge/backend/internal/models"
)

const (
	tiktokAuthURL    = "https://www.tiktok.com/v2/auth/authorize"
	tiktokTokenURL   = "https://open.tiktokapis.com/v2/oauth/token/"
	tiktokUserURL    = "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url"
	tiktokUploadInit = "https://open.tiktokapis.com/v2/post/publish/video/init/"
	tiktokPublish    = "https://open.tiktokapis.com/v2/post/publish/status/fetch/"

	chunkSize = 10 * 1024 * 1024 // 10 MB per chunk
)

// PKCEParams holds the PKCE verifier and challenge for the OAuth flow.
type PKCEParams struct {
	CodeVerifier  string
	CodeChallenge string
}

// Client is the TikTok platform adapter.
type Client struct {
	cfg    config.OAuthPlatformConfig
	secret string
	db     *gorm.DB
	log    *zap.Logger
	http   *http.Client
}

// New creates a new TikTok Client.
func New(cfg config.OAuthPlatformConfig, encryptionSecret string, db *gorm.DB, log *zap.Logger) *Client {
	return &Client{
		cfg:    cfg,
		secret: encryptionSecret,
		db:     db,
		log:    log.Named("tiktok"),
		http:   &http.Client{Timeout: 60 * time.Second},
	}
}

// GeneratePKCE generates a PKCE code_verifier and its S256 code_challenge.
// The verifier must be stored server-side (e.g. Redis keyed by state) so it can
// be retrieved during ExchangeCode.
func GeneratePKCE() (*PKCEParams, error) {
	verifierBytes := make([]byte, 32)
	if _, err := rand.Read(verifierBytes); err != nil {
		return nil, fmt.Errorf("tiktok: generate pkce verifier: %w", err)
	}
	verifier := base64.RawURLEncoding.EncodeToString(verifierBytes)

	h := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(h[:])

	return &PKCEParams{
		CodeVerifier:  verifier,
		CodeChallenge: challenge,
	}, nil
}

// GetAuthURL returns the TikTok OAuth 2.0 authorization URL with PKCE.
// codeChallenge should come from GeneratePKCE(); store the verifier in a
// short-lived cache keyed by state so ExchangeCode can retrieve it.
func (c *Client) GetAuthURL(workspaceID uuid.UUID, state, codeChallenge string) string {
	params := url.Values{
		"client_key":             {c.cfg.ClientID},
		"response_type":          {"code"},
		"scope":                  {strings.Join(c.cfg.Scopes, ",")},
		"redirect_uri":           {c.cfg.RedirectURL},
		"state":                  {state},
		"code_challenge":         {codeChallenge},
		"code_challenge_method":  {"S256"},
	}
	authURL := tiktokAuthURL + "?" + params.Encode()
	c.log.Info("generated TikTok auth URL", zap.String("workspace_id", workspaceID.String()))
	return authURL
}

// ExchangeCode exchanges the authorization code for access/refresh tokens and
// persists a SocialAccount for the workspace.
func (c *Client) ExchangeCode(ctx context.Context, code, codeVerifier string, workspaceID uuid.UUID) (*models.SocialAccount, error) {
	tokenResp, err := c.exchangeCodeForTokens(ctx, code, codeVerifier)
	if err != nil {
		return nil, fmt.Errorf("tiktok: exchange code: %w", err)
	}

	userInfo, err := c.fetchUserInfo(ctx, tokenResp.AccessToken)
	if err != nil {
		return nil, fmt.Errorf("tiktok: fetch user info: %w", err)
	}

	encAccess, err := crypto.Encrypt(tokenResp.AccessToken, c.secret)
	if err != nil {
		return nil, fmt.Errorf("tiktok: encrypt access token: %w", err)
	}
	encRefresh, err := crypto.Encrypt(tokenResp.RefreshToken, c.secret)
	if err != nil {
		return nil, fmt.Errorf("tiktok: encrypt refresh token: %w", err)
	}

	accessExpiry := time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second)

	account := &models.SocialAccount{
		WorkspaceID:  workspaceID,
		Platform:     models.PlatformTikTok,
		AccountID:    userInfo.OpenID,
		AccountName:  userInfo.DisplayName,
		AccountType:  "personal",
		AvatarURL:    userInfo.AvatarURL,
		AccessToken:  encAccess,
		RefreshToken: encRefresh,
		TokenExpiry:  &accessExpiry,
		Scopes:       tokenResp.Scope,
		IsActive:     true,
	}

	if err := c.db.WithContext(ctx).
		Where(models.SocialAccount{WorkspaceID: workspaceID, Platform: models.PlatformTikTok, AccountID: userInfo.OpenID}).
		Assign(*account).
		FirstOrCreate(account).Error; err != nil {
		return nil, fmt.Errorf("tiktok: upsert social account: %w", err)
	}

	c.log.Info("tiktok account connected",
		zap.String("workspace_id", workspaceID.String()),
		zap.String("open_id", userInfo.OpenID),
		zap.String("display_name", userInfo.DisplayName),
	)

	return account, nil
}

// RefreshToken uses the refresh token to obtain a fresh access token.
func (c *Client) RefreshToken(ctx context.Context, account *models.SocialAccount) error {
	refreshToken, err := crypto.Decrypt(account.RefreshToken, c.secret)
	if err != nil {
		return fmt.Errorf("tiktok: decrypt refresh token: %w", err)
	}

	params := url.Values{
		"client_key":    {c.cfg.ClientID},
		"client_secret": {c.cfg.ClientSecret},
		"grant_type":    {"refresh_token"},
		"refresh_token": {refreshToken},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tiktokTokenURL,
		strings.NewReader(params.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("tiktok: refresh token request: %w", err)
	}
	defer resp.Body.Close()

	var result tokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("tiktok: decode refresh response: %w", err)
	}
	if result.Error != "" {
		return fmt.Errorf("tiktok: refresh token error: %s – %s", result.Error, result.ErrorDescription)
	}

	encAccess, err := crypto.Encrypt(result.AccessToken, c.secret)
	if err != nil {
		return err
	}
	encRefresh, err := crypto.Encrypt(result.RefreshToken, c.secret)
	if err != nil {
		return err
	}

	expiry := time.Now().Add(time.Duration(result.ExpiresIn) * time.Second)
	if err := c.db.WithContext(ctx).Model(account).Updates(map[string]interface{}{
		"access_token":  encAccess,
		"refresh_token": encRefresh,
		"token_expiry":  expiry,
	}).Error; err != nil {
		return fmt.Errorf("tiktok: update tokens in db: %w", err)
	}

	account.AccessToken = encAccess
	account.RefreshToken = encRefresh
	account.TokenExpiry = &expiry

	c.log.Info("tiktok token refreshed",
		zap.String("account_id", account.ID.String()),
		zap.Time("new_expiry", expiry),
	)
	return nil
}

// Post uploads a video to TikTok and publishes it with caption + hashtags.
// The PostRequest.MediaURLs[0] must be a publicly accessible video file URL, OR
// the local file path prefixed with "file://".
func (c *Client) Post(ctx context.Context, account *models.SocialAccount, req *models.PostRequest) (*models.PostResult, error) {
	if len(req.MediaURLs) == 0 {
		return nil, fmt.Errorf("tiktok: post requires at least one video URL")
	}

	token, err := crypto.Decrypt(account.AccessToken, c.secret)
	if err != nil {
		return nil, fmt.Errorf("tiktok: decrypt token: %w", err)
	}

	videoPath := req.MediaURLs[0]
	isLocal := strings.HasPrefix(videoPath, "file://")
	if isLocal {
		videoPath = strings.TrimPrefix(videoPath, "file://")
	}

	caption := buildCaption(req.Caption, req.Hashtags)

	if isLocal {
		return c.uploadLocalVideo(ctx, token, videoPath, caption)
	}
	return c.uploadFromURL(ctx, token, videoPath, caption)
}

// uploadFromURL uses the PULL_FROM_URL upload source.
func (c *Client) uploadFromURL(ctx context.Context, token, videoURL, caption string) (*models.PostResult, error) {
	initPayload := map[string]interface{}{
		"post_info": map[string]interface{}{
			"title":        caption,
			"privacy_level": "PUBLIC_TO_EVERYONE",
		},
		"source_info": map[string]interface{}{
			"source":    "PULL_FROM_URL",
			"video_url": videoURL,
		},
	}

	publishID, err := c.initUpload(ctx, token, initPayload)
	if err != nil {
		return nil, err
	}

	// Poll for completion.
	postID, err := c.pollPublishStatus(ctx, token, publishID)
	if err != nil {
		return nil, err
	}

	c.log.Info("tiktok video published",
		zap.String("publish_id", publishID),
		zap.String("post_id", postID),
	)

	return &models.PostResult{PlatformPostID: postID}, nil
}

// uploadLocalVideo uses the FILE_UPLOAD source: opens the file, reads its size,
// inits the upload to get a chunk upload URL, streams the file, then publishes.
func (c *Client) uploadLocalVideo(ctx context.Context, token, filePath, caption string) (*models.PostResult, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("tiktok: open video file: %w", err)
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		return nil, fmt.Errorf("tiktok: stat video file: %w", err)
	}
	fileSize := stat.Size()

	totalChunks := int((fileSize + int64(chunkSize) - 1) / int64(chunkSize))

	initPayload := map[string]interface{}{
		"post_info": map[string]interface{}{
			"title":         caption,
			"privacy_level": "PUBLIC_TO_EVERYONE",
		},
		"source_info": map[string]interface{}{
			"source":       "FILE_UPLOAD",
			"video_size":   fileSize,
			"chunk_size":   chunkSize,
			"total_chunk_count": totalChunks,
		},
	}

	type initResp struct {
		Data struct {
			PublishID   string `json:"publish_id"`
			UploadURL   string `json:"upload_url"`
		} `json:"data"`
		Error *tiktokError `json:"error,omitempty"`
	}

	rawInit, err := c.apiPost(ctx, token, tiktokUploadInit, initPayload)
	if err != nil {
		return nil, fmt.Errorf("tiktok: init upload: %w", err)
	}

	var ir initResp
	if err := json.Unmarshal(rawInit, &ir); err != nil {
		return nil, fmt.Errorf("tiktok: decode init upload response: %w", err)
	}
	if ir.Error != nil && ir.Error.Code != "ok" {
		return nil, fmt.Errorf("tiktok: init upload API error: %s – %s", ir.Error.Code, ir.Error.Message)
	}

	// Upload file in chunks.
	buf := make([]byte, chunkSize)
	for i := 0; i < totalChunks; i++ {
		n, readErr := io.ReadFull(f, buf)
		if readErr != nil && readErr != io.ErrUnexpectedEOF {
			return nil, fmt.Errorf("tiktok: read chunk %d: %w", i, readErr)
		}
		chunk := buf[:n]

		startByte := int64(i) * int64(chunkSize)
		endByte := startByte + int64(n) - 1

		chunkReq, err := http.NewRequestWithContext(ctx, http.MethodPut, ir.Data.UploadURL, bytes.NewReader(chunk))
		if err != nil {
			return nil, err
		}
		chunkReq.Header.Set("Content-Type", "video/mp4")
		chunkReq.Header.Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", startByte, endByte, fileSize))
		chunkReq.ContentLength = int64(n)

		chunkResp, err := c.http.Do(chunkReq)
		if err != nil {
			return nil, fmt.Errorf("tiktok: upload chunk %d: %w", i, err)
		}
		chunkResp.Body.Close()

		if chunkResp.StatusCode >= 400 {
			return nil, fmt.Errorf("tiktok: chunk %d upload HTTP %d", i, chunkResp.StatusCode)
		}

		c.log.Debug("tiktok chunk uploaded",
			zap.Int("chunk", i+1),
			zap.Int("total", totalChunks),
		)
	}

	// Poll for publish completion.
	postID, err := c.pollPublishStatus(ctx, token, ir.Data.PublishID)
	if err != nil {
		return nil, err
	}

	c.log.Info("tiktok local video published",
		zap.String("publish_id", ir.Data.PublishID),
		zap.String("post_id", postID),
	)

	return &models.PostResult{PlatformPostID: postID}, nil
}

// pollPublishStatus polls the publish status endpoint until the video is
// published or an error occurs.
func (c *Client) pollPublishStatus(ctx context.Context, token, publishID string) (string, error) {
	type statusResp struct {
		Data struct {
			Status        string `json:"status"`
			PublicationID string `json:"publicid"`
			FailReason    string `json:"fail_reason"`
		} `json:"data"`
		Error *tiktokError `json:"error,omitempty"`
	}

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	deadline := time.Now().Add(10 * time.Minute)

	for {
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-ticker.C:
			if time.Now().After(deadline) {
				return "", fmt.Errorf("tiktok: publish timed out for publish_id %s", publishID)
			}

			payload := map[string]string{"publish_id": publishID}
			raw, err := c.apiPost(ctx, token, tiktokPublish, payload)
			if err != nil {
				c.log.Warn("tiktok: poll status request failed", zap.Error(err))
				continue
			}

			var sr statusResp
			if err := json.Unmarshal(raw, &sr); err != nil {
				continue
			}
			if sr.Error != nil && sr.Error.Code != "ok" {
				return "", fmt.Errorf("tiktok: poll status API error: %s – %s", sr.Error.Code, sr.Error.Message)
			}

			switch sr.Data.Status {
			case "PUBLISH_COMPLETE":
				return sr.Data.PublicationID, nil
			case "FAILED":
				return "", fmt.Errorf("tiktok: publish failed: %s", sr.Data.FailReason)
			}
			// PROCESSING_UPLOAD, PROCESSING_DOWNLOAD, etc. — keep polling.
		}
	}
}

// initUpload calls the init endpoint and returns the raw JSON body bytes.
func (c *Client) initUpload(ctx context.Context, token string, payload map[string]interface{}) (string, error) {
	type initResp struct {
		Data struct {
			PublishID string `json:"publish_id"`
		} `json:"data"`
		Error *tiktokError `json:"error,omitempty"`
	}

	raw, err := c.apiPost(ctx, token, tiktokUploadInit, payload)
	if err != nil {
		return "", err
	}

	var ir initResp
	if err := json.Unmarshal(raw, &ir); err != nil {
		return "", err
	}
	if ir.Error != nil && ir.Error.Code != "ok" {
		return "", fmt.Errorf("tiktok: init upload error: %s – %s", ir.Error.Code, ir.Error.Message)
	}
	return ir.Data.PublishID, nil
}

// apiPost sends a JSON POST request to the TikTok API with Bearer auth.
func (c *Client) apiPost(ctx context.Context, token, endpoint string, payload interface{}) ([]byte, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json; charset=UTF-8")

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
		c.log.Error("tiktok API HTTP error",
			zap.Int("status", resp.StatusCode),
			zap.String("body", string(respBody)),
		)
		return nil, fmt.Errorf("tiktok: HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	return respBody, nil
}

// exchangeCodeForTokens calls the token endpoint with the authorization code.
func (c *Client) exchangeCodeForTokens(ctx context.Context, code, codeVerifier string) (*tokenResponse, error) {
	params := url.Values{
		"client_key":    {c.cfg.ClientID},
		"client_secret": {c.cfg.ClientSecret},
		"code":          {code},
		"grant_type":    {"authorization_code"},
		"redirect_uri":  {c.cfg.RedirectURL},
		"code_verifier": {codeVerifier},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tiktokTokenURL,
		strings.NewReader(params.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var tr tokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		return nil, err
	}
	if tr.Error != "" {
		return nil, fmt.Errorf("tiktok token error: %s – %s", tr.Error, tr.ErrorDescription)
	}
	return &tr, nil
}

// fetchUserInfo calls the user info endpoint.
func (c *Client) fetchUserInfo(ctx context.Context, token string) (*tiktokUser, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, tiktokUserURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Data struct {
			User tiktokUser `json:"user"`
		} `json:"data"`
		Error *tiktokError `json:"error,omitempty"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	if result.Error != nil && result.Error.Code != "ok" {
		return nil, fmt.Errorf("tiktok user info error: %s – %s", result.Error.Code, result.Error.Message)
	}
	return &result.Data.User, nil
}

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
	return caption + " " + strings.Join(tags, " ")
}

// ─── response types ──────────────────────────────────────────────────────────

type tokenResponse struct {
	AccessToken      string `json:"access_token"`
	RefreshToken     string `json:"refresh_token"`
	ExpiresIn        int64  `json:"expires_in"`
	RefreshExpiresIn int64  `json:"refresh_expires_in"`
	TokenType        string `json:"token_type"`
	Scope            string `json:"scope"`
	OpenID           string `json:"open_id"`
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description"`
}

type tiktokUser struct {
	OpenID      string `json:"open_id"`
	DisplayName string `json:"display_name"`
	AvatarURL   string `json:"avatar_url"`
}

type tiktokError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	LogID   string `json:"log_id"`
}
