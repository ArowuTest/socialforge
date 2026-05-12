package queue

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/hibiken/asynq"
	"go.uber.org/zap"

	"github.com/socialforge/backend/internal/models"
	"github.com/socialforge/backend/internal/repository"
)

// ─── InboxFetcher interface ───────────────────────────────────────────────────

// InboxFetcher is implemented by platform clients that support reading inbox
// items (comments, mentions, DMs) via their API.
// InboxItem is defined in models to avoid circular imports.
type InboxFetcher interface {
	FetchInbox(ctx context.Context, account *models.SocialAccount) ([]models.InboxItem, error)
}

// InboxReplier is implemented by platform clients that support sending replies.
type InboxReplier interface {
	ReplyToMessage(ctx context.Context, account *models.SocialAccount, externalID, replyText string) error
}

// ─── InboxSyncHandler ────────────────────────────────────────────────────────

// InboxSyncHandler sweeps all active social accounts and upserts new inbox
// messages into the unified inbox_messages table.
type InboxSyncHandler struct {
	deps    WorkerDeps
	fetchers map[string]InboxFetcher
}

// NewInboxSyncHandler constructs an InboxSyncHandler.
func NewInboxSyncHandler(deps WorkerDeps, fetchers map[string]InboxFetcher) *InboxSyncHandler {
	return &InboxSyncHandler{deps: deps, fetchers: fetchers}
}

// ProcessTask is the asynq handler entry point.
func (h *InboxSyncHandler) ProcessTask(ctx context.Context, t *asynq.Task) error {
	var p SyncInboxPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("inboxSync: unmarshal payload: %w", err)
	}

	log := h.deps.Logger.Named("inbox_sync")
	log.Info("starting inbox sync")

	// Fetch all active social accounts that have a registered InboxFetcher.
	platforms := make([]string, 0, len(h.fetchers))
	for p := range h.fetchers {
		platforms = append(platforms, p)
	}
	if len(platforms) == 0 {
		log.Info("no inbox fetchers registered, skipping")
		return nil
	}

	var accounts []models.SocialAccount
	if err := h.deps.DB.WithContext(ctx).
		Where("is_active = true AND platform IN ?", platforms).
		Find(&accounts).Error; err != nil {
		return fmt.Errorf("inboxSync: fetch accounts: %w", err)
	}

	log.Info("syncing inbox for accounts", zap.Int("count", len(accounts)))

	inboxRepo := repository.NewInboxRepo(h.deps.DB)

	for i := range accounts {
		acct := &accounts[i]
		fetcher, ok := h.fetchers[string(acct.Platform)]
		if !ok {
			continue
		}

		items, err := fetcher.FetchInbox(ctx, acct)
		if err != nil {
			log.Warn("inboxSync: FetchInbox failed",
				zap.String("platform", string(acct.Platform)),
				zap.String("account_id", acct.ID.String()),
				zap.Error(err),
			)
			continue
		}

		for _, item := range items {
			msg := &models.InboxMessage{
				WorkspaceID:       acct.WorkspaceID,
				SocialAccountID:   acct.ID,
				Platform:          string(acct.Platform),
				MessageType:       item.MessageType,
				ExternalID:        item.ExternalID,
				SenderName:        item.SenderName,
				SenderHandle:      item.SenderHandle,
				SenderAvatar:      item.SenderAvatar,
				Content:           item.Content,
				PlatformPostID:    item.PlatformPostID,
				PostExcerpt:       item.PostExcerpt,
				PlatformCreatedAt: item.PlatformCreatedAt,
			}
			// Try to link to a known Post row via platform_post_id lookup.
			var pp models.PostPlatform
			if item.PlatformPostID != "" {
				if err := h.deps.DB.WithContext(ctx).
					Where("platform_post_id = ? AND social_account_id = ?", item.PlatformPostID, acct.ID).
					First(&pp).Error; err == nil {
					msg.PostID = &pp.PostID
				}
			}

			if err := inboxRepo.Upsert(ctx, msg); err != nil {
				log.Warn("inboxSync: upsert failed",
					zap.String("external_id", item.ExternalID),
					zap.Error(err),
				)
			}
		}

		log.Info("inbox sync complete for account",
			zap.String("platform", string(acct.Platform)),
			zap.String("account_id", acct.ID.String()),
			zap.Int("items", len(items)),
		)
	}

	return nil
}
