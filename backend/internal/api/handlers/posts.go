package handlers

import (
	"fmt"
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
	"github.com/socialforge/backend/internal/repository"
	scheduling "github.com/socialforge/backend/internal/services/scheduling"
)

// PostsHandler handles post CRUD and publishing endpoints.
type PostsHandler struct {
	repo     repository.PostRepository
	schedule *scheduling.Service
	asynq    *asynq.Client
	db       *gorm.DB
	log      *zap.Logger
}

// NewPostsHandler creates a new PostsHandler.
func NewPostsHandler(db *gorm.DB, repo repository.PostRepository, schedule *scheduling.Service, asynqClient *asynq.Client, log *zap.Logger) *PostsHandler {
	return &PostsHandler{db: db, repo: repo, schedule: schedule, asynq: asynqClient, log: log.Named("posts_handler")}
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
	if postType == "" || postType == "post" {
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

		// 1) If the caller provided an explicit scheduled_at, use it.
		if pr.ScheduledAt != nil && *pr.ScheduledAt != "" {
			t, err := time.Parse(time.RFC3339, *pr.ScheduledAt)
			if err != nil {
				return badRequest(c,
					fmt.Sprintf("row %d: scheduled_at must be RFC3339 (e.g. 2026-06-01T09:00:00+01:00)", i+1),
					"VALIDATION_ERROR")
			}
			post.ScheduledAt = &t
			post.Status = models.PostStatusScheduled
		} else if len(pr.Platforms) > 0 {
			// 2) Otherwise assign to next free slot using the first platform.
			slotTime, err := h.schedule.GetNextFreeSlot(wid, pr.Platforms[0])
			if err == nil {
				post.ScheduledAt = &slotTime
				post.Status = models.PostStatusScheduled
			} else {
				h.log.Warn("BulkCreatePosts: no free slot, leaving as draft",
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

// ── SubmitPostForReview ───────────────────────────────────────────────────────

// SubmitPostForReview transitions a post from draft/rejected → pending_review
// and notifies all workspace admins/owners.
// PATCH /api/v1/workspaces/:wid/posts/:id/submit
func (h *PostsHandler) SubmitPostForReview(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}
	postID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "id must be a valid UUID", "INVALID_ID")
	}

	user := currentUser(c)
	if user == nil {
		return unauthorised(c, "not authenticated")
	}

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

	// Only the author may submit their own post.
	if post.AuthorID != user.ID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "you can only submit your own posts for review",
			"code":  "FORBIDDEN",
		})
	}

	// Only draft or rejected posts can be submitted.
	if post.Status != models.PostStatusDraft && post.Status != models.PostStatusRejected {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": fmt.Sprintf("cannot submit a post with status %q for review", post.Status),
			"code":  "INVALID_STATUS_TRANSITION",
		})
	}

	post.Status = models.PostStatusPendingReview
	if err := h.repo.Update(c.Context(), post); err != nil {
		h.log.Error("SubmitPostForReview: repo.Update", zap.Error(err))
		return internalError(c, "failed to submit post for review")
	}

	// Notify all admins and owners in the workspace.
	go func() {
		var admins []models.WorkspaceMember
		h.db.Where("workspace_id = ? AND role IN ?", wid, []string{"admin", "owner"}).
			Find(&admins)
		for _, m := range admins {
			n := &models.Notification{
				WorkspaceID: wid,
				UserID:      m.UserID,
				Title:       "Post pending review",
				Body:        fmt.Sprintf("%s submitted a post for your approval.", user.Name),
				ActionURL:   "/review",
			}
			if err := h.db.Create(n).Error; err != nil {
				h.log.Warn("SubmitPostForReview: failed to create notification",
					zap.Error(err), zap.String("user_id", m.UserID.String()))
			}
		}
	}()

	h.log.Info("SubmitPostForReview",
		zap.String("post_id", postID.String()),
		zap.String("author_id", user.ID.String()),
	)

	return c.JSON(fiber.Map{"data": post})
}

// ── ApprovePost ───────────────────────────────────────────────────────────────

// ApprovePost approves a pending_review post (admin/owner only).
// If scheduled_at is set the post moves to scheduled; otherwise back to draft
// so the author can pick a time.
// PATCH /api/v1/workspaces/:wid/posts/:id/approve
func (h *PostsHandler) ApprovePost(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}
	postID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "id must be a valid UUID", "INVALID_ID")
	}

	approver := currentUser(c)
	if approver == nil {
		return unauthorised(c, "not authenticated")
	}

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

	if post.Status != models.PostStatusPendingReview {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": fmt.Sprintf("cannot approve a post with status %q", post.Status),
			"code":  "INVALID_STATUS_TRANSITION",
		})
	}

	// Approval is the final step: auto-schedule if a time is set.
	if post.ScheduledAt != nil && post.ScheduledAt.After(time.Now()) {
		post.Status = models.PostStatusScheduled
	} else {
		post.Status = models.PostStatusDraft
	}
	post.ApprovalNote = "" // clear any previous rejection note

	if err := h.repo.Update(c.Context(), post); err != nil {
		h.log.Error("ApprovePost: repo.Update", zap.Error(err))
		return internalError(c, "failed to approve post")
	}

	// Notify the author.
	go func() {
		n := &models.Notification{
			WorkspaceID: wid,
			UserID:      post.AuthorID,
			Title:       "Your post was approved ✓",
			Body:        "Your post has been approved and is ready to go.",
			ActionURL:   "/calendar",
		}
		if err := h.db.Create(n).Error; err != nil {
			h.log.Warn("ApprovePost: failed to create notification", zap.Error(err))
		}
	}()

	h.log.Info("ApprovePost",
		zap.String("post_id", postID.String()),
		zap.String("approver_id", approver.ID.String()),
		zap.String("new_status", string(post.Status)),
	)

	return c.JSON(fiber.Map{"data": post})
}

// ── RejectPost ────────────────────────────────────────────────────────────────

type rejectPostRequest struct {
	Note string `json:"note"`
}

// RejectPost rejects a pending_review post with an optional note (admin/owner only).
// PATCH /api/v1/workspaces/:wid/posts/:id/reject
func (h *PostsHandler) RejectPost(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}
	postID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "id must be a valid UUID", "INVALID_ID")
	}

	rejector := currentUser(c)
	if rejector == nil {
		return unauthorised(c, "not authenticated")
	}

	var req rejectPostRequest
	// Body is optional (note may be empty).
	_ = c.BodyParser(&req)

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

	if post.Status != models.PostStatusPendingReview {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": fmt.Sprintf("cannot reject a post with status %q", post.Status),
			"code":  "INVALID_STATUS_TRANSITION",
		})
	}

	post.Status = models.PostStatusRejected
	post.ApprovalNote = req.Note

	if err := h.repo.Update(c.Context(), post); err != nil {
		h.log.Error("RejectPost: repo.Update", zap.Error(err))
		return internalError(c, "failed to reject post")
	}

	// Notify the author.
	go func() {
		body := "Your post needs changes before it can be published."
		if req.Note != "" {
			body = fmt.Sprintf("Your post needs changes: %s", req.Note)
		}
		n := &models.Notification{
			WorkspaceID: wid,
			UserID:      post.AuthorID,
			Title:       "Your post needs changes",
			Body:        body,
			ActionURL:   "/compose",
		}
		if err := h.db.Create(n).Error; err != nil {
			h.log.Warn("RejectPost: failed to create notification", zap.Error(err))
		}
	}()

	h.log.Info("RejectPost",
		zap.String("post_id", postID.String()),
		zap.String("rejector_id", rejector.ID.String()),
	)

	return c.JSON(fiber.Map{"data": post})
}

// ── Post Comments (review threads) ────────────────────────────────────────────
//
// Used during the approval workflow so editors and reviewers can discuss a
// post before it's approved / rejected. Anyone with workspace access can read
// & post comments. The author is notified when someone else comments; everyone
// else who has previously commented on the post is also notified, so threads
// stay live without manual @-mentions.

type createCommentRequest struct {
	Body string `json:"body"`
}

// ListPostComments returns every comment on a post in chronological order,
// joined with the author so the UI can render name+avatar without a second
// round-trip.
//
// GET /api/v1/workspaces/:wid/posts/:id/comments
func (h *PostsHandler) ListPostComments(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}
	postID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "id must be a valid UUID", "INVALID_ID")
	}

	// Confirm the post belongs to this workspace.
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

	var comments []models.PostComment
	if err := h.db.WithContext(c.Context()).
		Preload("Author").
		Where("post_id = ?", postID).
		Order("created_at ASC").
		Find(&comments).Error; err != nil {
		h.log.Error("ListPostComments: db", zap.Error(err))
		return internalError(c, "failed to load comments")
	}

	return c.JSON(fiber.Map{"data": comments})
}

// CreatePostComment adds a comment to the thread. Notifies the post author
// plus every prior commenter (minus the current commenter) so a back-and-forth
// keeps both sides pinging each other without manual @-mentions.
//
// POST /api/v1/workspaces/:wid/posts/:id/comments
func (h *PostsHandler) CreatePostComment(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}
	postID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "id must be a valid UUID", "INVALID_ID")
	}
	user := currentUser(c)
	if user == nil {
		return unauthorised(c, "not authenticated")
	}

	var req createCommentRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid body", "INVALID_BODY")
	}
	body := strings.TrimSpace(req.Body)
	if body == "" {
		return badRequest(c, "body is required", "VALIDATION_ERROR")
	}
	if len(body) > 4000 {
		return badRequest(c, "body too long (max 4000 chars)", "VALIDATION_ERROR")
	}

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

	comment := &models.PostComment{
		PostID:      postID,
		WorkspaceID: wid,
		AuthorID:    user.ID,
		Body:        body,
	}
	if err := h.db.WithContext(c.Context()).Create(comment).Error; err != nil {
		h.log.Error("CreatePostComment: db.Create", zap.Error(err))
		return internalError(c, "failed to create comment")
	}

	// Re-fetch with Author preloaded so the response carries name/avatar.
	if err := h.db.WithContext(c.Context()).
		Preload("Author").
		First(comment, "id = ?", comment.ID).Error; err != nil {
		h.log.Warn("CreatePostComment: failed to preload author", zap.Error(err))
	}

	// Notify the post author + every prior commenter, async, best-effort.
	go h.notifyCommentSubscribers(wid, postID, user.ID, post.AuthorID, body)

	h.log.Info("CreatePostComment",
		zap.String("post_id", postID.String()),
		zap.String("author_id", user.ID.String()),
	)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": comment})
}

// DeletePostComment removes a comment. Allowed by:
//   - The comment author (self-delete), or
//   - A workspace admin/owner (moderation — for removing inappropriate content).
//
// Editors and viewers cannot delete other people's comments. The handler
// emits an audit-log entry on every successful delete so admins have a
// moderation trail.
//
// DELETE /api/v1/workspaces/:wid/posts/:id/comments/:cid
func (h *PostsHandler) DeletePostComment(c *fiber.Ctx) error {
	wid, err := resolveWorkspaceID(c)
	if err != nil {
		return badRequest(c, "wid must be a valid UUID", "INVALID_ID")
	}
	cid, err := uuid.Parse(c.Params("cid"))
	if err != nil {
		return badRequest(c, "cid must be a valid UUID", "INVALID_ID")
	}
	user := currentUser(c)
	if user == nil {
		return unauthorised(c, "not authenticated")
	}

	var comment models.PostComment
	if err := h.db.WithContext(c.Context()).
		Where("id = ? AND workspace_id = ?", cid, wid).
		First(&comment).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return notFound(c, "comment not found", "NOT_FOUND")
		}
		return internalError(c, "failed to fetch comment")
	}

	// Author can always delete their own comment; otherwise the caller must
	// hold admin or owner role on the workspace.
	asAuthor := comment.AuthorID == user.ID
	asModerator := false
	if !asAuthor {
		var member models.WorkspaceMember
		if err := h.db.WithContext(c.Context()).
			Where("workspace_id = ? AND user_id = ?", wid, user.ID).
			First(&member).Error; err == nil {
			if member.Role == models.WorkspaceRoleAdmin || member.Role == models.WorkspaceRoleOwner {
				asModerator = true
			}
		}
	}
	if !asAuthor && !asModerator {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "you can only delete your own comments (workspace admins can moderate)",
			"code":  "FORBIDDEN",
		})
	}

	if err := h.db.WithContext(c.Context()).Delete(&comment).Error; err != nil {
		h.log.Error("DeletePostComment: db.Delete", zap.Error(err))
		return internalError(c, "failed to delete comment")
	}

	// Audit log — only when a moderator removed someone else's comment, so the
	// trail captures the cases that matter for accountability. Self-deletes
	// are routine and would just add noise.
	if asModerator {
		go func() {
			entry := &models.AuditLog{
				WorkspaceID:  wid,
				UserID:       user.ID,
				Action:       "comment.moderated_delete",
				ResourceType: "post_comment",
				ResourceID:   comment.ID.String(),
				Metadata: models.JSONMap{
					"post_id":         comment.PostID.String(),
					"original_author": comment.AuthorID.String(),
					"body_preview":    truncate(comment.Body, 200),
				},
			}
			if err := h.db.Create(entry).Error; err != nil {
				h.log.Warn("DeletePostComment: audit-log write failed", zap.Error(err))
			}
		}()
	}

	return c.JSON(fiber.Map{"data": fiber.Map{
		"deleted":        true,
		"as_moderator":   asModerator,
	}})
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// notifyCommentSubscribers fans out notifications to the post author plus all
// prior commenters, minus the current commenter. Best-effort.
func (h *PostsHandler) notifyCommentSubscribers(
	workspaceID, postID, commenterID, authorID uuid.UUID,
	body string,
) {
	recipients := map[uuid.UUID]struct{}{}
	if authorID != commenterID {
		recipients[authorID] = struct{}{}
	}

	var priorCommenters []uuid.UUID
	if err := h.db.Model(&models.PostComment{}).
		Where("post_id = ? AND author_id <> ?", postID, commenterID).
		Distinct("author_id").
		Pluck("author_id", &priorCommenters).Error; err != nil {
		h.log.Warn("notifyCommentSubscribers: failed to load prior commenters", zap.Error(err))
	}
	for _, uid := range priorCommenters {
		recipients[uid] = struct{}{}
	}

	if len(recipients) == 0 {
		return
	}

	preview := body
	if len(preview) > 140 {
		preview = preview[:140] + "…"
	}

	for uid := range recipients {
		n := &models.Notification{
			WorkspaceID: workspaceID,
			UserID:      uid,
			Title:       "New comment on a post you're following",
			Body:        preview,
			ActionURL:   fmt.Sprintf("/review?post=%s", postID.String()),
		}
		if err := h.db.Create(n).Error; err != nil {
			h.log.Warn("notifyCommentSubscribers: failed to create notification",
				zap.String("user_id", uid.String()), zap.Error(err))
		}
	}
}
