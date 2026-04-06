// Package twitter implements the SocialForge platform adapter for Twitter/X
// using the Twitter API v2 with OAuth 2.0 PKCE.
//
// Flow summary:
//  1. GetAuthURL   – generates a PKCE pair, stores the verifier in Redis, and
//                    returns the authorization URL with code_challenge.
//  2. ExchangeCode – retrieves the verifier from Redis, exchanges code+verifier
//                    for tokens, fetches user info, persists SocialAccount.
//  3. RefreshToken – uses the refresh_token grant to obtain a new access token.
//  4. Post         – dispatches to text, image/video, or thread helpers.
package twitter

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/config"
	"github.com/socialforge/backend/internal/crypto"
	"github.com/socialforge/backend/internal/models"
)

const (
	twitterAuthURL     = "https://twitter.com/i/oauth2/authorize"
	twitterTokenURL    = "https://api.twitter.com/2/oauth2/token"
	twitterUserURL     = "https://api.twitter.com/2/users/me"
	twitterTweetURL    = "https://api.twitter.com/2/tweets"
	twitterMediaURL    = "https://upload.twitter.com/1/media/upload.json"
	pkceKeyPrefix      = "twitter:pkce:"
	pkceTTL            = 10 * time.Minute
	mediaChunkSize     = 5 * 1024 * 1024 // 5 MB
)

// PostRequest carries the data needed to publish a Twitter post.
type PostRequest struct {
	Content   string
	MediaURLs []string
	PostType  string // "text" | "image" | "video" | "thread"
	// Thread: each element is one tweet in the thread (first is req.Content).
	ThreadTweets []string
}

// Client is the Twitter platform adapter.
type Client struct {
	cfg    config.OAuthPlatformConfig
	secret string
	db     *gorm.DB
	redis  *redis.Client
	log    *zap.Logger
	http   *http.Client
}

// New creates a new Twitter Client.
func New(cfg config.OAuthPlatformConfig, encryptionSecret string, db *gorm.DB, redisClient *redis.Client, log *zap.Logger) *Client {
	return &Client{
		cfg:    cfg,
		secret: encryptionSecret,
		db:     db,
		redis:  redisClient,
		log:    log.Named("twitter"),
		http:   &http.Client{Timeout: 60 * time.Second},
	}
}

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

// generatePKCE creates a 32-byte random code_verifier and its S256 code_challenge.
func generatePKCE() (verifier, challenge string, err error) {
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return "", "", fmt.Errorf("twitter: generate PKCE verifier: %w", err)
	}
	verifier = base64.RawURLEncoding.EncodeToString(b)
	h := sha256.Sum256([]byte(verifier))
	challenge = base64.RawURLEncoding.EncodeToString(h[:])
	return verifier, challenge, nil
}

// GetAuthURL generates a PKCE pair, stores the verifier in Redis keyed by
// state, and returns the OAuth 2.0 authorization URL.
func (c *Client) GetAuthURL(workspaceID uuid.UUID, state string) (string, error) {
	verifier, challenge, err := generatePKCE()
	if err != nil {
		return "", err
	}

	redisKey := pkceKeyPrefix + state
	if err := c.redis.Set(context.Background(), redisKey, verifier, pkceTTL).Err(); err != nil {
		return "", fmt.Errorf("twitter: store PKCE verifier in Redis: %w", err)
	}

	params := url.Values{
		"response_type":         {"code"},
		"client_id":             {c.cfg.ClientID},
		"redirect_uri":          {c.cfg.RedirectURL},
		"scope":                 {strings.Join([]string{"tweet.read", "tweet.write", "users.read", "offline.access"}, " ")},
		"state":                 {state},
		"code_challenge":        {challenge},
		"code_challenge_method": {"S256"},
	}

	authURL := twitterAuthURL + "?" + params.Encode()
	c.log.Info("generated Twitter auth URL", zap.String("workspace_id", workspaceID.String()))
	return authURL, nil
}

// ExchangeCode retrieves the PKCE verifier from Redis and exchanges the
// authorization code for tokens.
func (c *Client) ExchangeCode(
	ctx context.Context,
	code, state string,
	workspaceID uuid.UUID,
) (*models.SocialAccount, error) {
	redisKey := pkceKeyPrefix + state
	verifier, err := c.redis.GetDel(ctx, redisKey).Result()
	if err != nil {
		return nil, fmt.Errorf("twitter: retrieve PKCE verifier (state=%s): %w", state, err)
	}
	if verifier == "" {
		return nil, fmt.Errorf("twitter: PKCE verifier not found or expired for state %s", state)
	}

	tokenResp, err := c.exchangeCodePKCE(ctx, code, verifier)
	if err != nil {
		return nil, fmt.Errorf("twitter: PKCE token exchange: %w", err)
	}

	userInfo, err := c.fetchUserInfo(ctx, tokenResp.AccessToken)
	if err != nil {
		return nil, fmt.Errorf("twitter: fetch user info: %w", err)
	}

	encAccess, err := crypto.Encrypt(tokenResp.AccessToken, c.secret)
	if err != nil {
		return nil, fmt.Errorf("twitter: encrypt access token: %w", err)
	}

	encRefresh := ""
	if tokenResp.RefreshToken != "" {
		encRefresh, err = crypto.Encrypt(tokenResp.RefreshToken, c.secret)
		if err != nil {
			return nil, fmt.Errorf("twitter: encrypt refresh token: %w", err)
		}
	}

	var expiresAt *time.Time
	if tokenResp.ExpiresIn > 0 {
		t := time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second)
		expiresAt = &t
	}

	account := &models.SocialAccount{
		WorkspaceID:   workspaceID,
		Platform:      models.PlatformTwitter,
		AccountID:     userInfo.ID,
		AccountName:   userInfo.Name,
		AccountHandle: userInfo.Username,
		AccountType:   "personal",
		AvatarURL:     userInfo.ProfileImageURL,
		AccessToken:   encAccess,
		RefreshToken:  encRefresh,
		TokenExpiresAt: expiresAt,
		Scopes:        models.StringSlice(strings.Split(tokenResp.Scope, " ")),
		IsActive:      true,
		ProfileURL:    "https://twitter.com/" + userInfo.Username,
		Metadata: models.JSONMap{
			"followers_count": userInfo.PublicMetrics.FollowersCount,
			"following_count": userInfo.PublicMetrics.FollowingCount,
			"tweet_count":     userInfo.PublicMetrics.TweetCount,
		},
	}

	if err := c.db.WithContext(ctx).
		Where(models.SocialAccount{WorkspaceID: workspaceID, Platform: models.PlatformTwitter, AccountID: userInfo.ID}).
		Assign(*account).
		FirstOrCreate(account).Error; err != nil {
		return nil, fmt.Errorf("twitter: upsert social account: %w", err)
	}

	c.log.Info("twitter account connected",
		zap.String("workspace_id", workspaceID.String()),
		zap.String("user_id", userInfo.ID),
		zap.String("username", userInfo.Username),
	)

	return account, nil
}

// RefreshToken uses the stored refresh_token to obtain a new access token.
func (c *Client) RefreshToken(ctx context.Context, account *models.SocialAccount) error {
	refreshToken, err := crypto.Decrypt(account.RefreshToken, c.secret)
	if err != nil {
		return fmt.Errorf("twitter: decrypt refresh token: %w", err)
	}

	params := url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {refreshToken},
		"client_id":     {c.cfg.ClientID},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, twitterTokenURL,
		strings.NewReader(params.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	// Twitter OAuth 2.0 uses Basic auth for confidential clients.
	req.SetBasicAuth(c.cfg.ClientID, c.cfg.ClientSecret)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("twitter: refresh token request: %w", err)
	}
	defer resp.Body.Close()

	var result twitterTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("twitter: decode refresh response: %w", err)
	}
	if result.Error != "" {
		return fmt.Errorf("twitter: refresh token error: %s – %s", result.Error, result.ErrorDescription)
	}

	encAccess, err := crypto.Encrypt(result.AccessToken, c.secret)
	if err != nil {
		return err
	}

	updates := map[string]interface{}{
		"access_token": encAccess,
	}

	if result.RefreshToken != "" {
		encRefresh, err := crypto.Encrypt(result.RefreshToken, c.secret)
		if err != nil {
			return err
		}
		updates["refresh_token"] = encRefresh
		account.RefreshToken = encRefresh
	}

	if result.ExpiresIn > 0 {
		expiry := time.Now().Add(time.Duration(result.ExpiresIn) * time.Second)
		updates["token_expires_at"] = expiry
		account.TokenExpiresAt = &expiry
	}

	if err := c.db.WithContext(ctx).Model(account).Updates(updates).Error; err != nil {
		return fmt.Errorf("twitter: update tokens in db: %w", err)
	}

	account.AccessToken = encAccess
	c.log.Info("twitter token refreshed", zap.String("account_id", account.ID.String()))
	return nil
}

// Post publishes content to Twitter, dispatching by PostType.
func (c *Client) Post(
	ctx context.Context,
	account *models.SocialAccount,
	req PostRequest,
) (string, error) {
	token, err := crypto.Decrypt(account.AccessToken, c.secret)
	if err != nil {
		return "", fmt.Errorf("twitter: decrypt access token: %w", err)
	}

	switch req.PostType {
	case "thread":
		return c.postThread(ctx, token, req)
	case "image":
		return c.postWithMedia(ctx, token, req, false)
	case "video":
		return c.postWithMedia(ctx, token, req, true)
	default:
		return c.postText(ctx, token, req.Content, "")
	}
}

// ─── text post ───────────────────────────────────────────────────────────────

func (c *Client) postText(ctx context.Context, token, text, replyToID string) (string, error) {
	body := map[string]interface{}{
		"text": text,
	}
	if replyToID != "" {
		body["reply"] = map[string]interface{}{
			"in_reply_to_tweet_id": replyToID,
		}
	}

	tweetID, err := c.createTweet(ctx, token, body)
	if err != nil {
		return "", fmt.Errorf("twitter: post text: %w", err)
	}

	c.log.Info("twitter text post published", zap.String("tweet_id", tweetID))
	return tweetID, nil
}

// ─── media post ──────────────────────────────────────────────────────────────

func (c *Client) postWithMedia(ctx context.Context, token string, req PostRequest, isVideo bool) (string, error) {
	mediaIDs := make([]string, 0, len(req.MediaURLs))

	for _, mediaURL := range req.MediaURLs {
		mediaBytes, contentType, err := c.fetchMediaBytes(ctx, mediaURL)
		if err != nil {
			return "", fmt.Errorf("twitter: fetch media %s: %w", mediaURL, err)
		}

		var mediaID string
		if isVideo {
			mediaID, err = c.uploadMediaChunked(ctx, token, mediaBytes, contentType)
		} else {
			mediaID, err = c.uploadMediaSimple(ctx, token, mediaBytes, contentType)
		}
		if err != nil {
			return "", fmt.Errorf("twitter: upload media: %w", err)
		}
		mediaIDs = append(mediaIDs, mediaID)
	}

	body := map[string]interface{}{
		"text": req.Content,
		"media": map[string]interface{}{
			"media_ids": mediaIDs,
		},
	}

	tweetID, err := c.createTweet(ctx, token, body)
	if err != nil {
		return "", fmt.Errorf("twitter: post with media: %w", err)
	}

	c.log.Info("twitter media post published",
		zap.String("tweet_id", tweetID),
		zap.Int("media_count", len(mediaIDs)),
	)
	return tweetID, nil
}

// ─── thread post ─────────────────────────────────────────────────────────────

func (c *Client) postThread(ctx context.Context, token string, req PostRequest) (string, error) {
	tweets := req.ThreadTweets
	if len(tweets) == 0 {
		tweets = []string{req.Content}
	} else {
		// Ensure req.Content is the first tweet.
		tweets = append([]string{req.Content}, tweets...)
	}

	var firstTweetID string
	var previousTweetID string

	for i, text := range tweets {
		body := map[string]interface{}{
			"text": text,
		}
		if previousTweetID != "" {
			body["reply"] = map[string]interface{}{
				"in_reply_to_tweet_id": previousTweetID,
			}
		}

		tweetID, err := c.createTweet(ctx, token, body)
		if err != nil {
			return "", fmt.Errorf("twitter: thread tweet %d: %w", i, err)
		}

		if i == 0 {
			firstTweetID = tweetID
		}
		previousTweetID = tweetID
	}

	c.log.Info("twitter thread published",
		zap.String("first_tweet_id", firstTweetID),
		zap.Int("tweet_count", len(tweets)),
	)
	return firstTweetID, nil
}

// ─── API helpers ─────────────────────────────────────────────────────────────

func (c *Client) createTweet(ctx context.Context, token string, body map[string]interface{}) (string, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, twitterTweetURL, bytes.NewReader(b))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("twitter: create tweet request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode >= 400 {
		c.log.Error("twitter API error",
			zap.Int("status", resp.StatusCode),
			zap.String("body", string(respBody)),
		)
		return "", fmt.Errorf("twitter: HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Data struct {
			ID   string `json:"id"`
			Text string `json:"text"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("twitter: decode tweet response: %w", err)
	}
	return result.Data.ID, nil
}

// uploadMediaSimple uploads image media using the simple (single-request) path.
func (c *Client) uploadMediaSimple(ctx context.Context, token string, data []byte, contentType string) (string, error) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)

	fw, err := mw.CreateFormField("media_data")
	if err != nil {
		return "", err
	}
	encoded := base64.StdEncoding.EncodeToString(data)
	if _, err := fw.Write([]byte(encoded)); err != nil {
		return "", err
	}

	if err := mw.WriteField("media_category", "tweet_image"); err != nil {
		return "", err
	}
	mw.Close()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, twitterMediaURL, &buf)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", mw.FormDataContentType())

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("twitter: upload image request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("twitter: upload image HTTP %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		MediaID string `json:"media_id_string"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("twitter: decode upload image response: %w", err)
	}
	return result.MediaID, nil
}

// uploadMediaChunked uploads video/gif using the chunked upload protocol:
// INIT → APPEND (chunks) → FINALIZE.
func (c *Client) uploadMediaChunked(ctx context.Context, token string, data []byte, contentType string) (string, error) {
	totalBytes := len(data)
	mediaCategory := "tweet_video"
	if strings.HasPrefix(contentType, "image/gif") {
		mediaCategory = "tweet_gif"
	}

	// ── INIT ─────────────────────────────────────────────────────────────────
	initParams := url.Values{
		"command":            {"INIT"},
		"total_bytes":        {fmt.Sprintf("%d", totalBytes)},
		"media_type":         {contentType},
		"media_category":     {mediaCategory},
	}
	initResp, err := c.mediaCommand(ctx, token, initParams)
	if err != nil {
		return "", fmt.Errorf("twitter: media INIT: %w", err)
	}

	var initResult struct {
		MediaID string `json:"media_id_string"`
	}
	if err := json.Unmarshal(initResp, &initResult); err != nil {
		return "", fmt.Errorf("twitter: decode media INIT response: %w", err)
	}
	mediaID := initResult.MediaID

	// ── APPEND chunks ─────────────────────────────────────────────────────────
	segmentIndex := 0
	for offset := 0; offset < totalBytes; offset += mediaChunkSize {
		end := offset + mediaChunkSize
		if end > totalBytes {
			end = totalBytes
		}
		chunk := data[offset:end]

		appendParams := url.Values{
			"command":       {"APPEND"},
			"media_id":      {mediaID},
			"segment_index": {fmt.Sprintf("%d", segmentIndex)},
			"media_data":    {base64.StdEncoding.EncodeToString(chunk)},
		}

		if _, err := c.mediaCommand(ctx, token, appendParams); err != nil {
			return "", fmt.Errorf("twitter: media APPEND segment %d: %w", segmentIndex, err)
		}
		segmentIndex++
	}

	// ── FINALIZE ──────────────────────────────────────────────────────────────
	finalizeParams := url.Values{
		"command":  {"FINALIZE"},
		"media_id": {mediaID},
	}
	finalizeResp, err := c.mediaCommand(ctx, token, finalizeParams)
	if err != nil {
		return "", fmt.Errorf("twitter: media FINALIZE: %w", err)
	}

	var finalizeResult struct {
		MediaID       string `json:"media_id_string"`
		ProcessingInfo *struct {
			State          string `json:"state"`
			CheckAfterSecs int    `json:"check_after_secs"`
		} `json:"processing_info"`
	}
	if err := json.Unmarshal(finalizeResp, &finalizeResult); err != nil {
		return "", fmt.Errorf("twitter: decode FINALIZE response: %w", err)
	}

	// If processing is needed, poll until done.
	if finalizeResult.ProcessingInfo != nil {
		if err := c.waitForMediaProcessing(ctx, token, mediaID); err != nil {
			return "", err
		}
	}

	c.log.Info("twitter media uploaded",
		zap.String("media_id", mediaID),
		zap.Int("segments", segmentIndex),
	)
	return mediaID, nil
}

// mediaCommand sends a POST to the v1.1 media upload endpoint.
func (c *Client) mediaCommand(ctx context.Context, token string, params url.Values) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, twitterMediaURL,
		strings.NewReader(params.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	// APPEND returns 204 No Content on success.
	if resp.StatusCode == http.StatusNoContent {
		return []byte("{}"), nil
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("twitter: media command HTTP %d: %s", resp.StatusCode, string(body))
	}
	return body, nil
}

// waitForMediaProcessing polls the STATUS command until the media is ready.
func (c *Client) waitForMediaProcessing(ctx context.Context, token, mediaID string) error {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	deadline := time.Now().Add(5 * time.Minute)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if time.Now().After(deadline) {
				return fmt.Errorf("twitter: timed out waiting for media %s to process", mediaID)
			}

			statusURL := fmt.Sprintf("%s?command=STATUS&media_id=%s", twitterMediaURL, mediaID)
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, statusURL, nil)
			if err != nil {
				c.log.Warn("twitter: media status request error", zap.Error(err))
				continue
			}
			req.Header.Set("Authorization", "Bearer "+token)

			resp, err := c.http.Do(req)
			if err != nil {
				c.log.Warn("twitter: media status request failed", zap.Error(err))
				continue
			}

			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()

			var status struct {
				ProcessingInfo struct {
					State        string `json:"state"`
					ProgressPercent int `json:"progress_percent"`
				} `json:"processing_info"`
			}
			if err := json.Unmarshal(body, &status); err != nil {
				continue
			}

			switch status.ProcessingInfo.State {
			case "succeeded":
				return nil
			case "failed":
				return fmt.Errorf("twitter: media processing failed for media_id %s", mediaID)
			}
			// "in_progress" or "pending" — keep polling.
		}
	}
}

// fetchMediaBytes downloads media from a public URL, returning bytes + content-type.
func (c *Client) fetchMediaBytes(ctx context.Context, mediaURL string) ([]byte, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, mediaURL, nil)
	if err != nil {
		return nil, "", err
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, "", fmt.Errorf("twitter: fetch media HTTP %d from %s", resp.StatusCode, mediaURL)
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", err
	}
	return data, contentType, nil
}

// exchangeCodePKCE exchanges the authorization code + PKCE verifier for tokens.
func (c *Client) exchangeCodePKCE(ctx context.Context, code, verifier string) (*twitterTokenResponse, error) {
	params := url.Values{
		"code":          {code},
		"grant_type":    {"authorization_code"},
		"redirect_uri":  {c.cfg.RedirectURL},
		"code_verifier": {verifier},
		"client_id":     {c.cfg.ClientID},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, twitterTokenURL,
		strings.NewReader(params.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	// Twitter OAuth 2.0 confidential clients use Basic auth.
	if c.cfg.ClientSecret != "" {
		req.SetBasicAuth(c.cfg.ClientID, c.cfg.ClientSecret)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("twitter: token exchange request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("twitter: token exchange HTTP %d: %s", resp.StatusCode, string(body))
	}

	var tr twitterTokenResponse
	if err := json.Unmarshal(body, &tr); err != nil {
		return nil, fmt.Errorf("twitter: decode token response: %w", err)
	}
	if tr.Error != "" {
		return nil, fmt.Errorf("twitter: token error: %s – %s", tr.Error, tr.ErrorDescription)
	}
	return &tr, nil
}

// fetchUserInfo calls the v2 /users/me endpoint.
func (c *Client) fetchUserInfo(ctx context.Context, token string) (*twitterUser, error) {
	reqURL := twitterUserURL + "?user.fields=profile_image_url,public_metrics"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

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
		return nil, fmt.Errorf("twitter: fetch user HTTP %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Data twitterUser `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("twitter: decode user response: %w", err)
	}
	return &result.Data, nil
}

// ─── response types ──────────────────────────────────────────────────────────

type twitterTokenResponse struct {
	AccessToken      string `json:"access_token"`
	RefreshToken     string `json:"refresh_token"`
	ExpiresIn        int64  `json:"expires_in"`
	Scope            string `json:"scope"`
	TokenType        string `json:"token_type"`
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description"`
}

type twitterUser struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Username        string `json:"username"`
	ProfileImageURL string `json:"profile_image_url"`
	PublicMetrics   struct {
		FollowersCount int `json:"followers_count"`
		FollowingCount int `json:"following_count"`
		TweetCount     int `json:"tweet_count"`
	} `json:"public_metrics"`
}
