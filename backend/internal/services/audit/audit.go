// Package audit provides a thin DB-only audit log writer for service-layer
// callers that don't have a fiber.Ctx (webhooks, background workers, etc.).
//
// Handler-layer callers should keep using handlers.writeAudit which captures
// IP and User-Agent from the request automatically.
package audit

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
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
// Use uuid.Nil for workspaceID/userID when they don't apply — they'll be
// stored as NULL so we don't violate the foreign keys on audit_logs.
func (s *Service) Write(workspaceID, userID uuid.UUID, action, resourceType, resourceID string, metadata map[string]any) {
	if s == nil || s.db == nil {
		return
	}
	var wsArg, userArg, resArg interface{}
	if workspaceID != uuid.Nil {
		wsArg = workspaceID
	}
	if userID != uuid.Nil {
		userArg = userID
	}
	if resourceID != "" {
		resArg = resourceID
	}
	var metaArg interface{}
	if metadata != nil {
		if b, err := json.Marshal(metadata); err == nil {
			metaArg = string(b)
		}
	}
	go func() {
		err := s.db.WithContext(context.Background()).Exec(
			`INSERT INTO audit_logs
			    (workspace_id, user_id, action, resource_type, resource_id, metadata, created_at)
			 VALUES (?, ?, ?, ?, ?, ?::jsonb, NOW())`,
			wsArg, userArg, action, resourceType, resArg, metaArg,
		).Error
		if err != nil {
			s.log.Warn("audit write failed", zap.Error(err), zap.String("action", action))
		}
	}()
}
