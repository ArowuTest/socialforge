package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/socialforge/backend/internal/models"
)

// ─── InboxRepository ─────────────────────────────────────────────────────────

// InboxFilter holds filtering + pagination options for listing inbox messages.
type InboxFilter struct {
	WorkspaceID     uuid.UUID
	SocialAccountID *uuid.UUID
	Platform        string
	MessageType     string
	IsRead          *bool
	Page            int
	Limit           int
}

// InboxRepository defines inbox message persistence operations.
type InboxRepository interface {
	// Upsert inserts a new InboxMessage or updates an existing one identified
	// by (workspace_id, platform, external_id). Used by the sync worker to
	// import messages from platform APIs without creating duplicates.
	Upsert(ctx context.Context, msg *models.InboxMessage) error

	// List returns a paginated, newest-first list of inbox messages.
	List(ctx context.Context, f InboxFilter) ([]*models.InboxMessage, int64, error)

	// GetByID fetches a single message by its UUID, scoped to a workspace.
	GetByID(ctx context.Context, workspaceID, id uuid.UUID) (*models.InboxMessage, error)

	// MarkRead marks a single message as read.
	MarkRead(ctx context.Context, workspaceID, id uuid.UUID) error

	// MarkAllRead marks every unread message in a workspace as read.
	MarkAllRead(ctx context.Context, workspaceID uuid.UUID) error

	// SetReplied records the reply timestamp on a message.
	SetReplied(ctx context.Context, workspaceID, id uuid.UUID, at time.Time) error

	// UnreadCount returns the number of unread messages for a workspace.
	UnreadCount(ctx context.Context, workspaceID uuid.UUID) (int64, error)
}

// ─── GORM implementation ─────────────────────────────────────────────────────

type inboxRepo struct{ db *gorm.DB }

// NewInboxRepo creates a new GORM-backed InboxRepository.
func NewInboxRepo(db *gorm.DB) InboxRepository { return &inboxRepo{db: db} }

func (r *inboxRepo) Upsert(ctx context.Context, msg *models.InboxMessage) error {
	return r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "workspace_id"}, {Name: "platform"}, {Name: "external_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"content", "sender_name", "sender_handle", "sender_avatar", "post_excerpt", "updated_at"}),
		}).
		Create(msg).Error
}

func (r *inboxRepo) List(ctx context.Context, f InboxFilter) ([]*models.InboxMessage, int64, error) {
	if f.Limit <= 0 {
		f.Limit = 20
	}
	if f.Limit > 100 {
		f.Limit = 100
	}
	if f.Page < 1 {
		f.Page = 1
	}

	q := r.db.WithContext(ctx).Where("workspace_id = ?", f.WorkspaceID)

	if f.SocialAccountID != nil {
		q = q.Where("social_account_id = ?", *f.SocialAccountID)
	}
	if f.Platform != "" {
		q = q.Where("platform = ?", f.Platform)
	}
	if f.MessageType != "" {
		q = q.Where("message_type = ?", f.MessageType)
	}
	if f.IsRead != nil {
		q = q.Where("is_read = ?", *f.IsRead)
	}

	var total int64
	if err := q.Model(&models.InboxMessage{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var msgs []*models.InboxMessage
	offset := (f.Page - 1) * f.Limit
	if err := q.Order("platform_created_at DESC").
		Limit(f.Limit).Offset(offset).
		Find(&msgs).Error; err != nil {
		return nil, 0, err
	}
	return msgs, total, nil
}

func (r *inboxRepo) GetByID(ctx context.Context, workspaceID, id uuid.UUID) (*models.InboxMessage, error) {
	var msg models.InboxMessage
	if err := r.db.WithContext(ctx).
		Where("id = ? AND workspace_id = ?", id, workspaceID).
		First(&msg).Error; err != nil {
		return nil, err
	}
	return &msg, nil
}

func (r *inboxRepo) MarkRead(ctx context.Context, workspaceID, id uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&models.InboxMessage{}).
		Where("id = ? AND workspace_id = ?", id, workspaceID).
		Update("is_read", true).Error
}

func (r *inboxRepo) MarkAllRead(ctx context.Context, workspaceID uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&models.InboxMessage{}).
		Where("workspace_id = ? AND is_read = false", workspaceID).
		Update("is_read", true).Error
}

func (r *inboxRepo) SetReplied(ctx context.Context, workspaceID, id uuid.UUID, at time.Time) error {
	return r.db.WithContext(ctx).Model(&models.InboxMessage{}).
		Where("id = ? AND workspace_id = ?", id, workspaceID).
		Updates(map[string]interface{}{
			"replied_at": at,
			"is_read":    true,
		}).Error
}

func (r *inboxRepo) UnreadCount(ctx context.Context, workspaceID uuid.UUID) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&models.InboxMessage{}).
		Where("workspace_id = ? AND is_read = false", workspaceID).
		Count(&count).Error
	return count, err
}
