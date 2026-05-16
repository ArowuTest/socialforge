// Package handlers — Link-in-bio microsite builder.
//
// Three audiences, three access boundaries:
//
//   1. Workspace member (editor+): manage their own page + links via
//      /workspaces/:wid/bio (auth required).
//   2. Public visitor: render the live page via /bio/:slug (no auth, rate
//      limited at the edge).
//   3. Platform super-admin: moderate via /admin/bio/pages/:id/disable
//      (super-admin guard required).
//
// Click tracking is async (best-effort) and IP-hashed for privacy. The
// denormalised bio_links.click_count is updated in the same query so the
// public page render never has to aggregate.
package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/api/middleware"
	"github.com/socialforge/backend/internal/models"
	"github.com/socialforge/backend/internal/services/billing"
)

// BioHandler holds dependencies for all bio-page endpoints.
type BioHandler struct {
	db  *gorm.DB
	log *zap.Logger
}

func NewBioHandler(db *gorm.DB, log *zap.Logger) *BioHandler {
	return &BioHandler{db: db, log: log.Named("bio")}
}

// slugRegex mirrors the DB CHECK constraint; we validate in Go too so we
// can return a 400 with a clean message instead of bubbling a constraint
// violation up to the client.
var slugRegex = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$`)

// ── Workspace-scoped (auth required) ─────────────────────────────────────────

type upsertBioPageRequest struct {
	Slug        string `json:"slug"`
	Title       string `json:"title"`
	Description string `json:"description"`
	AvatarURL   string `json:"avatar_url"`
	Theme       string `json:"theme"`
}

// GetMyBioPage returns the workspace's bio page (with all links).
// Returns 404 with code NO_PAGE if none exists yet — frontend uses that to
// show the "create your bio page" CTA.
//
// GET /api/v1/workspaces/:wid/bio
func (h *BioHandler) GetMyBioPage(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}
	var page models.BioPage
	if err := h.db.WithContext(c.Context()).
		Preload("Links", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC, created_at ASC")
		}).
		Where("workspace_id = ?", wid).
		First(&page).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": "no bio page for this workspace yet",
				"code":  "NO_PAGE",
			})
		}
		return internalError(c, "failed to load bio page")
	}
	return c.JSON(fiber.Map{"data": page})
}

// UpsertBioPage creates or updates the workspace's bio page. One page per
// workspace (the unique index on workspace_id enforces this).
//
// POST /api/v1/workspaces/:wid/bio
func (h *BioHandler) UpsertBioPage(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}
	user := currentUser(c)
	if user == nil {
		return unauthorised(c, "not authenticated")
	}

	var req upsertBioPageRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid body", "INVALID_BODY")
	}

	// Normalise.
	req.Slug = strings.ToLower(strings.TrimSpace(req.Slug))
	req.Title = strings.TrimSpace(req.Title)
	req.Description = strings.TrimSpace(req.Description)
	req.AvatarURL = strings.TrimSpace(req.AvatarURL)
	if req.Theme == "" {
		req.Theme = "default"
	}

	// Validate.
	if req.Slug == "" || !slugRegex.MatchString(req.Slug) {
		return badRequest(c, "slug must be 3–30 chars, lowercase a-z, 0-9 and dashes (start+end alphanumeric)", "VALIDATION_ERROR")
	}
	if len(req.Title) == 0 || len(req.Title) > 120 {
		return badRequest(c, "title is required (max 120 chars)", "VALIDATION_ERROR")
	}
	if len(req.Description) > 500 {
		return badRequest(c, "description too long (max 500 chars)", "VALIDATION_ERROR")
	}
	if req.AvatarURL != "" && !isValidHTTPURL(req.AvatarURL) {
		return badRequest(c, "avatar_url must be a valid http(s) URL", "VALIDATION_ERROR")
	}
	switch req.Theme {
	case "default", "dark", "minimal":
		// ok
	default:
		return badRequest(c, "theme must be one of: default, dark, minimal", "VALIDATION_ERROR")
	}

	// Slug must be unique across workspaces. Check before upsert so we can
	// return a clean conflict instead of a DB error.
	var conflictCount int64
	if err := h.db.WithContext(c.Context()).
		Model(&models.BioPage{}).
		Where("slug = ? AND workspace_id <> ?", req.Slug, wid).
		Count(&conflictCount).Error; err == nil && conflictCount > 0 {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": "that slug is already taken",
			"code":  "SLUG_TAKEN",
		})
	}

	// Upsert.
	var page models.BioPage
	err = h.db.WithContext(c.Context()).Where("workspace_id = ?", wid).First(&page).Error
	isNew := err == gorm.ErrRecordNotFound
	if err != nil && !isNew {
		return internalError(c, "failed to load existing page")
	}

	page.WorkspaceID = wid
	page.Slug = req.Slug
	page.Title = req.Title
	page.Description = req.Description
	page.AvatarURL = req.AvatarURL
	page.Theme = req.Theme

	if isNew {
		if err := h.db.WithContext(c.Context()).Create(&page).Error; err != nil {
			h.log.Error("UpsertBioPage: create", zap.Error(err))
			return internalError(c, "failed to create bio page")
		}
		writeAudit(c, h.db, h.log, wid, "bio.page_created", "bio_page", page.ID.String(),
			map[string]any{"slug": page.Slug, "title": page.Title})
	} else {
		if err := h.db.WithContext(c.Context()).Save(&page).Error; err != nil {
			h.log.Error("UpsertBioPage: save", zap.Error(err))
			return internalError(c, "failed to update bio page")
		}
		writeAudit(c, h.db, h.log, wid, "bio.page_updated", "bio_page", page.ID.String(),
			map[string]any{"slug": page.Slug, "title": page.Title})
	}

	return c.JSON(fiber.Map{"data": page})
}

// DeleteBioPage removes the workspace's bio page (and cascades to links).
// DELETE /api/v1/workspaces/:wid/bio
func (h *BioHandler) DeleteBioPage(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}
	user := currentUser(c)
	if user == nil {
		return unauthorised(c, "not authenticated")
	}

	var page models.BioPage
	if err := h.db.WithContext(c.Context()).Where("workspace_id = ?", wid).First(&page).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "no bio page to delete", "NO_PAGE")
		}
		return internalError(c, "failed to load bio page")
	}

	if err := h.db.WithContext(c.Context()).Delete(&page).Error; err != nil {
		h.log.Error("DeleteBioPage: delete", zap.Error(err))
		return internalError(c, "failed to delete bio page")
	}

	writeAudit(c, h.db, h.log, wid, "bio.page_deleted", "bio_page", page.ID.String(),
		map[string]any{"slug": page.Slug})

	return c.JSON(fiber.Map{"data": fiber.Map{"deleted": true}})
}

// ── Links ────────────────────────────────────────────────────────────────────

type upsertBioLinkRequest struct {
	Title     string `json:"title"`
	URL       string `json:"url"`
	Icon      string `json:"icon"`
	SortOrder *int   `json:"sort_order"`
	IsActive  *bool  `json:"is_active"`
}

// AddBioLink creates a new link on the workspace's bio page.
// POST /api/v1/workspaces/:wid/bio/links
func (h *BioHandler) AddBioLink(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}
	if currentUser(c) == nil {
		return unauthorised(c, "not authenticated")
	}

	var req upsertBioLinkRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid body", "INVALID_BODY")
	}
	req.Title = strings.TrimSpace(req.Title)
	req.URL = strings.TrimSpace(req.URL)

	if req.Title == "" || len(req.Title) > 200 {
		return badRequest(c, "title is required (max 200 chars)", "VALIDATION_ERROR")
	}
	if !isValidHTTPURL(req.URL) {
		return badRequest(c, "url must be a valid http(s) URL", "VALIDATION_ERROR")
	}
	if len(req.Icon) > 50 {
		return badRequest(c, "icon too long (max 50 chars)", "VALIDATION_ERROR")
	}

	// Load the page.
	var page models.BioPage
	if err := h.db.WithContext(c.Context()).Where("workspace_id = ?", wid).First(&page).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return badRequest(c, "create the bio page first before adding links", "NO_PAGE")
		}
		return internalError(c, "failed to load bio page")
	}

	// Enforce the admin-configurable per-page link cap.
	maxLinks := billing.LoadIntSetting(c.Context(), h.db, "bio_max_links_per_page", 25)
	if maxLinks <= 0 {
		maxLinks = 25
	}
	var existing int64
	h.db.WithContext(c.Context()).Model(&models.BioLink{}).
		Where("page_id = ?", page.ID).Count(&existing)
	if existing >= int64(maxLinks) {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": fmt.Sprintf("link limit reached (%d per page) — remove a link first", maxLinks),
			"code":  "LINK_LIMIT_REACHED",
		})
	}

	link := &models.BioLink{
		PageID:   page.ID,
		Title:    req.Title,
		URL:      req.URL,
		Icon:     req.Icon,
		IsActive: true,
	}
	if req.SortOrder != nil {
		link.SortOrder = *req.SortOrder
	} else {
		// Default to "append to end" — find the highest current sort_order + 1.
		var maxOrder int
		h.db.WithContext(c.Context()).Model(&models.BioLink{}).
			Where("page_id = ?", page.ID).
			Select("COALESCE(MAX(sort_order), -1) + 1").Scan(&maxOrder)
		link.SortOrder = maxOrder
	}
	if req.IsActive != nil {
		link.IsActive = *req.IsActive
	}

	if err := h.db.WithContext(c.Context()).Create(link).Error; err != nil {
		h.log.Error("AddBioLink: create", zap.Error(err))
		return internalError(c, "failed to add link")
	}

	writeAudit(c, h.db, h.log, wid, "bio.link_added", "bio_link", link.ID.String(),
		map[string]any{
			"page_id": page.ID.String(),
			"title":   link.Title,
			"url":     link.URL,
		})

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": link})
}

// UpdateBioLink edits an existing link.
// PATCH /api/v1/workspaces/:wid/bio/links/:linkId
func (h *BioHandler) UpdateBioLink(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}
	linkID, err := uuid.Parse(c.Params("linkId"))
	if err != nil {
		return badRequest(c, "linkId must be a valid UUID", "INVALID_ID")
	}
	if currentUser(c) == nil {
		return unauthorised(c, "not authenticated")
	}

	// Load + cross-workspace check via JOIN to bio_pages.
	var link models.BioLink
	err = h.db.WithContext(c.Context()).
		Joins("JOIN bio_pages ON bio_pages.id = bio_links.page_id").
		Where("bio_links.id = ? AND bio_pages.workspace_id = ?", linkID, wid).
		First(&link).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "link not found", "NOT_FOUND")
		}
		return internalError(c, "failed to load link")
	}

	var req upsertBioLinkRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid body", "INVALID_BODY")
	}
	req.Title = strings.TrimSpace(req.Title)
	req.URL = strings.TrimSpace(req.URL)
	if req.Title != "" {
		if len(req.Title) > 200 {
			return badRequest(c, "title too long (max 200 chars)", "VALIDATION_ERROR")
		}
		link.Title = req.Title
	}
	if req.URL != "" {
		if !isValidHTTPURL(req.URL) {
			return badRequest(c, "url must be a valid http(s) URL", "VALIDATION_ERROR")
		}
		link.URL = req.URL
	}
	if len(req.Icon) > 50 {
		return badRequest(c, "icon too long (max 50 chars)", "VALIDATION_ERROR")
	}
	link.Icon = req.Icon
	if req.SortOrder != nil {
		link.SortOrder = *req.SortOrder
	}
	if req.IsActive != nil {
		link.IsActive = *req.IsActive
	}

	if err := h.db.WithContext(c.Context()).Save(&link).Error; err != nil {
		h.log.Error("UpdateBioLink: save", zap.Error(err))
		return internalError(c, "failed to update link")
	}
	writeAudit(c, h.db, h.log, wid, "bio.link_updated", "bio_link", link.ID.String(),
		map[string]any{"title": link.Title, "url": link.URL})
	return c.JSON(fiber.Map{"data": link})
}

// DeleteBioLink removes a link.
// DELETE /api/v1/workspaces/:wid/bio/links/:linkId
func (h *BioHandler) DeleteBioLink(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}
	linkID, err := uuid.Parse(c.Params("linkId"))
	if err != nil {
		return badRequest(c, "linkId must be a valid UUID", "INVALID_ID")
	}
	if currentUser(c) == nil {
		return unauthorised(c, "not authenticated")
	}

	// Cross-workspace check first.
	var link models.BioLink
	err = h.db.WithContext(c.Context()).
		Joins("JOIN bio_pages ON bio_pages.id = bio_links.page_id").
		Where("bio_links.id = ? AND bio_pages.workspace_id = ?", linkID, wid).
		First(&link).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "link not found", "NOT_FOUND")
		}
		return internalError(c, "failed to load link")
	}

	if err := h.db.WithContext(c.Context()).Delete(&link).Error; err != nil {
		h.log.Error("DeleteBioLink: delete", zap.Error(err))
		return internalError(c, "failed to delete link")
	}
	writeAudit(c, h.db, h.log, wid, "bio.link_removed", "bio_link", link.ID.String(),
		map[string]any{"title": link.Title})
	return c.JSON(fiber.Map{"data": fiber.Map{"deleted": true}})
}

// ── Public route (no auth) ───────────────────────────────────────────────────

// GetPublicBioPage returns the public view of a bio page by slug. Returns 404
// if the page doesn't exist OR has been admin-disabled (don't leak the
// existence of disabled pages). Inactive links are filtered out.
//
// GET /api/v1/bio/:slug
func (h *BioHandler) GetPublicBioPage(c *fiber.Ctx) error {
	slug := strings.ToLower(strings.TrimSpace(c.Params("slug")))
	if slug == "" {
		return badRequest(c, "slug is required", "INVALID_SLUG")
	}

	var page models.BioPage
	if err := h.db.WithContext(c.Context()).
		Preload("Links", func(db *gorm.DB) *gorm.DB {
			return db.Where("is_active = TRUE").Order("sort_order ASC, created_at ASC")
		}).
		Where("slug = ? AND is_disabled = FALSE", slug).
		First(&page).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "page not found", "NOT_FOUND")
		}
		return internalError(c, "failed to load page")
	}

	// Public view: strip disabled_reason, workspace_id (privacy).
	return c.JSON(fiber.Map{"data": fiber.Map{
		"slug":        page.Slug,
		"title":       page.Title,
		"description": page.Description,
		"avatar_url":  page.AvatarURL,
		"theme":       page.Theme,
		"links":       page.Links,
	}})
}

// TrackBioLinkClick records an anonymous click. IP is hashed for privacy
// (we never persist raw IP). Best-effort: failures don't block the redirect.
// Click tracking can be disabled platform-wide via bio_click_tracking_enabled.
//
// POST /api/v1/bio/:slug/links/:linkId/click
func (h *BioHandler) TrackBioLinkClick(c *fiber.Ctx) error {
	slug := strings.ToLower(strings.TrimSpace(c.Params("slug")))
	linkID, err := uuid.Parse(c.Params("linkId"))
	if err != nil {
		return badRequest(c, "linkId must be a valid UUID", "INVALID_ID")
	}

	// Honour admin global toggle.
	enabled := billing.LoadBoolSetting(c.Context(), h.db, "bio_click_tracking_enabled", true)
	if !enabled {
		return c.JSON(fiber.Map{"data": fiber.Map{"tracked": false, "reason": "tracking disabled"}})
	}

	// Resolve the link, gated on the slug + active + page not disabled.
	var link models.BioLink
	err = h.db.WithContext(c.Context()).
		Joins("JOIN bio_pages ON bio_pages.id = bio_links.page_id").
		Where("bio_links.id = ? AND bio_pages.slug = ? AND bio_pages.is_disabled = FALSE AND bio_links.is_active = TRUE",
			linkID, slug).
		First(&link).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "link not found", "NOT_FOUND")
		}
		return internalError(c, "failed to track click")
	}

	// Capture every value from the request context BEFORE the goroutine —
	// *fiber.Ctx is pooled and recycled the moment this handler returns, so
	// accessing c.IP() / c.Get() asynchronously is a use-after-free and will
	// panic the worker (502 to subsequent requests). Same for *link if it
	// gets reassigned elsewhere — we copy the IDs out.
	ipRaw := c.IP()
	referer := c.Get("Referer")
	if len(referer) > 2048 {
		referer = referer[:2048]
	}
	ua := c.Get("User-Agent")
	if len(ua) > 512 {
		ua = ua[:512]
	}
	linkID2 := link.ID
	pageID2 := link.PageID

	// IP hashing: SHA-256 of the IP + static salt — gives us returning-visitor
	// analytics without persisting any PII.
	hash := sha256.Sum256([]byte(ipRaw + ":bio-link-salt"))
	ipHash := hex.EncodeToString(hash[:])

	// Async: insert detailed row + increment the denormalised counter.
	// db handle is process-scoped so it's safe to use from a goroutine.
	go func() {
		defer func() {
			if r := recover(); r != nil {
				h.log.Error("TrackBioLinkClick: panic in async tracker", zap.Any("panic", r))
			}
		}()
		click := &models.BioLinkClick{
			LinkID:    linkID2,
			PageID:    pageID2,
			Referer:   referer,
			UserAgent: ua,
			IPHash:    ipHash,
			CreatedAt: time.Now(),
		}
		if err := h.db.Create(click).Error; err != nil {
			h.log.Warn("TrackBioLinkClick: insert", zap.Error(err))
		}
		if err := h.db.Model(&models.BioLink{}).
			Where("id = ?", linkID2).
			Update("click_count", gorm.Expr("click_count + 1")).Error; err != nil {
			h.log.Warn("TrackBioLinkClick: increment", zap.Error(err))
		}
	}()

	return c.JSON(fiber.Map{"data": fiber.Map{"tracked": true, "url": link.URL}})
}

// ── Admin moderation ─────────────────────────────────────────────────────────

type adminDisablePageRequest struct {
	IsDisabled bool   `json:"is_disabled"`
	Reason     string `json:"reason"`
}

// AdminTogglePageDisabled lets a platform super-admin disable (or re-enable)
// a bio page for ToS violations. Audit-logged with the reason so the platform
// has a defensible record of moderation actions.
//
// PATCH /api/v1/admin/bio/pages/:id/disable  (RequireSuperAdmin)
func (h *BioHandler) AdminTogglePageDisabled(c *fiber.Ctx) error {
	pageID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "id must be a valid UUID", "INVALID_ID")
	}
	user, ok := c.Locals(middleware.LocalsUser).(*models.User)
	if !ok || user == nil {
		return unauthorised(c, "not authenticated")
	}

	var req adminDisablePageRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid body", "INVALID_BODY")
	}
	if req.IsDisabled && strings.TrimSpace(req.Reason) == "" {
		return badRequest(c, "reason is required when disabling a page", "VALIDATION_ERROR")
	}
	if len(req.Reason) > 500 {
		return badRequest(c, "reason too long (max 500 chars)", "VALIDATION_ERROR")
	}

	var page models.BioPage
	if err := h.db.WithContext(c.Context()).First(&page, "id = ?", pageID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "page not found", "NOT_FOUND")
		}
		return internalError(c, "failed to load page")
	}

	page.IsDisabled = req.IsDisabled
	if req.IsDisabled {
		page.DisabledReason = strings.TrimSpace(req.Reason)
	} else {
		page.DisabledReason = ""
	}
	if err := h.db.WithContext(c.Context()).Save(&page).Error; err != nil {
		h.log.Error("AdminTogglePageDisabled: save", zap.Error(err))
		return internalError(c, "failed to update page")
	}

	action := "bio.page_admin_enabled"
	if req.IsDisabled {
		action = "bio.page_admin_disabled"
	}
	// Platform-wide moderation audit — workspace_id passes the page's
	// workspace so the trail correlates with that workspace's other events.
	writeAudit(c, h.db, h.log, page.WorkspaceID, action, "bio_page", page.ID.String(),
		map[string]any{
			"slug":   page.Slug,
			"reason": page.DisabledReason,
		})

	return c.JSON(fiber.Map{"data": page})
}

// AdminListBioPages returns every bio page on the platform for moderation
// review. Search by slug or title. Paginated.
//
// GET /api/v1/admin/bio/pages?search=&page=1&limit=25
func (h *BioHandler) AdminListBioPages(c *fiber.Ctx) error {
	page := max(1, c.QueryInt("page", 1))
	limit := clamp(c.QueryInt("limit", 25), 1, 100)
	search := strings.TrimSpace(c.Query("search"))
	offset := (page - 1) * limit

	baseQ := h.db.WithContext(c.Context()).Model(&models.BioPage{})
	if search != "" {
		baseQ = baseQ.Where("slug ILIKE ? OR title ILIKE ?", "%"+search+"%", "%"+search+"%")
	}
	var total int64
	if err := baseQ.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return internalError(c, "failed to count pages")
	}
	var rows []models.BioPage
	if err := baseQ.Session(&gorm.Session{}).
		Offset(offset).Limit(limit).
		Order("created_at DESC").
		Find(&rows).Error; err != nil {
		return internalError(c, "failed to list pages")
	}
	return c.JSON(fiber.Map{
		"pages": rows,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

// ── helpers ──────────────────────────────────────────────────────────────────

func isValidHTTPURL(s string) bool {
	if s == "" {
		return false
	}
	u, err := url.Parse(s)
	if err != nil {
		return false
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return false
	}
	if u.Host == "" {
		return false
	}
	return true
}
