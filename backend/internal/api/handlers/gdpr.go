package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/api/middleware"
	"github.com/socialforge/backend/internal/models"
)

// GDPRHandler implements GDPR Article 17 (right to erasure) and Article 20
// (data portability) endpoints for user account management.
type GDPRHandler struct {
	db  *gorm.DB
	log *zap.Logger
}

// NewGDPRHandler constructs a GDPRHandler.
func NewGDPRHandler(db *gorm.DB, log *zap.Logger) *GDPRHandler {
	return &GDPRHandler{db: db, log: log.Named("gdpr_handler")}
}

// DeleteAccount permanently deletes the authenticated user's account and all
// associated data. This implements GDPR Article 17 (right to erasure).
// DELETE /api/v1/auth/account
func (h *GDPRHandler) DeleteAccount(c *fiber.Ctx) error {
	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "authentication required")
	}

	type confirmBody struct {
		Confirm string `json:"confirm"` // Must be "DELETE" to proceed
	}
	var body confirmBody
	if err := c.BodyParser(&body); err != nil || body.Confirm != "DELETE" {
		return badRequest(c, "send {\"confirm\": \"DELETE\"} to proceed", "CONFIRMATION_REQUIRED")
	}

	h.log.Warn("GDPR: account deletion requested",
		zap.String("user_id", user.ID.String()),
		zap.String("email", user.Email),
	)

	// Write the audit row BEFORE the cascade starts. Two reasons:
	// (1) the user row itself is deleted in step 10, so capture the actor's
	//     identifying info while we still have it; (2) GDPR Article 30 (records
	//     of processing activities) and Article 17(2) require us to keep a
	//     record of the erasure request — the audit_logs table is the right
	//     place. workspace_id is nil so the row isn't itself deleted by
	//     step 8's workspace-scoped audit_logs sweep.
	writeAuditAs(c, h.db, h.log, user.ID, uuid.Nil,
		"account.deleted", "user", user.ID.String(),
		map[string]any{
			"email":            user.Email,
			"name":             user.Name,
			"deletion_request": "gdpr_article_17",
		})

	// Run the cascade deletion in a transaction.
	err := h.db.Transaction(func(tx *gorm.DB) error {
		ctx := c.Context()
		userID := user.ID

		// 1. Delete all social accounts (tokens are encrypted, cascade removes them)
		if err := tx.WithContext(ctx).Where("workspace_id IN (SELECT id FROM workspaces WHERE owner_id = ?)", userID).Delete(&models.SocialAccount{}).Error; err != nil {
			return err
		}

		// 2. Delete all posts
		if err := tx.WithContext(ctx).Where("workspace_id IN (SELECT id FROM workspaces WHERE owner_id = ?)", userID).Delete(&models.Post{}).Error; err != nil {
			return err
		}

		// 3. Delete all AI jobs
		if err := tx.WithContext(ctx).Where("workspace_id IN (SELECT id FROM workspaces WHERE owner_id = ?)", userID).Delete(&models.AIJob{}).Error; err != nil {
			return err
		}

		// 4. Delete schedule slots
		if err := tx.WithContext(ctx).Where("workspace_id IN (SELECT id FROM workspaces WHERE owner_id = ?)", userID).Delete(&models.ScheduleSlot{}).Error; err != nil {
			return err
		}

		// 5. Delete workspace memberships (for all workspaces the user owns)
		if err := tx.WithContext(ctx).Where("workspace_id IN (SELECT id FROM workspaces WHERE owner_id = ?)", userID).Delete(&models.WorkspaceMember{}).Error; err != nil {
			return err
		}

		// 6. Remove user from workspaces they're a member of (but don't own)
		if err := tx.WithContext(ctx).Where("user_id = ?", userID).Delete(&models.WorkspaceMember{}).Error; err != nil {
			return err
		}

		// 7. Delete API keys
		if err := tx.WithContext(ctx).Where("user_id = ?", userID).Delete(&models.ApiKey{}).Error; err != nil {
			return err
		}

		// 8. Delete audit logs for user's workspaces
		if err := tx.WithContext(ctx).Where("workspace_id IN (SELECT id FROM workspaces WHERE owner_id = ?)", userID).Delete(&models.AuditLog{}).Error; err != nil {
			return err
		}

		// 9. Delete owned workspaces
		if err := tx.WithContext(ctx).Where("owner_id = ?", userID).Delete(&models.Workspace{}).Error; err != nil {
			return err
		}

		// 10. Finally delete the user record
		if err := tx.WithContext(ctx).Delete(&models.User{}, "id = ?", userID).Error; err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		h.log.Error("GDPR: account deletion failed", zap.Error(err), zap.String("user_id", user.ID.String()))
		return internalError(c, "failed to delete account — please contact support")
	}

	h.log.Warn("GDPR: account deleted successfully", zap.String("user_id", user.ID.String()))

	return c.JSON(fiber.Map{
		"data": fiber.Map{
			"message":    "your account and all associated data have been permanently deleted",
			"deleted_at": time.Now().UTC().Format(time.RFC3339),
		},
	})
}

// ExportData exports all user data as JSON for GDPR Article 20 (data portability).
// GET /api/v1/auth/account/export
func (h *GDPRHandler) ExportData(c *fiber.Ctx) error {
	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "authentication required")
	}

	ctx := c.Context()

	// Collect user data
	var workspaces []models.Workspace
	h.db.WithContext(ctx).Where("owner_id = ?", user.ID).Find(&workspaces)

	var posts []models.Post
	for _, ws := range workspaces {
		var wsPosts []models.Post
		h.db.WithContext(ctx).Where("workspace_id = ?", ws.ID).Find(&wsPosts)
		posts = append(posts, wsPosts...)
	}

	var accounts []models.SocialAccount
	for _, ws := range workspaces {
		var wsAccounts []models.SocialAccount
		h.db.WithContext(ctx).Where("workspace_id = ?", ws.ID).Find(&wsAccounts)
		// Strip tokens from export
		for i := range wsAccounts {
			wsAccounts[i].AccessToken = "[REDACTED]"
			wsAccounts[i].RefreshToken = "[REDACTED]"
		}
		accounts = append(accounts, wsAccounts...)
	}

	export := fiber.Map{
		"user": fiber.Map{
			"id":         user.ID,
			"name":       user.Name,
			"email":      user.Email,
			"created_at": user.CreatedAt,
		},
		"workspaces":      workspaces,
		"social_accounts": accounts,
		"posts":           posts,
		"exported_at":     time.Now().UTC().Format(time.RFC3339),
	}

	// GDPR Article 20 (right to data portability) — record the export request
	// so we can prove the access was honoured if the user later disputes it.
	writeAudit(c, h.db, h.log, uuid.Nil, "account.exported", "user", user.ID.String(),
		map[string]any{
			"workspace_count":      len(workspaces),
			"post_count":           len(posts),
			"social_account_count": len(accounts),
			"export_request":       "gdpr_article_20",
		})

	c.Set("Content-Disposition", "attachment; filename=socialforge-data-export.json")
	return c.JSON(export)
}
