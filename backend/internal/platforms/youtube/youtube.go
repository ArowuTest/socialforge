// Package youtube implements the SocialForge platform adapter for YouTube using
// the YouTube Data API v3 with Google OAuth 2.0.
//
// Flow summary:
//  1. GetAuthURL   – builds the Google OAuth consent URL with YouTube scopes.
//  2. ExchangeCode – exchanges code for tokens, fetches channel info.
//  3. RefreshToken – uses the offline refresh token via Google's token endpoint.
//  4. Post         – resumable upload flow for video/shorts with metadata.
package youtube

import (
	"bytes"
	"context"
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
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/config"
	"github.com/socialforge/backend/internal/crypto"
	"github.com/socialforge/backend/internal/models"
)

const (
	youtubeAPIBase        = "https://www.googleapis.com/youtube/v3"
	youtubeUploadBase     = "https://www.googleapis.com/upload/youtube/v3"
	googleTokenURL        = "https://oauth2.googleapis.com/token"
	resumableUploadChunk  = 8 * 1024 * 1024 // 8 MB (must be multiple of 256 KB)
)

// Client is the YouTube platform adapter.
type Client struct {
	cfg    config.OAuthPlatformConfig
	secret string
	db     *gorm.DB
	log    *zap.Logger
	http   *http.Client
}

// New creates a new YouTube Client.
func New(cfg config.OAuthPlatformConfig, encryptionSecret string, db *gorm.DB, log *zap.Logger) *Client {
	return &Client{
		cfg:    cfg,
		secret: encryptionSecret,
		db:     db,
		log:    log.Named("youtube"),
		http:   &http.Client{Timeout: 120 * time.Second},
	}
}

func (c *Client) oauthConfig() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     c.cfg.ClientID,
		ClientSecret: c.cfg.ClientSecret,
		RedirectURL:  c.cfg.RedirectURL,
		Scopes: []string{
			"https://www.googleapis.com/auth/youtube.upload",
			"https://www.googleapis.com/auth/youtube.readonly",
		},
		Endpoint: google.Endpoint,
	}
}

// GetAuthURL returns the Google OAuth consent URL for YouTube permissions.
func (c *Client) GetAuthURL(workspaceID uuid.UUID, state string) string {
	conf := c.oauthConfig()
	authURL := conf.AuthCodeURL(state,
		oauth2.AccessTypeOffline,
		oauth2.SetAuthURLParam("prompt", "consent"), // force refresh token issuance
	)
	c.log.Info("generated YouTube auth URL", zap.String("workspace_id", workspaceID.String()))
	return authURL
}

// ExchangeCode exchanges the authorization code for tokens and saves the account.
func (c *Client) ExchangeCode(ctx context.Context, code string, workspaceID uuid.UUID) (*models.SocialAccount, error) {
	conf := c.oauthConfig()

	tok, err := conf.Exchange(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("youtube: exchange code: %w", err)
	}

	channel, err := c.fetchChannel(ctx, tok.AccessToken)
	if err != nil {
		return nil, fmt.Errorf("youtube: fetch channel: %w", err)
	}

	encAccess, err := crypto.Encrypt(tok.AccessToken, c.secret)
	if err != nil {
		return nil, fmt.Errorf("youtube: encrypt access token: %w", err)
	}

	var encRefresh string
	if tok.RefreshToken != "" {
		encRefresh, err = crypto.Encrypt(tok.RefreshToken, c.secret)
		if err != nil {
			return nil, fmt.Errorf("youtube: encrypt refresh token: %w", err)
		}
	}

	expiry := tok.Expiry

	account := &models.SocialAccount{
		WorkspaceID:  workspaceID,
		Platform:     models.PlatformYouTube,
		AccountID:    channel.ID,
		AccountName:  channel.Snippet.Title,
		AccountType:  "channel",
		AvatarURL:    channel.Snippet.Thumbnails.Default.URL,
		AccessToken:  encAccess,
		RefreshToken: encRefresh,
		TokenExpiry:  &expiry,
		Scopes:       strings.Join(c.cfg.Scopes, " "),
		IsActive:     true,
	}

	if err := c.db.WithContext(ctx).
		Where(models.SocialAccount{WorkspaceID: workspaceID, Platform: models.PlatformYouTube, AccountID: channel.ID}).
		Assign(*account).
		FirstOrCreate(account).Error; err != nil {
		return nil, fmt.Errorf("youtube: upsert social account: %w", err)
	}

	c.log.Info("youtube account connected",
		zap.String("workspace_id", workspaceID.String()),
		zap.String("channel_id", channel.ID),
		zap.String("channel_name", channel.Snippet.Title),
	)

	return account, nil
}

// RefreshToken refreshes the YouTube access token using the stored refresh token.
func (c *Client) RefreshToken(ctx context.Context, account *models.SocialAccount) error {
	if account.RefreshToken == "" {
		return fmt.Errorf("youtube: no refresh token stored for account %s", account.ID)
	}

	refreshToken, err := crypto.Decrypt(account.RefreshToken, c.secret)
	if err != nil {
		return fmt.Errorf("youtube: decrypt refresh token: %w", err)
	}

	params := url.Values{
		"client_id":     {c.cfg.ClientID},
		"client_secret": {c.cfg.ClientSecret},
		"refresh_token": {refreshToken},
		"grant_type":    {"refresh_token"},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, googleTokenURL,
		strings.NewReader(params.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("youtube: refresh token request: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int64  `json:"expires_in"`
		TokenType   string `json:"token_type"`
		Error       string `json:"error"`
		ErrorDesc   string `json:"error_description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("youtube: decode refresh response: %w", err)
	}
	if result.Error != "" {
		return fmt.Errorf("youtube: refresh token error: %s – %s", result.Error, result.ErrorDesc)
	}

	encAccess, err := crypto.Encrypt(result.AccessToken, c.secret)
	if err != nil {
		return err
	}

	expiry := time.Now().Add(time.Duration(result.ExpiresIn) * time.Second)
	if err := c.db.WithContext(ctx).Model(account).Updates(map[string]interface{}{
		"access_token": encAccess,
		"token_expiry": expiry,
	}).Error; err != nil {
		return fmt.Errorf("youtube: update token in db: %w", err)
	}

	account.AccessToken = encAccess
	account.TokenExpiry = &expiry

	c.log.Info("youtube token refreshed",
		zap.String("account_id", account.ID.String()),
		zap.Time("new_expiry", expiry),
	)
	return nil
}

// Post uploads a video or Short to YouTube using the resumable upload API.
func (c *Client) Post(ctx context.Context, account *models.SocialAccount, req *models.PostRequest) (*models.PostResult, error) {
	if len(req.MediaURLs) == 0 {
		return nil, fmt.Errorf("youtube: post requires a video URL or local file path")
	}

	token, err := crypto.Decrypt(account.AccessToken, c.secret)
	if err != nil {
		return nil, fmt.Errorf("youtube: decrypt token: %w", err)
	}

	videoPath := req.MediaURLs[0]
	isLocal := strings.HasPrefix(videoPath, "file://") || (!strings.HasPrefix(videoPath, "http"))
	if strings.HasPrefix(videoPath, "file://") {
		videoPath = strings.TrimPrefix(videoPath, "file://")
	}

	// Build video metadata.
	privacyStatus := req.Privacy
	if privacyStatus == "" {
		privacyStatus = "public"
	}

	tags := req.Tags
	title := req.Title
	if title == "" {
		title = req.Caption
	}
	description := req.Description
	if description == "" {
		description = req.Caption
	}

	// For Shorts: force vertical category; real categorisation happens via metadata.
	metadata := map[string]interface{}{
		"snippet": map[string]interface{}{
			"title":       title,
			"description": description,
			"tags":        tags,
			"categoryId":  "22", // People & Blogs — change per use case
		},
		"status": map[string]interface{}{
			"privacyStatus":           privacyStatus,
			"selfDeclaredMadeForKids": false,
		},
	}

	var videoID string
	if isLocal {
		videoID, err = c.resumableUploadLocal(ctx, token, videoPath, metadata)
	} else {
		videoID, err = c.resumableUploadFromURL(ctx, token, videoPath, metadata)
	}
	if err != nil {
		return nil, err
	}

	postURL := fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID)
	c.log.Info("youtube video published",
		zap.String("video_id", videoID),
		zap.String("channel_id", account.AccountID),
	)

	return &models.PostResult{
		PlatformPostID: videoID,
		PostURL:        postURL,
	}, nil
}

// ─── resumable upload helpers ────────────────────────────────────────────────

// resumableUploadLocal initiates a resumable upload session and streams the
// local file in chunks to avoid loading it all into memory.
func (c *Client) resumableUploadLocal(ctx context.Context, token, filePath string, metadata map[string]interface{}) (string, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return "", fmt.Errorf("youtube: open video file: %w", err)
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		return "", fmt.Errorf("youtube: stat video file: %w", err)
	}
	fileSize := stat.Size()

	// Step 1: initiate resumable session.
	uploadURL, err := c.initiateResumableSession(ctx, token, fileSize, metadata)
	if err != nil {
		return "", err
	}

	// Step 2: stream chunks.
	videoID, err := c.streamChunks(ctx, f, uploadURL, fileSize)
	if err != nil {
		return "", err
	}
	return videoID, nil
}

// resumableUploadFromURL downloads the video to a temp file and then uploads it.
func (c *Client) resumableUploadFromURL(ctx context.Context, token, videoURL string, metadata map[string]interface{}) (string, error) {
	// Download to temp file.
	resp, err := http.Get(videoURL) //nolint:noctx // URL fetch OK outside tight deadline
	if err != nil {
		return "", fmt.Errorf("youtube: download video: %w", err)
	}
	defer resp.Body.Close()

	tmp, err := os.CreateTemp("", "yt-upload-*.mp4")
	if err != nil {
		return "", fmt.Errorf("youtube: create temp file: %w", err)
	}
	defer os.Remove(tmp.Name())
	defer tmp.Close()

	if _, err := io.Copy(tmp, resp.Body); err != nil {
		return "", fmt.Errorf("youtube: write temp file: %w", err)
	}
	if _, err := tmp.Seek(0, io.SeekStart); err != nil {
		return "", err
	}

	stat, _ := tmp.Stat()
	fileSize := stat.Size()

	uploadURL, err := c.initiateResumableSession(ctx, token, fileSize, metadata)
	if err != nil {
		return "", err
	}
	return c.streamChunks(ctx, tmp, uploadURL, fileSize)
}

// initiateResumableSession posts the video metadata to get the upload URL.
func (c *Client) initiateResumableSession(ctx context.Context, token string, fileSize int64, metadata map[string]interface{}) (string, error) {
	metaJSON, err := json.Marshal(metadata)
	if err != nil {
		return "", err
	}

	endpoint := fmt.Sprintf("%s/videos?uploadType=resumable&part=snippet,status", youtubeUploadBase)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(metaJSON))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json; charset=UTF-8")
	req.Header.Set("X-Upload-Content-Type", "video/mp4")
	req.Header.Set("X-Upload-Content-Length", fmt.Sprintf("%d", fileSize))

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("youtube: initiate resumable session: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("youtube: initiate upload HTTP %d: %s", resp.StatusCode, string(body))
	}

	uploadURL := resp.Header.Get("Location")
	if uploadURL == "" {
		return "", fmt.Errorf("youtube: missing Location header in initiate response")
	}
	return uploadURL, nil
}

// streamChunks uploads the file to the resumable upload URL in chunks and
// returns the resulting video ID.
func (c *Client) streamChunks(ctx context.Context, r io.ReadSeeker, uploadURL string, fileSize int64) (string, error) {
	buf := make([]byte, resumableUploadChunk)
	var offset int64

	for {
		n, readErr := io.ReadFull(r, buf)
		if n == 0 {
			break
		}
		if readErr != nil && readErr != io.ErrUnexpectedEOF {
			return "", fmt.Errorf("youtube: read chunk at offset %d: %w", offset, readErr)
		}

		chunk := buf[:n]
		endByte := offset + int64(n) - 1
		isLast := readErr == io.ErrUnexpectedEOF || endByte == fileSize-1

		req, err := http.NewRequestWithContext(ctx, http.MethodPut, uploadURL, bytes.NewReader(chunk))
		if err != nil {
			return "", err
		}
		req.Header.Set("Content-Length", fmt.Sprintf("%d", n))
		req.Header.Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", offset, endByte, fileSize))

		resp, err := c.http.Do(req)
		if err != nil {
			return "", fmt.Errorf("youtube: upload chunk at offset %d: %w", offset, err)
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if isLast && resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated {
			// Final chunk; decode video ID.
			var videoResp struct {
				ID string `json:"id"`
			}
			if err := json.Unmarshal(body, &videoResp); err != nil {
				return "", fmt.Errorf("youtube: decode upload response: %w", err)
			}
			if videoResp.ID == "" {
				return "", fmt.Errorf("youtube: empty video ID in upload response")
			}
			c.log.Debug("youtube upload complete", zap.String("video_id", videoResp.ID))
			return videoResp.ID, nil
		}

		if resp.StatusCode != http.StatusPermanentRedirect && // 308 Resume Incomplete
			resp.StatusCode != http.StatusOK &&
			resp.StatusCode != http.StatusCreated {
			return "", fmt.Errorf("youtube: unexpected upload status %d: %s", resp.StatusCode, string(body))
		}

		offset += int64(n)
		c.log.Debug("youtube chunk uploaded",
			zap.Int64("offset", offset),
			zap.Int64("total", fileSize),
		)
	}

	return "", fmt.Errorf("youtube: upload loop ended without receiving video ID")
}

// ─── account helpers ─────────────────────────────────────────────────────────

func (c *Client) fetchChannel(ctx context.Context, token string) (*youtubeChannel, error) {
	endpoint := fmt.Sprintf("%s/channels?part=snippet&mine=true", youtubeAPIBase)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
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
		Items []youtubeChannel `json:"items"`
		Error *youtubeAPIError `json:"error,omitempty"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	if result.Error != nil {
		return nil, fmt.Errorf("youtube API error %d: %s", result.Error.Code, result.Error.Message)
	}
	if len(result.Items) == 0 {
		return nil, fmt.Errorf("youtube: no channel found for this account")
	}
	return &result.Items[0], nil
}

// ─── response types ──────────────────────────────────────────────────────────

type youtubeChannel struct {
	ID      string `json:"id"`
	Snippet struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		Thumbnails  struct {
			Default struct {
				URL string `json:"url"`
			} `json:"default"`
		} `json:"thumbnails"`
	} `json:"snippet"`
}

type youtubeAPIError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Status  string `json:"status"`
}
