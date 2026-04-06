// Package pinterest implements the SocialForge platform adapter for Pinterest
// using the Pinterest API v5.
//
// Flow summary:
//  1. GetAuthURL   – builds the Pinterest OAuth authorization URL.
//  2. ExchangeCode – exchanges the code for a token, fetches user account and
//                    boards, persists a SocialAccount with boards in metadata.
//  3. Post         – creates a pin on a specified board.
package pinterest

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
	pinterestAuthURL  = "https://www.pinterest.com/oauth/"
	pinterestTokenURL = "https://api.pinterest.com/v5/oauth/token"
	pinterestAPIBase  = "https://api.pinterest.com/v5"
)

// PostRequest carries the data needed to create a Pinterest pin.
type PostRequest struct {
	BoardID     string
	Title       string
	Description string
	ImageURL    string
	LinkURL     string
}

// Client is the Pinterest platform adapter.
type Client struct {
	cfg    config.OAuthPlatformConfig
	secret string
	db     *gorm.DB
	log    *zap.Logger
	http   *http.Client
}

// New creates a new Pinterest Client.
func New(cfg config.OAuthPlatformConfig, encryptionSecret string, db *gorm.DB, log *zap.Logger) *Client {
	return &Client{
		cfg:    cfg,
		secret: encryptionSecret,
		db:     db,
		log:    log.Named("pinterest"),
		http:   &http.Client{Timeout: 30 * time.Second},
	}
}

// oauthConfig returns the oauth2 configuration for Pinterest.
func (c *Client) oauthConfig() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     c.cfg.ClientID,
		ClientSecret: c.cfg.ClientSecret,
		RedirectURL:  c.cfg.RedirectURL,
		Scopes: []string{
			"boards:read",
			"pins:write",
			"user_accounts:read",
		},
		Endpoint: oauth2.Endpoint{
			AuthURL:  pinterestAuthURL,
			TokenURL: pinterestTokenURL,
		},
	}
}

// GetAuthURL returns the Pinterest OAuth authorization URL.
func (c *Client) GetAuthURL(workspaceID uuid.UUID, state string) string {
	conf := c.oauthConfig()
	authURL := conf.AuthCodeURL(state, oauth2.AccessTypeOffline)
	c.log.Info("generated Pinterest auth URL", zap.String("workspace_id", workspaceID.String()))
	return authURL
}

// ExchangeCode exchanges the authorization code for tokens, fetches user info
// and boards, then persists a SocialAccount.
func (c *Client) ExchangeCode(
	ctx context.Context,
	code, state string,
	workspaceID uuid.UUID,
) (*models.SocialAccount, error) {
	conf := c.oauthConfig()

	token, err := conf.Exchange(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("pinterest: exchange code: %w", err)
	}

	userInfo, err := c.fetchUserAccount(ctx, token.AccessToken)
	if err != nil {
		return nil, fmt.Errorf("pinterest: fetch user account: %w", err)
	}

	boards, err := c.fetchBoards(ctx, token.AccessToken)
	if err != nil {
		// Boards are best-effort; log and continue.
		c.log.Warn("pinterest: could not fetch boards", zap.Error(err))
		boards = []pinterestBoard{}
	}

	boardsJSON, err := json.Marshal(boards)
	if err != nil {
		boardsJSON = []byte("[]")
	}

	encAccess, err := crypto.Encrypt(token.AccessToken, c.secret)
	if err != nil {
		return nil, fmt.Errorf("pinterest: encrypt access token: %w", err)
	}

	encRefresh := ""
	if token.RefreshToken != "" {
		encRefresh, err = crypto.Encrypt(token.RefreshToken, c.secret)
		if err != nil {
			return nil, fmt.Errorf("pinterest: encrypt refresh token: %w", err)
		}
	}

	account := &models.SocialAccount{
		WorkspaceID:   workspaceID,
		Platform:      models.PlatformPinterest,
		AccountID:     userInfo.Username,
		AccountName:   userInfo.BusinessName,
		AccountHandle: userInfo.Username,
		AccountType:   "personal",
		AvatarURL:     userInfo.ProfileImage,
		AccessToken:   encAccess,
		RefreshToken:  encRefresh,
		Scopes:        models.StringSlice(conf.Scopes),
		IsActive:      true,
		ProfileURL:    "https://www.pinterest.com/" + userInfo.Username + "/",
		Metadata: models.JSONMap{
			"boards":        string(boardsJSON),
			"follower_count": userInfo.FollowerCount,
			"following_count": userInfo.FollowingCount,
			"pin_count":     userInfo.PinCount,
		},
	}

	if !token.Expiry.IsZero() {
		account.TokenExpiresAt = &token.Expiry
	}

	if err := c.db.WithContext(ctx).
		Where(models.SocialAccount{WorkspaceID: workspaceID, Platform: models.PlatformPinterest, AccountID: userInfo.Username}).
		Assign(*account).
		FirstOrCreate(account).Error; err != nil {
		return nil, fmt.Errorf("pinterest: upsert social account: %w", err)
	}

	c.log.Info("pinterest account connected",
		zap.String("workspace_id", workspaceID.String()),
		zap.String("username", userInfo.Username),
		zap.Int("boards", len(boards)),
	)

	return account, nil
}

// Post creates a Pinterest pin on the specified board.
func (c *Client) Post(
	ctx context.Context,
	account *models.SocialAccount,
	req PostRequest,
) (string, error) {
	token, err := crypto.Decrypt(account.AccessToken, c.secret)
	if err != nil {
		return "", fmt.Errorf("pinterest: decrypt access token: %w", err)
	}

	if req.BoardID == "" {
		return "", fmt.Errorf("pinterest: BoardID is required to create a pin")
	}
	if req.ImageURL == "" {
		return "", fmt.Errorf("pinterest: ImageURL is required to create a pin")
	}

	pinBody := map[string]interface{}{
		"board_id":    req.BoardID,
		"title":       req.Title,
		"description": req.Description,
		"media_source": map[string]interface{}{
			"source_type": "image_url",
			"url":         req.ImageURL,
		},
	}

	if req.LinkURL != "" {
		pinBody["link"] = req.LinkURL
	}

	raw, err := c.doJSONPost(ctx, token, pinterestAPIBase+"/pins", pinBody)
	if err != nil {
		return "", fmt.Errorf("pinterest: create pin: %w", err)
	}

	var result struct {
		ID    string         `json:"id"`
		Error *pinterestError `json:"message,omitempty"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", fmt.Errorf("pinterest: decode pin response: %w", err)
	}

	c.log.Info("pinterest pin created",
		zap.String("pin_id", result.ID),
		zap.String("board_id", req.BoardID),
	)
	return result.ID, nil
}

// ─── API helpers ─────────────────────────────────────────────────────────────

func (c *Client) doJSONPost(ctx context.Context, token, endpoint string, body interface{}) ([]byte, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

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
		c.log.Error("pinterest API error",
			zap.Int("status", resp.StatusCode),
			zap.String("body", string(respBody)),
		)
		return nil, fmt.Errorf("pinterest: HTTP %d: %s", resp.StatusCode, string(respBody))
	}
	return respBody, nil
}

func (c *Client) doJSONGet(ctx context.Context, token, endpoint string) ([]byte, error) {
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

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("pinterest: HTTP %d: %s", resp.StatusCode, string(body))
	}
	return body, nil
}

// fetchUserAccount retrieves the authenticated user's account information.
func (c *Client) fetchUserAccount(ctx context.Context, token string) (*pinterestUser, error) {
	raw, err := c.doJSONGet(ctx, token, pinterestAPIBase+"/user_account")
	if err != nil {
		return nil, err
	}

	var user pinterestUser
	if err := json.Unmarshal(raw, &user); err != nil {
		return nil, fmt.Errorf("pinterest: decode user account: %w", err)
	}
	return &user, nil
}

// fetchBoards retrieves up to 50 boards for the authenticated user.
func (c *Client) fetchBoards(ctx context.Context, token string) ([]pinterestBoard, error) {
	boardsURL := pinterestAPIBase + "/boards?page_size=50"
	raw, err := c.doJSONGet(ctx, token, boardsURL)
	if err != nil {
		return nil, err
	}

	var result struct {
		Items []pinterestBoard `json:"items"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("pinterest: decode boards: %w", err)
	}
	return result.Items, nil
}

// ─── response types ──────────────────────────────────────────────────────────

type pinterestUser struct {
	Username       string `json:"username"`
	BusinessName   string `json:"business_name"`
	ProfileImage   string `json:"profile_image"`
	FollowerCount  int64  `json:"follower_count"`
	FollowingCount int64  `json:"following_count"`
	PinCount       int64  `json:"pin_count"`
}

type pinterestBoard struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Privacy     string `json:"privacy"`
	PinCount    int    `json:"pin_count"`
}

type pinterestError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// buildPinURL returns the public URL for a pin.
func buildPinURL(pinID string) string {
	_ = strings.TrimSpace // keep import used
	_ = url.QueryEscape   // keep import used
	return "https://www.pinterest.com/pin/" + pinID + "/"
}
