package handlers

import (
	"context"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/api/middleware"
	"github.com/socialforge/backend/internal/models"
)

// writeAudit appends an audit log entry fire-and-forget. It never blocks the
// request and never returns an error to the caller — audit failures are logged
// but must not break the actual operation.
//
// workspaceID and userID may be uuid.Nil for actions without that context
// (e.g. anonymous login attempts). actor is pulled from Fiber locals when
// available, overriding any explicitly passed userID for the actor field.
func writeAudit(
	c *fiber.Ctx,
	db *gorm.DB,
	log *zap.Logger,
	workspaceID uuid.UUID,
	action, resourceType, resourceID string,
	metadata map[string]any,
) {
	var actorID uuid.UUID
	if u, ok := c.Locals(middleware.LocalsUser).(*models.User); ok && u != nil {
		actorID = u.ID
	}

	entry := &models.AuditLog{
		WorkspaceID:  workspaceID,
		UserID:       actorID,
		Action:       action,
		ResourceType: resourceType,
		ResourceID:   resourceID,
		Metadata:     models.JSONMap(metadata),
		IPAddress:    c.IP(),
		UserAgent:    c.Get("User-Agent"),
	}

	go func(e *models.AuditLog) {
		if err := db.WithContext(context.Background()).Create(e).Error; err != nil {
			log.Warn("audit log write failed", zap.Error(err), zap.String("action", e.Action))
		}
	}(entry)
}
