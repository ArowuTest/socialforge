package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/socialforge/backend/internal/models"
	"gorm.io/gorm"
)

// auditLogRepo is the GORM-backed implementation of AuditLogRepository.
type auditLogRepo struct {
	db *gorm.DB
}

// NewAuditLogRepo constructs an auditLogRepo backed by the given *gorm.DB.
func NewAuditLogRepo(db *gorm.DB) AuditLogRepository {
	return &auditLogRepo{db: db}
}

// Create appends a new audit log record. Audit logs are append-only and are
// never updated or soft-deleted.
func (r *auditLogRepo) Create(ctx context.Context, log *models.AuditLog) error {
	result := r.db.WithContext(ctx).Create(log)
	return result.Error
}

// ListByWorkspace returns audit log entries for the given workspace, ordered
// by creation time (newest first), with the provided limit and offset applied
// for pagination.
func (r *auditLogRepo) ListByWorkspace(ctx context.Context, workspaceID uuid.UUID, limit, offset int) ([]*models.AuditLog, error) {
	if limit < 1 {
		limit = 50
	}
	var logs []*models.AuditLog
	result := r.db.WithContext(ctx).
		Where("workspace_id = ?", workspaceID).
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&logs)
	if result.Error != nil {
		return nil, result.Error
	}
	return logs, nil
}

// DeleteOlderThan permanently removes audit log records whose created_at
// timestamp is earlier than the given time. This is a hard delete used by
// retention / cleanup jobs; audit logs do not use soft deletes.
func (r *auditLogRepo) DeleteOlderThan(ctx context.Context, before time.Time) error {
	result := r.db.WithContext(ctx).
		Unscoped().
		Where("created_at < ?", before).
		Delete(&models.AuditLog{})
	return result.Error
}
