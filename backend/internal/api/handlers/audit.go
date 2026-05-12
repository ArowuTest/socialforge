package handlers

import (
	"context"
	"encoding/json"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/api/middleware"
	"github.com/socialforge/backend/internal/models"
)

// insertAuditRow writes an audit row via raw SQL so we can insert NULL for
// workspace_id/user_id when they don't apply (uuid.Nil) — the audit_logs
// schema has foreign keys to workspaces(id) and users(id) that would otherwise
// reject the zero UUID.
func insertAuditRow(
	db *gorm.DB,
	log *zap.Logger,
	workspaceID, userID uuid.UUID,
	action, resourceType, resourceID, ipAddress, userAgent string,
	metadata map[string]any,
) {
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
	var ipArg interface{}
	if ipAddress != "" {
		ipArg = ipAddress
	}

	go func() {
		err := db.WithContext(context.Background()).Exec(
			`INSERT INTO audit_logs
			    (workspace_id, user_id, action, resource_type, resource_id,
			     metadata, ip_address, user_agent, created_at)
			 VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::inet, ?, NOW())`,
			wsArg, userArg, action, resourceType, resArg,
			metaArg, ipArg, userAgent,
		).Error
		if err != nil {
			log.Warn("audit log write failed", zap.Error(err), zap.String("action", action))
		}
	}()
}

// writeAudit appends an audit log entry fire-and-forget. It never blocks the
// request and never returns an error to the caller — audit failures are logged
// but must not break the actual operation.
//
// workspaceID may be uuid.Nil for actions without workspace context.
// Actor is pulled from Fiber locals when available.
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
	insertAuditRow(db, log, workspaceID, actorID, action, resourceType, resourceID,
		c.IP(), c.Get("User-Agent"), metadata)
}

// writeAuditAs is like writeAudit but takes an explicit actor user ID, for
// flows where the user isn't yet in c.Locals (login, register, password reset).
// Pass uuid.Nil for userID on anonymous failures.
func writeAuditAs(
	c *fiber.Ctx,
	db *gorm.DB,
	log *zap.Logger,
	userID uuid.UUID,
	workspaceID uuid.UUID,
	action, resourceType, resourceID string,
	metadata map[string]any,
) {
	insertAuditRow(db, log, workspaceID, userID, action, resourceType, resourceID,
		c.IP(), c.Get("User-Agent"), metadata)
}
