package handlers

import (
	"math"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"go.uber.org/zap"

	"github.com/socialforge/backend/internal/api/middleware"
	"github.com/socialforge/backend/internal/models"
	"github.com/socialforge/backend/internal/queue"
	"github.com/socialforge/backend/internal/repository"
	scheduling "github.com/socialforge/backend/internal/services/scheduling"
)

// PostsHandler handles post CRUD and publishing endpoints.
type PostsHandler struct {
	repo     repository.PostRepository
	schedule *scheduling.Service
	asynq    *asynq.Client
	log      *zap.Logger
}

// NewPostsHandler creates a new PostsHandler.
func NewPostsHandler(repo repository.PostRepository, schedule *scheduling.Service, asynqClient *asynq.Client, log *zap.Logger) *PostsHandler {
	return &PostsHandler{repo: repo, schedule: schedule, asynq: asynqClient, log: log.Named("posts_handler")}
}

// resolveWorkspaceID extracts and validates the :workspaceId parameter.
func resolveWorkspaceID(c *fiber.Ctx) (uuid.UUID, error) {
	return uuid.Parse(c.Params("workspaceId"))
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

	filter := repository.PostFilter{
		WorkspaceID: wid,
		Page:        page,
		Limit:       limit,
	}

	if status := c.Query("status"); status != "" {
		filter.Status = status
	}
	if platform := c.Query("platform"); platform != "" {
		filter.Platform = platform
	}
	if from := c.Query("from"); from != "" {
		t, err := time.Parse("2006-01-02", from)
		if err == nil {
			filter.From = &t
		}
	}
	if to := c.Query("to"); to != "" {
		t, err := time.Parse("2006-01-02", to)
		if err == nil {
			end := t.AddDate(0, 0, 1)
			filter.To = &end
		}
	}

	posts, total, err := h.repo.List(c.Context(), filter)
	if err != nil {
		h.log.Error("ListPosts: repo.List", zap.Error(err))
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

	if err := h.repo.Create(c.Context(), post); err != nil {
		h.log.Error("CreatePost: repo.Create", zap.Error(err))
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

	post, err := h.repo.GetByID(c.Context(), postID)
	if err != nil {
		if repository.IsNotFound(err) {
			return notFound(c, "post not found", "NOT_FOUND")
		}
		h.log.Error("GetPost: repo.GetByID", zap.Error(err))
		return internalError(c, "failed to get post")
	}

	// Verify post belongs to the requested workspace.
	if post.WorkspaceID != wid {
		return notFound(c, "post not found", "NOT_FOUND")
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

	post, err := h.repo.GetByID(c.Context(), postID)
	if err != nil {
		if repository.IsNotFound(err) {
			return notFound(c, "post not found", "NOT_FOUND")
		}
		return internalError(c, "failed to fetch post")
	}

	// Verify post belongs to the requested workspace.
	if post.WorkspaceID != wid {
		return notFound(c, "post not found", "NOT_FOUND")
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

	changed := false
	if req.Title != nil {
		post.Title = *req.Title
		changed = true
	}
	if req.Content != nil {
		if *req.Content == "" {
			return badRequest(c, "content cannot be empty", "VALIDATION_ERROR")
		}
		post.Content = *req.Content
		changed = true
	}
	if req.Platforms != nil {
		post.Platforms = req.Platforms
		changed = true
	}
	if req.MediaURLs != nil {
		post.MediaURLs = req.MediaURLs
		changed = true
	}
	if req.Hashtags != nil {
		post.Hashtags = req.Hashtags
		changed = true
	}
	if req.PostType != nil {
		post.Type = models.PostType(*req.PostType)
		changed = true
	}
	if req.ScheduledAt != nil {
		if *req.ScheduledAt == "" {
			post.ScheduledAt = nil
			post.Status = models.PostStatusDraft
		} else {
			t, err := time.Parse(time.RFC3339, *req.ScheduledAt)
			if err != nil {
				return badRequest(c, "scheduled_at must be ISO8601 format", "VALIDATION_ERROR")
			}
			if !t.After(time.Now()) {
				return badRequest(c, "scheduled_at must be in the future", "VALIDATION_ERROR")
			}
			post.ScheduledAt = &t
			post.Status = models.PostStatusScheduled
		}
		changed = true
	}
	if req.Status != nil {
		// Allow demoting back to draft.
		if *req.Status == string(models.PostStatusDraft) {
			post.Status = models.PostStatusDraft
			changed = true
		}
	}

	if !changed {
		return badRequest(c, "no fields to update", "VALIDATION_ERROR")
	}

	if err := h.repo.Update(c.Context(), post); err != nil {
		h.log.Error("UpdatePost: repo.Update", zap.Error(err))
		return internalError(c, "failed to update post")
	}

	// Reload to get fresh PostPlatforms.
	updated, err := h.repo.GetByID(c.Context(), post.ID)
	if err == nil {
		post = updated
	}

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

	// Verify ownership before deleting.
	post, err := h.repo.GetByID(c.Context(), postID)
	if err != nil {
		if repository.IsNotFound(err) {
			return notFound(c, "post not found", "NOT_FOUND")
		}
		h.log.Error("DeletePost: repo.GetByID", zap.Error(err))
		return internalError(c, "failed to fetch post")
	}
	if post.WorkspaceID != wid {
		return notFound(c, "post not found", "NOT_FOUND")
	}

	if err := h.repo.Delete(c.Context(), postID); err != nil {
		h.log.Error("DeletePost: repo.Delete", zap.Error(err))
		return internalError(c, "failed to delete post")
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
	post, err := h.repo.GetByID(c.Context(), postID)
	if err != nil {
		if repository.IsNotFound(err) {
			return notFound(c, "post not found", "NOT_FOUND")
		}
		return internalError(c, "failed to fetch post")
	}
	if post.WorkspaceID != wid {
		return notFound(c, "post not found", "NOT_FOUND")
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
	if err := h.repo.UpdateStatus(c.Context(), postID, models.PostStatusPublishing, ""); err != nil {
		h.log.Warn("PublishNow: failed to mark post as publishing", zap.Error(err))
	}

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

	created := make([]*models.Post, 0, len(req.Posts))
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

		post := &models.Post{
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

	// Batch insert via repository.
	if err := h.repo.BulkCreate(c.Context(), created); err != nil {
		h.log.Error("BulkCreatePosts: repo.BulkCreate", zap.Error(err))
		return internalError(c, "failed to create posts")
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"data": created,
		"meta": fiber.Map{"created": len(created)},
	})
}
