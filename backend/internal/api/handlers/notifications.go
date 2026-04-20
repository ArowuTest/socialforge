package handlers

import (
	"math"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/models"
)

// NotificationsHandler serves in-app notification endpoints.
type NotificationsHandler struct {
	db  *gorm.DB
	log *zap.Logger
}

// NewNotificationsHandler constructs the handler.
func NewNotificationsHandler(db *gorm.DB, log *zap.Logger) *NotificationsHandler {
	return &NotificationsHandler{db: db, log: log.Named("notifications_handler")}
}

// ─── ListNotifications ────────────────────────────────────────────────────────

// ListNotifications returns paginated in-app notifications for the requesting user.
// GET /api/v1/workspaces/:workspaceId/notifications
func (h *NotificationsHandler) ListNotifications(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	userID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return unauthorised(c, "missing user identity")
	}

	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 20)
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	// Optional filter: unread only.
	onlyUnread := c.QueryBool("unread", false)

	q := h.db.WithContext(c.Context()).
		Where("workspace_id = ? AND user_id = ?", wid, userID)
	if onlyUnread {
		q = q.Where("is_read = false")
	}

	var total int64
	if err := q.Model(&models.Notification{}).Count(&total).Error; err != nil {
		h.log.Error("ListNotifications: count", zap.Error(err))
		return internalError(c, "failed to count notifications")
	}

	var notifications []models.Notification
	if err := q.Order("created_at DESC").
		Limit(limit).Offset(offset).
		Find(&notifications).Error; err != nil {
		h.log.Error("ListNotifications: query", zap.Error(err))
		return internalError(c, "failed to fetch notifications")
	}

	// Count total unread for badge display.
	var unreadCount int64
	h.db.WithContext(c.Context()).Model(&models.Notification{}).
		Where("workspace_id = ? AND user_id = ? AND is_read = false", wid, userID).
		Count(&unreadCount)

	return c.JSON(fiber.Map{
		"data": notifications,
		"pagination": fiber.Map{
			"page":        page,
			"page_size":   limit,
			"total":       total,
			"total_pages": int(math.Ceil(float64(total) / float64(limit))),
		},
		"unread_count": unreadCount,
	})
}

// ─── MarkRead ─────────────────────────────────────────────────────────────────

// MarkRead marks a single notification as read.
// PATCH /api/v1/workspaces/:workspaceId/notifications/:id/read
func (h *NotificationsHandler) MarkRead(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	userID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return unauthorised(c, "missing user identity")
	}

	notifID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "notification id must be a valid UUID", "INVALID_ID")
	}

	result := h.db.WithContext(c.Context()).
		Model(&models.Notification{}).
		Where("id = ? AND workspace_id = ? AND user_id = ?", notifID, wid, userID).
		Update("is_read", true)
	if result.Error != nil {
		h.log.Error("MarkRead: update", zap.Error(result.Error))
		return internalError(c, "failed to mark notification as read")
	}
	if result.RowsAffected == 0 {
		return notFound(c, "notification not found", "NOT_FOUND")
	}

	return c.JSON(fiber.Map{"success": true})
}

// ─── MarkAllRead ──────────────────────────────────────────────────────────────

// MarkAllRead marks every unread notification for the user as read.
// POST /api/v1/workspaces/:workspaceId/notifications/read-all
func (h *NotificationsHandler) MarkAllRead(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	userID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return unauthorised(c, "missing user identity")
	}

	result := h.db.WithContext(c.Context()).
		Model(&models.Notification{}).
		Where("workspace_id = ? AND user_id = ? AND is_read = false", wid, userID).
		Update("is_read", true)
	if result.Error != nil {
		h.log.Error("MarkAllRead: update", zap.Error(result.Error))
		return internalError(c, "failed to mark notifications as read")
	}

	return c.JSON(fiber.Map{"success": true, "marked": result.RowsAffected})
}

// ─── UnreadCount ──────────────────────────────────────────────────────────────

// UnreadCount returns just the unread notification count (cheap badge poll).
// GET /api/v1/workspaces/:workspaceId/notifications/unread-count
func (h *NotificationsHandler) UnreadCount(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	userID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return unauthorised(c, "missing user identity")
	}

	var count int64
	if err := h.db.WithContext(c.Context()).Model(&models.Notification{}).
		Where("workspace_id = ? AND user_id = ? AND is_read = false", wid, userID).
		Count(&count).Error; err != nil {
		h.log.Error("UnreadCount: query", zap.Error(err))
		return internalError(c, "failed to count unread notifications")
	}

	return c.JSON(fiber.Map{"unread_count": count})
}
