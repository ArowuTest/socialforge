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

// GetPresignedUploadURL returns a pre-signed upload URL for client-side media uploads.
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

	h.log.Info("GetPresignedUploadURL",
		zap.String("workspace_id", wid.String()),
		zap.String("key", key),
		zap.String("content_type", req.ContentType),
	)

	return c.JSON(fiber.Map{
		"upload_url": result.UploadURL,
		"key":        result.Key,
		"public_url": result.PublicURL,
	})
}

// ── ListMedia ─────────────────────────────────────────────────────────────────

// ListMedia returns a paginated list of media items for a workspace.
// GET /api/v1/workspaces/:wid/media?page=1&limit=24&type=
func (h *MediaHandler) ListMedia(c *fiber.Ctx) error {
	_, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	page := max(1, c.QueryInt("page", 1))
	limit := clamp(c.QueryInt("limit", 24), 1, 100)

	// Media items are not yet tracked in a table — return empty for now.
	// A media_items migration can be added later to track uploads.
	return c.JSON(fiber.Map{
		"items": []interface{}{},
		"total": 0,
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

	if h.storage != nil && h.storage.IsConfigured() {
		if err := h.storage.Delete(c.Context(), key); err != nil {
			h.log.Error("failed to delete from storage", zap.Error(err), zap.String("key", key))
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to delete media from storage",
				"code":  "STORAGE_DELETE_FAILED",
			})
		}
	}

	h.log.Info("DeleteMedia",
		zap.String("workspace_id", wid.String()),
		zap.String("key", key),
	)

	return c.JSON(fiber.Map{"message": "media deleted successfully"})
}
