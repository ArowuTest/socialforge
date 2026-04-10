package handlers

import (
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/api/middleware"
	"github.com/socialforge/backend/internal/models"
	"github.com/socialforge/backend/internal/services/storage"
)

// MediaHandler handles media library endpoints.
type MediaHandler struct {
	db      *gorm.DB
	log     *zap.Logger
	storage *storage.Service
}

// NewMediaHandler creates a new MediaHandler.
// storage may be nil if object storage is not configured.
func NewMediaHandler(db *gorm.DB, storageSvc *storage.Service, log *zap.Logger) *MediaHandler {
	return &MediaHandler{
		db:      db,
		log:     log.Named("media"),
		storage: storageSvc,
	}
}

// ── GetPresignedUploadURL ─────────────────────────────────────────────────────

type presignRequest struct {
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	SizeBytes   int64  `json:"size_bytes"`
}

// GetPresignedUploadURL returns a pre-signed upload URL for client-side media uploads
// and records the pending upload in the media_items table.
// POST /api/v1/workspaces/:wid/media/presign
func (h *MediaHandler) GetPresignedUploadURL(c *fiber.Ctx) error {
	if h.storage == nil || !h.storage.IsConfigured() {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"error":   "Storage not configured",
			"code":    "STORAGE_NOT_CONFIGURED",
			"message": "Object storage is not configured. Please set STORAGE_* environment variables.",
		})
	}

	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "not authenticated")
	}

	var req presignRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	if req.Filename == "" {
		return badRequest(c, "filename is required", "VALIDATION_ERROR")
	}
	if req.ContentType == "" {
		return badRequest(c, "content_type is required", "VALIDATION_ERROR")
	}

	// Validate content type is image/* or video/*
	if !strings.HasPrefix(req.ContentType, "image/") && !strings.HasPrefix(req.ContentType, "video/") {
		return badRequest(c, "content_type must be image/* or video/*", "VALIDATION_ERROR")
	}

	mediaType := "image"
	if strings.HasPrefix(req.ContentType, "video/") {
		mediaType = "video"
	}

	// Generate a unique storage key
	fileUUID := uuid.New().String()
	key := fmt.Sprintf("workspaces/%s/media/%s/%s", wid.String(), fileUUID, req.Filename)

	result, err := h.storage.PresignPut(c.Context(), key, req.ContentType, 0)
	if err != nil {
		h.log.Error("failed to generate presigned URL", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to generate upload URL",
			"code":  "PRESIGN_FAILED",
		})
	}

	// Record the media item in the DB so it appears in the library immediately.
	// The public_url is set now; size_bytes will be 0 until confirmed by client.
	mediaItem := &models.MediaItem{
		WorkspaceID:  wid,
		UploadedByID: user.ID,
		Filename:     req.Filename,
		ContentType:  req.ContentType,
		SizeBytes:    req.SizeBytes,
		StorageKey:   result.Key,
		PublicURL:    result.PublicURL,
		MediaType:    mediaType,
	}
	if err := h.db.WithContext(c.Context()).Create(mediaItem).Error; err != nil {
		// Non-fatal: log the error but still return the presign URL so the upload can proceed.
		h.log.Warn("failed to record media item in DB",
			zap.Error(err),
			zap.String("key", key),
		)
	}

	h.log.Info("GetPresignedUploadURL",
		zap.String("workspace_id", wid.String()),
		zap.String("key", key),
		zap.String("content_type", req.ContentType),
	)

	return c.JSON(fiber.Map{
		"upload_url": result.UploadURL,
		"key":        result.Key,
		"public_url": result.PublicURL,
		"media_id":   mediaItem.ID,
	})
}

// ── ListMedia ─────────────────────────────────────────────────────────────────

// ListMedia returns a paginated list of media items for a workspace.
// GET /api/v1/workspaces/:wid/media?page=1&limit=24&type=
func (h *MediaHandler) ListMedia(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	page := max(1, c.QueryInt("page", 1))
	limit := clamp(c.QueryInt("limit", 24), 1, 100)
	offset := (page - 1) * limit
	mediaTypeFilter := c.Query("type") // "image" | "video" | "" (all)

	query := h.db.WithContext(c.Context()).
		Model(&models.MediaItem{}).
		Where("workspace_id = ?", wid)

	if mediaTypeFilter == "image" || mediaTypeFilter == "video" {
		query = query.Where("media_type = ?", mediaTypeFilter)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		h.log.Error("ListMedia: count query", zap.Error(err))
		return internalError(c, "failed to list media")
	}

	var items []models.MediaItem
	if err := query.
		Order("created_at DESC").
		Offset(offset).
		Limit(limit).
		Find(&items).Error; err != nil {
		h.log.Error("ListMedia: find query", zap.Error(err))
		return internalError(c, "failed to list media")
	}

	return c.JSON(fiber.Map{
		"items": items,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

// ── DeleteMedia ───────────────────────────────────────────────────────────────

// DeleteMedia deletes a media item by its storage key.
// DELETE /api/v1/workspaces/:wid/media/:key
func (h *MediaHandler) DeleteMedia(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	key := c.Params("key")
	if key == "" {
		return badRequest(c, "key is required", "VALIDATION_ERROR")
	}

	// Delete from storage first.
	if h.storage != nil && h.storage.IsConfigured() {
		if err := h.storage.Delete(c.Context(), key); err != nil {
			h.log.Error("failed to delete from storage", zap.Error(err), zap.String("key", key))
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to delete media from storage",
				"code":  "STORAGE_DELETE_FAILED",
			})
		}
	}

	// Remove from DB. Only delete records belonging to this workspace.
	if err := h.db.WithContext(c.Context()).
		Where("storage_key = ? AND workspace_id = ?", key, wid).
		Delete(&models.MediaItem{}).Error; err != nil {
		h.log.Warn("DeleteMedia: db delete failed", zap.Error(err), zap.String("key", key))
		// Non-fatal — storage object is already deleted.
	}

	h.log.Info("DeleteMedia",
		zap.String("workspace_id", wid.String()),
		zap.String("key", key),
	)

	return c.JSON(fiber.Map{"message": "media deleted successfully"})
}
