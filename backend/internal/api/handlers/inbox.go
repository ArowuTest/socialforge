package handlers

import (
	"context"
	"math"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/models"
	"github.com/socialforge/backend/internal/repository"
)

// InboxReplier is the interface the handler uses to post replies to a platform.
// Implemented by platform clients (e.g. instagram.Client).
type InboxReplier interface {
	ReplyToMessage(ctx context.Context, account *models.SocialAccount, externalID, replyText string) error
}

// InboxHandler serves the unified social inbox endpoints.
type InboxHandler struct {
	db       *gorm.DB
	repo     repository.InboxRepository
	repliers map[string]InboxReplier // platform → InboxReplier
	log      *zap.Logger
}

// NewInboxHandler creates a new InboxHandler.
func NewInboxHandler(db *gorm.DB, repliers map[string]InboxReplier, log *zap.Logger) *InboxHandler {
	return &InboxHandler{
		db:       db,
		repo:     repository.NewInboxRepo(db),
		repliers: repliers,
		log:      log.Named("inbox_handler"),
	}
}

// ─── ListInbox ────────────────────────────────────────────────────────────────

// ListInbox returns a paginated list of inbox messages for the workspace.
// GET /api/v1/workspaces/:workspaceId/inbox
//
// Query params:
//
//	platform     – filter by platform name
//	message_type – filter by type (comment | mention | dm)
//	unread       – "true" to show only unread messages
//	page         – page number (default 1)
//	limit        – page size (default 20, max 100)
func (h *InboxHandler) ListInbox(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 20)

	f := repository.InboxFilter{
		WorkspaceID: wid,
		Page:        page,
		Limit:       limit,
		Platform:    c.Query("platform"),
		MessageType: c.Query("message_type"),
	}
	if c.Query("unread") == "true" {
		b := true
		f.IsRead = &b
		// Actually we want unread=true → IsRead=false
		// Correct it:
		b = false
		f.IsRead = &b
	}
	if raw := c.Query("account_id"); raw != "" {
		if aid, err := uuid.Parse(raw); err == nil {
			f.SocialAccountID = &aid
		}
	}

	msgs, total, err := h.repo.List(c.Context(), f)
	if err != nil {
		h.log.Error("ListInbox: query", zap.Error(err))
		return internalError(c, "failed to fetch inbox messages")
	}

	unread, _ := h.repo.UnreadCount(c.Context(), wid)

	return c.JSON(fiber.Map{
		"data": msgs,
		"pagination": fiber.Map{
			"page":        page,
			"page_size":   limit,
			"total":       total,
			"total_pages": int(math.Ceil(float64(total) / float64(limit))),
		},
		"unread_count": unread,
	})
}

// ─── UnreadCount ──────────────────────────────────────────────────────────────

// UnreadCount returns just the unread message count (cheap badge poll).
// GET /api/v1/workspaces/:workspaceId/inbox/unread-count
func (h *InboxHandler) UnreadCount(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	count, err := h.repo.UnreadCount(c.Context(), wid)
	if err != nil {
		h.log.Error("UnreadCount: query", zap.Error(err))
		return internalError(c, "failed to count unread messages")
	}

	return c.JSON(fiber.Map{"unread_count": count})
}

// ─── MarkRead ─────────────────────────────────────────────────────────────────

// MarkRead marks a single inbox message as read.
// PATCH /api/v1/workspaces/:workspaceId/inbox/:id/read
func (h *InboxHandler) MarkRead(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "message id must be a valid UUID", "INVALID_ID")
	}

	if err := h.repo.MarkRead(c.Context(), wid, id); err != nil {
		h.log.Error("MarkRead: update", zap.Error(err))
		return internalError(c, "failed to mark message as read")
	}

	return c.JSON(fiber.Map{"success": true})
}

// ─── MarkAllRead ──────────────────────────────────────────────────────────────

// MarkAllRead marks every unread inbox message in the workspace as read.
// POST /api/v1/workspaces/:workspaceId/inbox/read-all
func (h *InboxHandler) MarkAllRead(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	if err := h.repo.MarkAllRead(c.Context(), wid); err != nil {
		h.log.Error("MarkAllRead: update", zap.Error(err))
		return internalError(c, "failed to mark all messages as read")
	}

	return c.JSON(fiber.Map{"success": true})
}

// ─── ReplyToMessage ───────────────────────────────────────────────────────────

// ReplyToMessage sends a reply to an inbox message via the platform API.
// POST /api/v1/workspaces/:workspaceId/inbox/:id/reply
//
// Body: { "text": "your reply" }
func (h *InboxHandler) ReplyToMessage(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "workspace id must be a valid UUID", "INVALID_ID")
	}

	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "message id must be a valid UUID", "INVALID_ID")
	}

	var body struct {
		Text string `json:"text"`
	}
	if err := c.BodyParser(&body); err != nil || body.Text == "" {
		return badRequest(c, "request body must include a non-empty 'text' field", "INVALID_BODY")
	}

	msg, err := h.repo.GetByID(c.Context(), wid, id)
	if err != nil {
		return notFound(c, "inbox message not found", "NOT_FOUND")
	}

	// Fetch the social account so the replier can decrypt the access token.
	var account models.SocialAccount
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", msg.SocialAccountID, wid).
		First(&account).Error; err != nil {
		h.log.Error("ReplyToMessage: fetch account", zap.Error(err))
		return internalError(c, "failed to load social account")
	}

	replier, ok := h.repliers[msg.Platform]
	if !ok {
		return badRequest(c, "reply is not supported for platform: "+msg.Platform, "UNSUPPORTED_PLATFORM")
	}

	if err := replier.ReplyToMessage(c.Context(), &account, msg.ExternalID, body.Text); err != nil {
		h.log.Error("ReplyToMessage: platform error",
			zap.String("platform", msg.Platform),
			zap.Error(err),
		)
		return internalError(c, "failed to send reply: "+err.Error())
	}

	// Mark as read and record reply time.
	now := time.Now().UTC()
	if err := h.repo.SetReplied(c.Context(), wid, id, now); err != nil {
		h.log.Warn("ReplyToMessage: set replied_at failed", zap.Error(err))
	}

	return c.JSON(fiber.Map{"success": true, "replied_at": now})
}
