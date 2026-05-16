// Package handlers — Smart Hashtag Groups.
//
// CRUD for workspace-scoped named hashtag bundles. Editors save groups like
// "Marketing", "Launch Week", "Education" then click-to-insert in compose.
//
// All four mutations are audit-logged. Caps (max groups per workspace + max
// hashtags per group) are admin-configurable via platform_settings.
package handlers

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/models"
	"github.com/socialforge/backend/internal/services/billing"
)

// HashtagGroupsHandler holds dependencies.
type HashtagGroupsHandler struct {
	db  *gorm.DB
	log *zap.Logger
}

func NewHashtagGroupsHandler(db *gorm.DB, log *zap.Logger) *HashtagGroupsHandler {
	return &HashtagGroupsHandler{db: db, log: log.Named("hashtag_groups")}
}

// hashtagRegex validates a single hashtag: must start with #, then 1+ chars
// of [A-Za-z0-9_]. Same shape the major platforms accept.
var hashtagRegex = regexp.MustCompile(`^#[A-Za-z0-9_]+$`)

type upsertHashtagGroupRequest struct {
	Name     string   `json:"name"`
	Hashtags []string `json:"hashtags"`
}

// ListHashtagGroups returns all groups for the workspace, sorted by name.
// GET /api/v1/workspaces/:wid/hashtag-groups
func (h *HashtagGroupsHandler) ListHashtagGroups(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}
	var groups []models.HashtagGroup
	if err := h.db.WithContext(c.Context()).
		Where("workspace_id = ?", wid).
		Order("name ASC").
		Find(&groups).Error; err != nil {
		h.log.Error("ListHashtagGroups: db", zap.Error(err))
		return internalError(c, "failed to load hashtag groups")
	}
	return c.JSON(fiber.Map{"data": groups})
}

// CreateHashtagGroup adds a new named group.
// POST /api/v1/workspaces/:wid/hashtag-groups
func (h *HashtagGroupsHandler) CreateHashtagGroup(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}
	if currentUser(c) == nil {
		return unauthorised(c, "not authenticated")
	}

	var req upsertHashtagGroupRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid body", "INVALID_BODY")
	}
	name, normalisedTags, vErr := h.validatePayload(c.Context(), req)
	if vErr != nil {
		return vErr
	}

	// Per-workspace count cap.
	maxGroups := billing.LoadIntSetting(c.Context(), h.db, "hashtag_max_groups_per_workspace", 50)
	if maxGroups <= 0 {
		maxGroups = 50
	}
	var existingCount int64
	h.db.WithContext(c.Context()).Model(&models.HashtagGroup{}).
		Where("workspace_id = ?", wid).Count(&existingCount)
	if existingCount >= int64(maxGroups) {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": fmt.Sprintf("group limit reached (%d per workspace) — delete one first", maxGroups),
			"code":  "GROUP_LIMIT_REACHED",
		})
	}

	g := &models.HashtagGroup{
		WorkspaceID: wid,
		Name:        name,
		Hashtags:    models.StringSlice(normalisedTags),
	}
	if err := h.db.WithContext(c.Context()).Create(g).Error; err != nil {
		// Likely uniqueness violation (workspace_id, name)
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique") {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"error": "a group with that name already exists",
				"code":  "NAME_TAKEN",
			})
		}
		h.log.Error("CreateHashtagGroup: db.Create", zap.Error(err))
		return internalError(c, "failed to create group")
	}

	writeAudit(c, h.db, h.log, wid, "hashtag_group.created", "hashtag_group", g.ID.String(),
		map[string]any{"name": g.Name, "count": len(normalisedTags)})
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": g})
}

// UpdateHashtagGroup edits an existing group.
// PATCH /api/v1/workspaces/:wid/hashtag-groups/:groupId
func (h *HashtagGroupsHandler) UpdateHashtagGroup(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}
	gid, err := uuid.Parse(c.Params("groupId"))
	if err != nil {
		return badRequest(c, "groupId must be a valid UUID", "INVALID_ID")
	}
	if currentUser(c) == nil {
		return unauthorised(c, "not authenticated")
	}

	var g models.HashtagGroup
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", gid, wid).First(&g).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "group not found", "NOT_FOUND")
		}
		return internalError(c, "failed to load group")
	}

	var req upsertHashtagGroupRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid body", "INVALID_BODY")
	}
	name, normalisedTags, vErr := h.validatePayload(c.Context(), req)
	if vErr != nil {
		return vErr
	}

	g.Name = name
	g.Hashtags = models.StringSlice(normalisedTags)
	if err := h.db.WithContext(c.Context()).Save(&g).Error; err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique") {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"error": "a group with that name already exists",
				"code":  "NAME_TAKEN",
			})
		}
		h.log.Error("UpdateHashtagGroup: db.Save", zap.Error(err))
		return internalError(c, "failed to update group")
	}

	writeAudit(c, h.db, h.log, wid, "hashtag_group.updated", "hashtag_group", g.ID.String(),
		map[string]any{"name": g.Name, "count": len(normalisedTags)})
	return c.JSON(fiber.Map{"data": g})
}

// DeleteHashtagGroup removes a group.
// DELETE /api/v1/workspaces/:wid/hashtag-groups/:groupId
func (h *HashtagGroupsHandler) DeleteHashtagGroup(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}
	gid, err := uuid.Parse(c.Params("groupId"))
	if err != nil {
		return badRequest(c, "groupId must be a valid UUID", "INVALID_ID")
	}
	if currentUser(c) == nil {
		return unauthorised(c, "not authenticated")
	}

	var g models.HashtagGroup
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", gid, wid).First(&g).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "group not found", "NOT_FOUND")
		}
		return internalError(c, "failed to load group")
	}
	if err := h.db.WithContext(c.Context()).Delete(&g).Error; err != nil {
		h.log.Error("DeleteHashtagGroup: db.Delete", zap.Error(err))
		return internalError(c, "failed to delete group")
	}
	writeAudit(c, h.db, h.log, wid, "hashtag_group.deleted", "hashtag_group", g.ID.String(),
		map[string]any{"name": g.Name})
	return c.JSON(fiber.Map{"data": fiber.Map{"deleted": true}})
}

// validatePayload normalises and checks the request body. Returns the cleaned
// name, the normalised+deduplicated hashtags, or a fiber error if validation
// failed.
func (h *HashtagGroupsHandler) validatePayload(ctx context.Context, req upsertHashtagGroupRequest) (string, []string, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return "", nil, fiber.NewError(fiber.StatusBadRequest, "name is required")
	}
	if len(name) > 50 {
		return "", nil, fiber.NewError(fiber.StatusBadRequest, "name too long (max 50 chars)")
	}

	if len(req.Hashtags) == 0 {
		return "", nil, fiber.NewError(fiber.StatusBadRequest, "at least one hashtag is required")
	}

	maxTags := billing.LoadIntSetting(ctx, h.db, "hashtag_max_per_group", 30)
	if maxTags <= 0 {
		maxTags = 30
	}
	if len(req.Hashtags) > maxTags {
		return "", nil, fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("too many hashtags (max %d per group)", maxTags))
	}

	// Normalise: trim, ensure leading #, validate format, dedupe (case-insensitive).
	seen := make(map[string]struct{}, len(req.Hashtags))
	out := make([]string, 0, len(req.Hashtags))
	for _, raw := range req.Hashtags {
		t := strings.TrimSpace(raw)
		if t == "" {
			continue
		}
		if !strings.HasPrefix(t, "#") {
			t = "#" + t
		}
		if len(t) < 2 || len(t) > 100 {
			return "", nil, fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("invalid hashtag length: %q", raw))
		}
		if !hashtagRegex.MatchString(t) {
			return "", nil, fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("invalid hashtag (allowed: # + letters/numbers/underscore): %q", raw))
		}
		key := strings.ToLower(t)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, t)
	}
	if len(out) == 0 {
		return "", nil, fiber.NewError(fiber.StatusBadRequest, "no valid hashtags after normalisation")
	}
	return name, out, nil
}
