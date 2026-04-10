// Package linkedin implements the SocialForge platform adapter for LinkedIn
// using the LinkedIn API v2 with standard OAuth 2.0.
//
// Flow summary:
//  1. GetAuthURL   – builds the LinkedIn OAuth authorization URL with state.
//  2. ExchangeCode – exchanges the code for a token, fetches profile + email,
//                    persists a SocialAccount record.
//  3. Post         – dispatches to text-only or image UGC post helpers.
package linkedin

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
	linkedinOAuth "golang.org/x/oauth2/linkedin"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/config"
	"github.com/socialforge/backend/internal/crypto"
	"github.com/socialforge/backend/internal/models"
)

const (
	platform    = "linkedin"
	apiBase     = "https://api.linkedin.com/v2"
	assetsBase  = "https://api.linkedin.com/v2/assets"
)

// PostRequest carries the data needed to publish a LinkedIn post.
type PostRequest struct {
	Content   string
	MediaURLs []string
	PostType  string // "text" | "image"
}

// Client is the LinkedIn platform adapter.
type Client struct {
	cfg    config.OAuthPlatformConfig
	secret string
	db     *gorm.DB
	log    *zap.Logger
	http   *http.Client
}

// New creates a new LinkedIn Client.
func New(cfg config.OAuthPlatformConfig, encryptionSecret string, db *gorm.DB, log *zap.Logger) *Client {
	return &Client{
		cfg:    cfg,
		secret: encryptionSecret,
		db:     db,
		log:    log.Named("linkedin"),
		http:   &http.Client{Timeout: 30 * time.Second},
	}
}

// oauthConfig returns the oauth2 configuration for LinkedIn.
func (c *Client) oauthConfig() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     c.cfg.ClientID,
		ClientSecret: c.cfg.ClientSecret,
		RedirectURL:  c.cfg.RedirectURL,
		Scopes: []string{
			"r_liteprofile",
			"r_emailaddress",
			"w_member_social",
			"r_organization_social",
			"w_organization_social",
		},
		Endpoint: linkedinOAuth.Endpoint,
	}
}

// GetAuthURL returns the LinkedIn OAuth authorization URL.
// state is a CSRF-safe random string that encodes the workspaceID.
func (c *Client) GetAuthURL(workspaceID uuid.UUID, state string) string {
	conf := c.oauthConfig()
	authURL := conf.AuthCodeURL(state, oauth2.AccessTypeOffline)
	c.log.Info("generated LinkedIn auth URL", zap.String("workspace_id", workspaceID.String()))
	return authURL
}

// ExchangeCode exchanges the authorization code for an access token, fetches
// the LinkedIn profile and email, then persists a SocialAccount.
func (c *Client) ExchangeCode(
	ctx context.Context,
	code, state string,
	workspaceID uuid.UUID,
) (*models.SocialAccount, error) {
	conf := c.oauthConfig()

	token, err := conf.Exchange(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("linkedin: exchange code: %w", err)
	}

	profile, err := c.fetchProfile(ctx, token.AccessToken)
	if err != nil {
		return nil, fmt.Errorf("linkedin: fetch profile: %w", err)
	}

	email, err := c.fetchEmail(ctx, token.AccessToken)
	if err != nil {
		// Email is best-effort; log and continue.
		c.log.Warn("linkedin: could not fetch email", zap.Error(err))
	}

	encAccess, err := crypto.Encrypt(token.AccessToken, c.secret)
	if err != nil {
		return nil, fmt.Errorf("linkedin: encrypt access token: %w", err)
	}

	encRefresh := ""
	if token.RefreshToken != "" {
		encRefresh, err = crypto.Encrypt(token.RefreshToken, c.secret)
		if err != nil {
			return nil, fmt.Errorf("linkedin: encrypt refresh token: %w", err)
		}
	}

	displayName := strings.TrimSpace(profile.LocalizedFirstName + " " + profile.LocalizedLastName)

	avatarURL := ""
	if profile.ProfilePicture != nil {
		avatarURL = extractLinkedInAvatar(profile.ProfilePicture)
	}

	scopes := strings.Join(conf.Scopes, " ")

	metadata := models.JSONMap{
		"email": email,
	}

	account := &models.SocialAccount{
		WorkspaceID:   workspaceID,
		Platform:      models.PlatformLinkedIn,
		AccountID:     profile.ID,
		AccountName:   displayName,
		AccountHandle: email,
		AccountType:   "personal",
		AvatarURL:     avatarURL,
		AccessToken:   encAccess,
		RefreshToken:  encRefresh,
		Scopes:        models.StringSlice(strings.Split(scopes, " ")),
		IsActive:      true,
		Metadata:      metadata,
	}

	if !token.Expiry.IsZero() {
		account.TokenExpiresAt = &token.Expiry
	}

	if err := c.db.WithContext(ctx).
		Where(models.SocialAccount{WorkspaceID: workspaceID, Platform: models.PlatformLinkedIn, AccountID: profile.ID}).
		Assign(*account).
		FirstOrCreate(account).Error; err != nil {
		return nil, fmt.Errorf("linkedin: upsert social account: %w", err)
	}

	c.log.Info("linkedin account connected",
		zap.String("workspace_id", workspaceID.String()),
		zap.String("account_id", profile.ID),
		zap.String("display_name", displayName),
	)

	return account, nil
}

// RefreshToken uses the stored refresh_token to obtain a new access token from LinkedIn.
func (c *Client) RefreshToken(ctx context.Context, account *models.SocialAccount) error {
	refreshToken, err := crypto.Decrypt(account.RefreshToken, c.secret)
	if err != nil {
		return fmt.Errorf("linkedin: decrypt refresh token: %w", err)
	}

	params := url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {refreshToken},
		"client_id":     {c.cfg.ClientID},
		"client_secret": {c.cfg.ClientSecret},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://www.linkedin.com/oauth/v2/accessToken",
		strings.NewReader(params.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("linkedin: refresh token request: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		AccessToken  string `json:"access_token"`
		ExpiresIn    int64  `json:"expires_in"`
		RefreshToken string `json:"refresh_token"`
		Error        string `json:"error"`
		ErrorDesc    string `json:"error_description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("linkedin: decode refresh response: %w", err)
	}
	if result.Error != "" {
		return fmt.Errorf("linkedin: refresh token error: %s – %s", result.Error, result.ErrorDesc)
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
		return fmt.Errorf("linkedin: update tokens in db: %w", err)
	}

	account.AccessToken = encAccess
	c.log.Info("linkedin token refreshed", zap.String("account_id", account.ID.String()))
	return nil
}

// Post publishes content to LinkedIn on behalf of the connected member.
func (c *Client) Post(
	ctx context.Context,
	account *models.SocialAccount,
	req *models.PostRequest,
) (*models.PostResult, error) {
	token, err := crypto.Decrypt(account.AccessToken, c.secret)
	if err != nil {
		return nil, fmt.Errorf("linkedin: decrypt access token: %w", err)
	}

	authorURN := "urn:li:person:" + account.AccountID

	localReq := PostRequest{
		Content:   req.Caption,
		MediaURLs: req.MediaURLs,
		PostType:  string(req.Type),
	}
	var postID string
	var postErr error
	if localReq.PostType == "image" && len(localReq.MediaURLs) > 0 {
		postID, postErr = c.postImage(ctx, token, authorURN, localReq)
	} else {
		postID, postErr = c.postText(ctx, token, authorURN, localReq.Content)
	}
	if postErr != nil {
		return nil, postErr
	}
	return &models.PostResult{PlatformPostID: postID}, nil
}

// ─── text post ───────────────────────────────────────────────────────────────

func (c *Client) postText(ctx context.Context, token, authorURN, content string) (string, error) {
	body := map[string]interface{}{
		"author":         authorURN,
		"lifecycleState": "PUBLISHED",
		"specificContent": map[string]interface{}{
			"com.linkedin.ugc.ShareContent": map[string]interface{}{
				"shareCommentary": map[string]interface{}{
					"text": content,
				},
				"shareMediaCategory": "NONE",
			},
		},
		"visibility": map[string]interface{}{
			"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
		},
	}

	postURN, err := c.createUGCPost(ctx, token, body)
	if err != nil {
		return "", fmt.Errorf("linkedin: post text: %w", err)
	}

	c.log.Info("linkedin text post published", zap.String("urn", postURN))
	return postURN, nil
}

// ─── image post ──────────────────────────────────────────────────────────────

func (c *Client) postImage(ctx context.Context, token, authorURN string, req PostRequest) (string, error) {
	// Step 1: register upload with LinkedIn.
	uploadReqBody := map[string]interface{}{
		"registerUploadRequest": map[string]interface{}{
			"owner": authorURN,
			"recipes": []string{
				"urn:li:digitalmediaRecipe:feedshare-image",
			},
			"serviceRelationships": []map[string]interface{}{
				{
					"identifier":       "urn:li:userGeneratedContent",
					"relationshipType": "OWNER",
				},
			},
		},
	}

	uploadRegURL := assetsBase + "?action=registerUpload"
	rawReg, err := c.doJSONPost(ctx, token, uploadRegURL, uploadReqBody)
	if err != nil {
		return "", fmt.Errorf("linkedin: register upload: %w", err)
	}

	var regResp struct {
		Value struct {
			Asset                    string `json:"asset"`
			UploadMechanism          map[string]interface{} `json:"uploadMechanism"`
		} `json:"value"`
	}
	if err := json.Unmarshal(rawReg, &regResp); err != nil {
		return "", fmt.Errorf("linkedin: decode register upload response: %w", err)
	}

	assetURN := regResp.Value.Asset
	uploadURL := extractUploadURL(regResp.Value.UploadMechanism)
	if uploadURL == "" {
		return "", fmt.Errorf("linkedin: no upload URL returned from registerUpload")
	}

	// Step 2: fetch the image bytes and upload to LinkedIn's storage.
	imgBytes, err := c.fetchImageBytes(ctx, req.MediaURLs[0])
	if err != nil {
		return "", fmt.Errorf("linkedin: fetch image bytes: %w", err)
	}

	if err := c.uploadImageBinary(ctx, token, uploadURL, imgBytes); err != nil {
		return "", fmt.Errorf("linkedin: upload image binary: %w", err)
	}

	// Step 3: create the UGC post referencing the uploaded asset.
	mediaArray := []map[string]interface{}{
		{
			"status":      "READY",
			"description": map[string]interface{}{"text": ""},
			"media":       assetURN,
			"title":       map[string]interface{}{"text": ""},
		},
	}

	postBody := map[string]interface{}{
		"author":         authorURN,
		"lifecycleState": "PUBLISHED",
		"specificContent": map[string]interface{}{
			"com.linkedin.ugc.ShareContent": map[string]interface{}{
				"shareCommentary": map[string]interface{}{
					"text": req.Content,
				},
				"shareMediaCategory": "IMAGE",
				"media":              mediaArray,
			},
		},
		"visibility": map[string]interface{}{
			"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
		},
	}

	postURN, err := c.createUGCPost(ctx, token, postBody)
	if err != nil {
		return "", fmt.Errorf("linkedin: create image post: %w", err)
	}

	c.log.Info("linkedin image post published", zap.String("urn", postURN))
	return postURN, nil
}

// ─── API helpers ─────────────────────────────────────────────────────────────

func (c *Client) createUGCPost(ctx context.Context, token string, body map[string]interface{}) (string, error) {
	raw, err := c.doJSONPost(ctx, token, apiBase+"/ugcPosts", body)
	if err != nil {
		return "", err
	}

	var resp struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		return "", fmt.Errorf("linkedin: decode ugcPosts response: %w", err)
	}
	if resp.ID == "" {
		return "", fmt.Errorf("linkedin: empty post ID in ugcPosts response")
	}
	return resp.ID, nil
}

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
	req.Header.Set("X-Restli-Protocol-Version", "2.0.0")

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
		c.log.Error("linkedin API error",
			zap.Int("status", resp.StatusCode),
			zap.String("body", string(respBody)),
		)
		return nil, fmt.Errorf("linkedin: HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	return respBody, nil
}

func (c *Client) doJSONGet(ctx context.Context, token, endpoint string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-Restli-Protocol-Version", "2.0.0")

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
		return nil, fmt.Errorf("linkedin: HTTP %d: %s", resp.StatusCode, string(body))
	}
	return body, nil
}

// fetchProfile retrieves the LinkedIn member profile.
func (c *Client) fetchProfile(ctx context.Context, token string) (*linkedInProfile, error) {
	profileURL := apiBase + "/me?projection=(id,localizedFirstName,localizedLastName,profilePicture(displayImage~:playableStreams))"
	raw, err := c.doJSONGet(ctx, token, profileURL)
	if err != nil {
		return nil, err
	}

	var profile linkedInProfile
	if err := json.Unmarshal(raw, &profile); err != nil {
		return nil, fmt.Errorf("linkedin: decode profile: %w", err)
	}
	return &profile, nil
}

// fetchEmail retrieves the LinkedIn member's primary email address.
func (c *Client) fetchEmail(ctx context.Context, token string) (string, error) {
	emailURL := apiBase + "/emailAddress?q=members&projection=(elements*(handle~))"
	raw, err := c.doJSONGet(ctx, token, emailURL)
	if err != nil {
		return "", err
	}

	var result struct {
		Elements []struct {
			Handle struct {
				EmailAddress string `json:"emailAddress"`
			} `json:"handle~"`
		} `json:"elements"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", fmt.Errorf("linkedin: decode email response: %w", err)
	}

	if len(result.Elements) > 0 {
		return result.Elements[0].Handle.EmailAddress, nil
	}
	return "", nil
}

// fetchImageBytes downloads image bytes from a public URL.
func (c *Client) fetchImageBytes(ctx context.Context, imageURL string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, imageURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("linkedin: fetch image HTTP %d from %s", resp.StatusCode, imageURL)
	}

	return io.ReadAll(resp.Body)
}

// uploadImageBinary PUTs the raw image bytes to LinkedIn's upload URL.
func (c *Client) uploadImageBinary(ctx context.Context, token, uploadURL string, data []byte) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, uploadURL, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.ContentLength = int64(len(data))

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("linkedin: upload image binary HTTP %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

// ─── response types ──────────────────────────────────────────────────────────

type linkedInProfile struct {
	ID                 string `json:"id"`
	LocalizedFirstName string `json:"localizedFirstName"`
	LocalizedLastName  string `json:"localizedLastName"`
	ProfilePicture     *struct {
		DisplayImageTilde *struct {
			Elements []struct {
				Identifiers []struct {
					Identifier string `json:"identifier"`
				} `json:"identifiers"`
			} `json:"elements"`
		} `json:"displayImage~"`
	} `json:"profilePicture"`
}

// ─── utility helpers ─────────────────────────────────────────────────────────

// extractLinkedInAvatar pulls the best-quality profile picture URL from the
// nested playable streams structure.
func extractLinkedInAvatar(pic interface{}) string {
	// pic is *struct with DisplayImageTilde field
	type picType = struct {
		DisplayImageTilde *struct {
			Elements []struct {
				Identifiers []struct {
					Identifier string `json:"identifier"`
				} `json:"identifiers"`
			} `json:"elements"`
		} `json:"displayImage~"`
	}

	p, ok := pic.(*picType)
	if !ok || p == nil || p.DisplayImageTilde == nil {
		return ""
	}

	els := p.DisplayImageTilde.Elements
	// Last element is typically the highest resolution.
	for i := len(els) - 1; i >= 0; i-- {
		if len(els[i].Identifiers) > 0 {
			return els[i].Identifiers[0].Identifier
		}
	}
	return ""
}

// extractUploadURL navigates the nested UploadMechanism map returned by
// registerUpload to find the actual PUT URL.
func extractUploadURL(mechanism map[string]interface{}) string {
	// The key is "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
	for _, v := range mechanism {
		if inner, ok := v.(map[string]interface{}); ok {
			if u, ok := inner["uploadUrl"].(string); ok && u != "" {
				return u
			}
		}
	}

	// Try direct access as well.
	if raw, ok := mechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]; ok {
		if inner, ok := raw.(map[string]interface{}); ok {
			if u, ok := inner["uploadUrl"].(string); ok {
				return u
			}
		}
	}

	return ""
}

// buildProfileURL constructs a LinkedIn profile URL from a member URN / ID.
func buildProfileURL(profileID string) string {
	return "https://www.linkedin.com/in/" + url.PathEscape(profileID)
}
