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
)

// MediaHandler handles media library endpoints.
type MediaHandler struct {
	db              *gorm.DB
	log             *zap.Logger
	storageEndpoint string
	storageBucket   string
	storageKey      string
	storageSecret   string
}

// NewMediaHandler creates a new MediaHandler.
func NewMediaHandler(db *gorm.DB, storageEndpoint, storageBucket, storageKey, storageSecret string, log *zap.Logger) *MediaHandler {
	return &MediaHandler{
		db:              db,
		log:             log.Named("media"),
		storageEndpoint: storageEndpoint,
		storageBucket:   storageBucket,
		storageKey:      storageKey,
		storageSecret:   storageSecret,
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

	// Build public URL (placeholder until AWS SDK presign is wired up)
	publicBase := h.storageEndpoint
	if publicBase == "" {
		publicBase = "https://storage.socialforge.io"
	}
	publicURL := fmt.Sprintf("%s/%s/%s", publicBase, h.storageBucket, key)

	// Placeholder upload URL — real implementation requires aws/aws-sdk-go-v2 presigning
	uploadURL := fmt.Sprintf("%s/%s/%s?upload=1", publicBase, h.storageBucket, key)

	h.log.Info("GetPresignedUploadURL",
		zap.String("workspace_id", wid.String()),
		zap.String("key", key),
		zap.String("content_type", req.ContentType),
	)

	return c.JSON(fiber.Map{
		"upload_url": uploadURL,
		"key":        key,
		"public_url": publicURL,
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

	// Placeholder: real implementation will query a media table
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

	h.log.Info("DeleteMedia",
		zap.String("workspace_id", wid.String()),
		zap.String("key", key),
	)

	// Placeholder: real implementation will call the storage provider to delete the object
	return c.JSON(fiber.Map{"message": "media deleted successfully"})
}
