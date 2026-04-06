// Package publishing provides the multi-platform post publishing service.
package publishing

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sync"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/models"
)

// PlatformClient is the interface each platform adapter must satisfy.
type PlatformClient interface {
	Post(ctx context.Context, account *models.SocialAccount, req *models.PostRequest) (*models.PostResult, error)
}

// OAuthRefresher can refresh a social account's access token.
type OAuthRefresher interface {
	RefreshToken(ctx context.Context, account *models.SocialAccount) error
}

// platformResult holds the outcome of publishing to a single platform.
type platformResult struct {
	platform        models.PlatformType
	socialAccountID uuid.UUID
	postResult      *models.PostResult
	err             error
}

// Publisher is the multi-platform publishing service.
type Publisher struct {
	db       *gorm.DB
	clients  map[string]PlatformClient
	media    *MediaService
	log      *zap.Logger
}

// NewPublisher creates a Publisher.
func NewPublisher(
	db *gorm.DB,
	clients map[string]PlatformClient,
	media *MediaService,
	log *zap.Logger,
) *Publisher {
	return &Publisher{
		db:      db,
		clients: clients,
		media:   media,
		log:     log.Named("publisher"),
	}
}

// RefreshToken satisfies the queue.OAuthRefresher interface.
// It delegates to the appropriate platform client if it implements OAuthRefresher.
func (p *Publisher) RefreshToken(ctx context.Context, account *models.SocialAccount) error {
	client, ok := p.clients[string(account.Platform)]
	if !ok {
		return fmt.Errorf("publisher: no client for platform %s", account.Platform)
	}

	refresher, ok := client.(OAuthRefresher)
	if !ok {
		return fmt.Errorf("publisher: platform %s does not support token refresh", account.Platform)
	}

	return refresher.RefreshToken(ctx, account)
}

// PublishPost implements queue.Publisher. It fetches the post, resolves the
// connected social accounts, and publishes to each platform concurrently.
func (p *Publisher) PublishPost(
	ctx context.Context,
	post *models.Post,
	_ *models.SocialAccount, // unused — we load per-platform accounts ourselves
) (externalID string, externalURL string, err error) {
	return p.publishByPostID(ctx, post.ID, post.WorkspaceID)
}

// publishByPostID is the core entry point also called from the publishing handler.
func (p *Publisher) publishByPostID(ctx context.Context, postID, workspaceID uuid.UUID) (string, string, error) {
	// Load post with all needed associations.
	var post models.Post
	if err := p.db.WithContext(ctx).
		Preload("PostPlatforms").
		First(&post, "id = ? AND workspace_id = ?", postID, workspaceID).Error; err != nil {
		return "", "", fmt.Errorf("publisher: fetch post: %w", err)
	}

	if len(post.Platforms) == 0 {
		return "", "", errors.New("publisher: post has no target platforms")
	}

	// Build the PostRequest from the Post model.
	req := p.buildPostRequest(&post)

	// Load social accounts for each target platform.
	type platformAccount struct {
		platform models.PlatformType
		account  models.SocialAccount
	}

	var platformAccounts []platformAccount
	for _, platformStr := range post.Platforms {
		var account models.SocialAccount
		err := p.db.WithContext(ctx).
			Where("workspace_id = ? AND platform = ? AND is_active = true", workspaceID, platformStr).
			Order("created_at DESC").
			First(&account).Error
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				p.log.Warn("publisher: no active account for platform",
					zap.String("platform", platformStr),
					zap.String("post_id", postID.String()),
				)
				continue
			}
			return "", "", fmt.Errorf("publisher: load account for %s: %w", platformStr, err)
		}
		platformAccounts = append(platformAccounts, platformAccount{
			platform: models.PlatformType(platformStr),
			account:  account,
		})
	}

	if len(platformAccounts) == 0 {
		return "", "", errors.New("publisher: no connected accounts found for any target platform")
	}

	// Publish concurrently to all platforms.
	resultCh := make(chan platformResult, len(platformAccounts))
	var wg sync.WaitGroup

	for _, pa := range platformAccounts {
		wg.Add(1)
		go func(plt models.PlatformType, acc models.SocialAccount) {
			defer wg.Done()
			res := p.publishToPlatform(ctx, plt, &acc, req)
			resultCh <- res
		}(pa.platform, pa.account)
	}

	wg.Wait()
	close(resultCh)

	// Collect results.
	var results []platformResult
	for r := range resultCh {
		results = append(results, r)
	}

	// Persist PostPlatform records.
	successCount := 0
	var firstID, firstURL string
	for _, r := range results {
		pp := models.PostPlatform{
			PostID:          postID,
			Platform:        r.platform,
			SocialAccountID: r.socialAccountID,
		}
		if r.err != nil {
			pp.Status = models.PostStatusFailed
			pp.ErrorMessage = r.err.Error()
			p.log.Error("publisher: platform publish failed",
				zap.String("platform", string(r.platform)),
				zap.String("post_id", postID.String()),
				zap.Error(r.err),
			)
		} else {
			pp.Status = models.PostStatusPublished
			now := time.Now().UTC()
			pp.PublishedAt = &now
			if r.postResult != nil {
				pp.PlatformPostID = r.postResult.PlatformPostID
				pp.PostURL = r.postResult.PostURL
				if firstID == "" {
					firstID = r.postResult.PlatformPostID
					firstURL = r.postResult.PostURL
				}
			}
			successCount++
		}

		// Upsert PostPlatform.
		if err := p.db.WithContext(ctx).
			Where("post_id = ? AND platform = ?", postID, r.platform).
			Assign(pp).
			FirstOrCreate(&pp).Error; err != nil {
			p.log.Error("publisher: save PostPlatform record", zap.Error(err))
		}
	}

	// Update post status.
	var finalStatus models.PostStatus
	var errMsg string
	switch {
	case successCount == len(results):
		finalStatus = models.PostStatusPublished
	case successCount > 0:
		finalStatus = models.PostStatusPublished // partial success
		errMsg = fmt.Sprintf("partial: %d of %d platforms succeeded", successCount, len(results))
	default:
		finalStatus = models.PostStatusFailed
		errMsg = "all platforms failed"
	}

	now := time.Now().UTC()
	updates := map[string]interface{}{
		"status":       finalStatus,
		"published_at": now,
		"error_message": errMsg,
	}

	if err := p.db.WithContext(ctx).Model(&post).Updates(updates).Error; err != nil {
		p.log.Error("publisher: update post status", zap.Error(err))
	}

	if finalStatus == models.PostStatusFailed {
		return "", "", errors.New("publisher: all platform publishes failed")
	}

	return firstID, firstURL, nil
}

// publishToPlatform publishes to a single platform with exponential-backoff retry.
func (p *Publisher) publishToPlatform(
	ctx context.Context,
	platform models.PlatformType,
	account *models.SocialAccount,
	req *models.PostRequest,
) platformResult {
	client, ok := p.clients[string(platform)]
	if !ok {
		return platformResult{
			platform:        platform,
			socialAccountID: account.ID,
			err:             fmt.Errorf("no client configured for platform %s", platform),
		}
	}

	const maxAttempts = 3
	var lastErr error

	for attempt := 0; attempt < maxAttempts; attempt++ {
		if attempt > 0 {
			// Exponential backoff: 2^(attempt-1) seconds.
			backoff := time.Duration(math.Pow(2, float64(attempt-1))) * time.Second
			p.log.Info("publisher: retrying platform publish",
				zap.String("platform", string(platform)),
				zap.Int("attempt", attempt+1),
				zap.Duration("backoff", backoff),
			)
			select {
			case <-ctx.Done():
				return platformResult{platform: platform, socialAccountID: account.ID, err: ctx.Err()}
			case <-time.After(backoff):
			}
		}

		result, err := client.Post(ctx, account, req)
		if err == nil {
			p.log.Info("publisher: platform publish succeeded",
				zap.String("platform", string(platform)),
				zap.Int("attempt", attempt+1),
			)
			return platformResult{
				platform:        platform,
				socialAccountID: account.ID,
				postResult:      result,
			}
		}

		lastErr = err
		p.log.Warn("publisher: platform publish attempt failed",
			zap.String("platform", string(platform)),
			zap.Int("attempt", attempt+1),
			zap.Error(err),
		)
	}

	return platformResult{
		platform:        platform,
		socialAccountID: account.ID,
		err:             fmt.Errorf("failed after %d attempts: %w", maxAttempts, lastErr),
	}
}

// buildPostRequest converts a Post model into a PostRequest for platform adapters.
func (p *Publisher) buildPostRequest(post *models.Post) *models.PostRequest {
	req := &models.PostRequest{
		Type:         post.Type,
		Caption:      post.Content,
		Hashtags:     post.Hashtags,
		MediaURLs:    post.MediaURLs,
		ThumbnailURL: post.ThumbnailURL,
		BoardID:      post.BoardID,
		LinkURL:      post.LinkURL,
		Title:        post.Title,
		Description:  post.Description,
		Privacy:      post.Privacy,
	}

	// Parse tags for YouTube.
	if post.Tags != "" {
		req.Tags = []string{post.Tags}
	}

	return req
}
