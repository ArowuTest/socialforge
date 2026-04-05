package handlers

import (
	"math"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/api/middleware"
	"github.com/socialforge/backend/internal/models"
	"github.com/socialforge/backend/internal/queue"
	scheduling "github.com/socialforge/backend/internal/services/scheduling"
)

// PostsHandler handles post CRUD and publishing endpoints.
type PostsHandler struct {
	db       *gorm.DB
	schedule *scheduling.Service
	asynq    *asynq.Client
	log      *zap.Logger
}

// NewPostsHandler creates a new PostsHandler.
func NewPostsHandler(db *gorm.DB, schedule *scheduling.Service, asynqClient *asynq.Client, log *zap.Logger) *PostsHandler {
	return &PostsHandler{db: db, schedule: schedule, asynq: asynqClient, log: log.Named("posts_handler")}
}

// resolveWorkspaceID extracts and validates the :wid parameter.
func resolveWorkspaceID(c *fiber.Ctx) (uuid.UUID, error) {
	return uuid.Parse(c.Params("wid"))
}

// currentUser returns the authenticated user from context locals.
func currentUser(c *fiber.Ctx) *models.User {
	u, _ := c.Locals(middleware.LocalsUser).(*models.User)
	return u
}

// ── ListPosts ─────────────────────────────────────────────────────────────────

// ListPosts returns a paginated list of posts filtered by optional query params.
// GET /api/v1/workspaces/:wid/posts
func (h *PostsHandler) ListPosts(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 20)
	if limit > 100 {
		limit = 100
	}
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * limit

	q := h.db.WithContext(c.Context()).Model(&models.Post{}).
		Where("workspace_id = ?", wid)

	if status := c.Query("status"); status != "" {
		q = q.Where("status = ?", status)
	}
	if platform := c.Query("platform"); platform != "" {
		// platforms is a JSON array column — use LIKE for basic filtering
		q = q.Where("platforms LIKE ?", "%"+platform+"%")
	}
	if from := c.Query("from"); from != "" {
		t, err := time.Parse("2006-01-02", from)
		if err == nil {
			q = q.Where("scheduled_at >= ?", t)
		}
	}
	if to := c.Query("to"); to != "" {
		t, err := time.Parse("2006-01-02", to)
		if err == nil {
			q = q.Where("scheduled_at < ?", t.AddDate(0, 0, 1))
		}
	}

	var total int64
	q.Count(&total)

	var posts []models.Post
	if err := q.Preload("PostPlatforms").
		Order("created_at DESC").
		Offset(offset).
		Limit(limit).
		Find(&posts).Error; err != nil {
		h.log.Error("ListPosts: db query", zap.Error(err))
		return internalError(c, "failed to list posts")
	}

	totalPages := int(math.Ceil(float64(total) / float64(limit)))

	return c.JSON(fiber.Map{
		"data": posts,
		"meta": fiber.Map{
			"total":       total,
			"page":        page,
			"limit":       limit,
			"total_pages": totalPages,
		},
	})
}

// ── CreatePost ────────────────────────────────────────────────────────────────

type createPostRequest struct {
	Title           string   `json:"title"`
	Content         string   `json:"content"`
	Platforms       []string `json:"platforms"`
	MediaURLs       []string `json:"media_urls"`
	ScheduledAt     *string  `json:"scheduled_at"`
	UseNextFreeSlot bool     `json:"use_next_free_slot"`
	PostType        string   `json:"post_type"`
	Hashtags        []string `json:"hashtags"`
	FirstComment    string   `json:"first_comment"`
	BoardID         string   `json:"board_id"`
	LinkURL         string   `json:"link_url"`
}

// CreatePost creates a new post.
// POST /api/v1/workspaces/:wid/posts
func (h *PostsHandler) CreatePost(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	user := currentUser(c)
	if user == nil {
		return unauthorised(c, "not authenticated")
	}

	var req createPostRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	if req.Content == "" {
		return badRequest(c, "content is required", "VALIDATION_ERROR")
	}
	if len(req.Platforms) == 0 {
		return badRequest(c, "at least one platform is required", "VALIDATION_ERROR")
	}

	postType := models.PostType(req.PostType)
	if postType == "" {
		postType = models.PostTypeText
	}

	post := &models.Post{
		WorkspaceID:  wid,
		AuthorID:     user.ID,
		Title:        req.Title,
		Content:      req.Content,
		Type:         postType,
		Status:       models.PostStatusDraft,
		Platforms:    req.Platforms,
		MediaURLs:    req.MediaURLs,
		Hashtags:     req.Hashtags,
		FirstComment: req.FirstComment,
		BoardID:      req.BoardID,
		LinkURL:      req.LinkURL,
	}

	// Determine scheduling.
	if req.ScheduledAt != nil && *req.ScheduledAt != "" {
		t, err := time.Parse(time.RFC3339, *req.ScheduledAt)
		if err != nil {
			return badRequest(c, "scheduled_at must be ISO8601 format", "VALIDATION_ERROR")
		}
		if !t.After(time.Now()) {
			return badRequest(c, "scheduled_at must be in the future", "VALIDATION_ERROR")
		}
		post.ScheduledAt = &t
		post.Status = models.PostStatusScheduled
	} else if req.UseNextFreeSlot && len(req.Platforms) > 0 {
		// Use the first platform's next free slot.
		slotTime, err := h.schedule.GetNextFreeSlot(wid, req.Platforms[0])
		if err != nil {
			if strings.Contains(err.Error(), "no free") {
				return badRequest(c, "no free schedule slot available", "NO_FREE_SLOT")
			}
			return internalError(c, "failed to find next slot")
		}
		post.ScheduledAt = &slotTime
		post.Status = models.PostStatusScheduled
	}

	if err := h.db.WithContext(c.Context()).Create(post).Error; err != nil {
		h.log.Error("CreatePost: db create", zap.Error(err))
		return internalError(c, "failed to create post")
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": post})
}

// ── GetPost ───────────────────────────────────────────────────────────────────

// GetPost returns a single post with platform records.
// GET /api/v1/workspaces/:wid/posts/:id
func (h *PostsHandler) GetPost(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}
	postID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "id must be a valid UUID", "INVALID_ID")
	}

	var post models.Post
	if err := h.db.WithContext(c.Context()).
		Preload("PostPlatforms").
		Preload("Author").
		Where("id = ? AND workspace_id = ?", postID, wid).
		First(&post).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "post not found", "NOT_FOUND")
		}
		h.log.Error("GetPost: db query", zap.Error(err))
		return internalError(c, "failed to get post")
	}

	return c.JSON(fiber.Map{"data": post})
}

// ── UpdatePost ────────────────────────────────────────────────────────────────

type updatePostRequest struct {
	Title       *string  `json:"title"`
	Content     *string  `json:"content"`
	Platforms   []string `json:"platforms"`
	MediaURLs   []string `json:"media_urls"`
	ScheduledAt *string  `json:"scheduled_at"`
	PostType    *string  `json:"post_type"`
	Hashtags    []string `json:"hashtags"`
	Status      *string  `json:"status"`
}

// UpdatePost partially updates a post. Cannot update published posts.
// PATCH /api/v1/workspaces/:wid/posts/:id
func (h *PostsHandler) UpdatePost(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}
	postID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "id must be a valid UUID", "INVALID_ID")
	}

	var post models.Post
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", postID, wid).
		First(&post).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "post not found", "NOT_FOUND")
		}
		return internalError(c, "failed to fetch post")
	}

	if post.Status == models.PostStatusPublished || post.Status == models.PostStatusPublishing {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": "cannot update a post that is published or publishing",
			"code":  "POST_ALREADY_PUBLISHED",
		})
	}

	var req updatePostRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	updates := map[string]interface{}{}
	if req.Title != nil {
		updates["title"] = *req.Title
	}
	if req.Content != nil {
		if *req.Content == "" {
			return badRequest(c, "content cannot be empty", "VALIDATION_ERROR")
		}
		updates["content"] = *req.Content
	}
	if req.Platforms != nil {
		updates["platforms"] = models.StringSlice(req.Platforms)
	}
	if req.MediaURLs != nil {
		updates["media_urls"] = models.StringSlice(req.MediaURLs)
	}
	if req.Hashtags != nil {
		updates["hashtags"] = models.StringSlice(req.Hashtags)
	}
	if req.PostType != nil {
		updates["type"] = *req.PostType
	}
	if req.ScheduledAt != nil {
		if *req.ScheduledAt == "" {
			updates["scheduled_at"] = nil
			updates["status"] = models.PostStatusDraft
		} else {
			t, err := time.Parse(time.RFC3339, *req.ScheduledAt)
			if err != nil {
				return badRequest(c, "scheduled_at must be ISO8601 format", "VALIDATION_ERROR")
			}
			if !t.After(time.Now()) {
				return badRequest(c, "scheduled_at must be in the future", "VALIDATION_ERROR")
			}
			updates["scheduled_at"] = t
			updates["status"] = models.PostStatusScheduled
		}
	}
	if req.Status != nil {
		// Allow demoting back to draft.
		if *req.Status == string(models.PostStatusDraft) {
			updates["status"] = models.PostStatusDraft
		}
	}

	if len(updates) == 0 {
		return badRequest(c, "no fields to update", "VALIDATION_ERROR")
	}

	if err := h.db.WithContext(c.Context()).Model(&post).Updates(updates).Error; err != nil {
		h.log.Error("UpdatePost: db update", zap.Error(err))
		return internalError(c, "failed to update post")
	}

	// Reload.
	_ = h.db.WithContext(c.Context()).Preload("PostPlatforms").First(&post, post.ID).Error

	return c.JSON(fiber.Map{"data": post})
}

// ── DeletePost ────────────────────────────────────────────────────────────────

// DeletePost soft-deletes a post.
// DELETE /api/v1/workspaces/:wid/posts/:id
func (h *PostsHandler) DeletePost(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}
	postID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "id must be a valid UUID", "INVALID_ID")
	}

	result := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", postID, wid).
		Delete(&models.Post{})
	if result.Error != nil {
		h.log.Error("DeletePost: db delete", zap.Error(result.Error))
		return internalError(c, "failed to delete post")
	}
	if result.RowsAffected == 0 {
		return notFound(c, "post not found", "NOT_FOUND")
	}

	return c.JSON(fiber.Map{"data": fiber.Map{"message": "post deleted"}})
}

// ── PublishNow ────────────────────────────────────────────────────────────────

// PublishNow enqueues a post for immediate publishing.
// POST /api/v1/workspaces/:wid/posts/:id/publish
func (h *PostsHandler) PublishNow(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}
	postID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "id must be a valid UUID", "INVALID_ID")
	}

	// Verify post exists and belongs to workspace.
	var post models.Post
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", postID, wid).
		First(&post).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "post not found", "NOT_FOUND")
		}
		return internalError(c, "failed to fetch post")
	}

	if post.Status == models.PostStatusPublished {
		return conflict(c, "post is already published", "ALREADY_PUBLISHED")
	}
	if post.Status == models.PostStatusPublishing {
		return conflict(c, "post is currently being published", "ALREADY_PUBLISHING")
	}

	task, err := queue.NewPublishPostTask(queue.PublishPostPayload{
		PostID:       postID,
		WorkspaceID:  wid,
		ForcePublish: true,
	})
	if err != nil {
		h.log.Error("PublishNow: create task", zap.Error(err))
		return internalError(c, "failed to create publish task")
	}

	info, err := h.asynq.EnqueueContext(c.Context(), task,
		asynq.Queue("critical"),
		asynq.MaxRetry(3),
	)
	if err != nil {
		h.log.Error("PublishNow: enqueue task", zap.Error(err))
		return internalError(c, "failed to enqueue publish task")
	}

	// Mark as publishing.
	_ = h.db.WithContext(c.Context()).Model(&post).Update("status", models.PostStatusPublishing).Error

	return c.JSON(fiber.Map{
		"data": fiber.Map{
			"message": "post queued for publishing",
			"task_id": info.ID,
		},
	})
}

// ── BulkCreatePosts ───────────────────────────────────────────────────────────

type bulkCreateRequest struct {
	Posts []createPostRequest `json:"posts"`
}

// BulkCreatePosts creates multiple posts and assigns them to consecutive free slots.
// POST /api/v1/workspaces/:wid/posts/bulk
func (h *PostsHandler) BulkCreatePosts(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}

	user := currentUser(c)
	if user == nil {
		return unauthorised(c, "not authenticated")
	}

	var req bulkCreateRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	if len(req.Posts) == 0 {
		return badRequest(c, "posts array is required and must not be empty", "VALIDATION_ERROR")
	}
	if len(req.Posts) > 50 {
		return badRequest(c, "bulk create supports at most 50 posts at once", "VALIDATION_ERROR")
	}

	created := make([]models.Post, 0, len(req.Posts))
	for i, pr := range req.Posts {
		if pr.Content == "" {
			return badRequest(c, "content is required for all posts", "VALIDATION_ERROR")
		}
		if len(pr.Platforms) == 0 {
			return badRequest(c, "platforms is required for all posts", "VALIDATION_ERROR")
		}

		postType := models.PostType(pr.PostType)
		if postType == "" {
			postType = models.PostTypeText
		}

		post := models.Post{
			WorkspaceID:  wid,
			AuthorID:     user.ID,
			Title:        pr.Title,
			Content:      pr.Content,
			Type:         postType,
			Status:       models.PostStatusDraft,
			Platforms:    pr.Platforms,
			MediaURLs:    pr.MediaURLs,
			Hashtags:     pr.Hashtags,
			FirstComment: pr.FirstComment,
		}

		// Assign to next free slot using the first platform.
		if len(pr.Platforms) > 0 {
			slotTime, err := h.schedule.GetNextFreeSlot(wid, pr.Platforms[0])
			if err == nil {
				post.ScheduledAt = &slotTime
				post.Status = models.PostStatusScheduled
			} else {
				h.log.Warn("BulkCreatePosts: no free slot",
					zap.Int("index", i),
					zap.String("platform", pr.Platforms[0]),
					zap.Error(err),
				)
			}
		}

		created = append(created, post)
	}

	// Batch insert.
	if err := h.db.WithContext(c.Context()).Create(&created).Error; err != nil {
		h.log.Error("BulkCreatePosts: db batch create", zap.Error(err))
		return internalError(c, "failed to create posts")
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"data": created,
		"meta": fiber.Map{"created": len(created)},
	})
}
