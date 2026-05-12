// Package audit provides a thin DB-only audit log writer for service-layer
// callers that don't have a fiber.Ctx (webhooks, background workers, etc.).
//
// Handler-layer callers should keep using handlers.writeAudit which captures
// IP and User-Agent from the request automatically.
package audit

import (
	"context"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/models"
)

// Service writes audit entries asynchronously.
type Service struct {
	db  *gorm.DB
	log *zap.Logger
}

// New constructs an audit service.
func New(db *gorm.DB, log *zap.Logger) *Service {
	return &Service{db: db, log: log.Named("audit")}
}

// Write records an audit entry fire-and-forget. Never blocks the caller.
// Use uuid.Nil for workspaceID/userID when they don't apply.
func (s *Service) Write(workspaceID, userID uuid.UUID, action, resourceType, resourceID string, metadata map[string]any) {
	if s == nil || s.db == nil {
		return
	}
	entry := &models.AuditLog{
		WorkspaceID:  workspaceID,
		UserID:       userID,
		Action:       action,
		ResourceType: resourceType,
		ResourceID:   resourceID,
		Metadata:     models.JSONMap(metadata),
	}
	go func(e *models.AuditLog) {
		if err := s.db.WithContext(context.Background()).Create(e).Error; err != nil {
			s.log.Warn("audit write failed", zap.Error(err), zap.String("action", e.Action))
		}
	}(entry)
}
