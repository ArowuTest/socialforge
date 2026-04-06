// Package handlers_test contains HTTP handler tests for PostsHandler using
// an in-memory SQLite database and Fiber's httptest utilities.
package handlers_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	gormsqlite "gorm.io/driver/sqlite"
	"gorm.io/gorm"
	_ "modernc.org/sqlite"

	"github.com/socialforge/backend/internal/api/handlers"
	"github.com/socialforge/backend/internal/api/middleware"
	"github.com/socialforge/backend/internal/models"
	"github.com/socialforge/backend/internal/repository"
	scheduling "github.com/socialforge/backend/internal/services/scheduling"
)

// ─── test setup helpers ───────────────────────────────────────────────────────

// setupHandlerDB opens an in-memory SQLite database and creates all tables
// used by the posts handler using raw SQL (avoiding Postgres-specific DDL).
func setupHandlerDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(gormsqlite.Dialector{DriverName: "sqlite", DSN: ":memory:"}, &gorm.Config{})
	require.NoError(t, err, "open in-memory SQLite")
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			created_at DATETIME, updated_at DATETIME, deleted_at DATETIME,
			email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, name TEXT NOT NULL,
			avatar_url TEXT, plan TEXT NOT NULL DEFAULT 'free',
			stripe_customer_id TEXT, stripe_subscription_id TEXT, subscription_status TEXT,
			trial_ends_at DATETIME, api_key TEXT, email_verified_at DATETIME, last_login_at DATETIME
		)`,
		`CREATE TABLE IF NOT EXISTS workspaces (
			id TEXT PRIMARY KEY,
			created_at DATETIME, updated_at DATETIME, deleted_at DATETIME,
			name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL,
			logo_url TEXT, primary_color TEXT, custom_domain TEXT,
			is_whitelabel INTEGER NOT NULL DEFAULT 0, plan TEXT NOT NULL DEFAULT 'free',
			stripe_customer_id TEXT, stripe_subscription_id TEXT, subscription_status TEXT,
			current_period_start DATETIME, current_period_end DATETIME,
			ai_credits_used INTEGER NOT NULL DEFAULT 0, ai_credits_limit INTEGER NOT NULL DEFAULT 100,
			ai_credits_reset_at DATETIME, brand_name TEXT, secondary_color TEXT, parent_workspace_id TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS workspace_members (
			id TEXT PRIMARY KEY,
			created_at DATETIME, updated_at DATETIME, deleted_at DATETIME,
			workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'editor',
			invited_at DATETIME, accepted_at DATETIME,
			UNIQUE(workspace_id, user_id)
		)`,
		`CREATE TABLE IF NOT EXISTS schedule_slots (
			id TEXT PRIMARY KEY,
			created_at DATETIME, updated_at DATETIME, deleted_at DATETIME,
			workspace_id TEXT NOT NULL, platform TEXT NOT NULL,
			day_of_week INTEGER NOT NULL, time_of_day TEXT NOT NULL,
			timezone TEXT NOT NULL DEFAULT 'UTC', is_active INTEGER NOT NULL DEFAULT 1
		)`,
		`CREATE TABLE IF NOT EXISTS posts (
			id TEXT PRIMARY KEY,
			created_at DATETIME, updated_at DATETIME, deleted_at DATETIME,
			workspace_id TEXT NOT NULL, author_id TEXT NOT NULL,
			title TEXT, content TEXT, type TEXT DEFAULT 'text',
			status TEXT NOT NULL DEFAULT 'draft', scheduled_at DATETIME, published_at DATETIME,
			platforms TEXT, media_urls TEXT, thumbnail_url TEXT,
			platform_post_ids TEXT, error_message TEXT,
			ai_generated INTEGER NOT NULL DEFAULT 0, ai_job_id TEXT,
			hashtags TEXT, first_comment TEXT,
			description TEXT, tags TEXT, privacy TEXT,
			board_id TEXT, link_url TEXT,
			retry_count INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0
		)`,
		`CREATE TABLE IF NOT EXISTS post_platforms (
			id TEXT PRIMARY KEY,
			created_at DATETIME, updated_at DATETIME,
			post_id TEXT NOT NULL, platform TEXT NOT NULL, social_account_id TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'scheduled',
			platform_post_id TEXT, post_url TEXT, error_message TEXT,
			attempts INTEGER DEFAULT 0, published_at DATETIME
		)`,
		`CREATE TABLE IF NOT EXISTS social_accounts (
			id TEXT PRIMARY KEY,
			created_at DATETIME, updated_at DATETIME, deleted_at DATETIME,
			workspace_id TEXT NOT NULL, platform TEXT NOT NULL, account_id TEXT NOT NULL,
			account_name TEXT, account_handle TEXT, account_type TEXT,
			avatar_url TEXT, access_token TEXT NOT NULL DEFAULT '', refresh_token TEXT,
			token_expires_at DATETIME, scopes TEXT, is_active INTEGER NOT NULL DEFAULT 1,
			page_id TEXT, page_name TEXT, follower_count INTEGER DEFAULT 0,
			profile_url TEXT, metadata TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS api_keys (
			id TEXT PRIMARY KEY,
			created_at DATETIME, updated_at DATETIME, deleted_at DATETIME,
			workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
			name TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE, key_prefix TEXT NOT NULL,
			last_used_at DATETIME, expires_at DATETIME,
			is_active INTEGER NOT NULL DEFAULT 1, permissions TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS ai_jobs (
			id TEXT PRIMARY KEY,
			created_at DATETIME, updated_at DATETIME, deleted_at DATETIME,
			workspace_id TEXT NOT NULL, job_type TEXT NOT NULL,
			input_data TEXT, output_data TEXT,
			status TEXT NOT NULL DEFAULT 'pending',
			model_used TEXT, credits_used INTEGER NOT NULL DEFAULT 0,
			error_message TEXT, requested_by_id TEXT,
			started_at DATETIME, completed_at DATETIME
		)`,
		`CREATE TABLE IF NOT EXISTS audit_logs (
			id TEXT PRIMARY KEY,
			workspace_id TEXT, user_id TEXT,
			action TEXT NOT NULL, resource_type TEXT, resource_id TEXT,
			metadata TEXT, ip_address TEXT, user_agent TEXT,
			created_at DATETIME
		)`,
	}
	for _, stmt := range stmts {
		require.NoError(t, db.Exec(stmt).Error, "createTable: "+stmt[:40])
	}
	return db
}

// seedUserAndWorkspace creates a User and Workspace row in db and returns both.
func seedUserAndWorkspace(t *testing.T, db *gorm.DB) (*models.User, *models.Workspace) {
	t.Helper()
	user := &models.User{
		Base:         models.Base{ID: uuid.New()},
		Email:        "handler-test@example.com",
		PasswordHash: "hash",
		Name:         "Handler Tester",
		Plan:         models.PlanFree,
	}
	require.NoError(t, db.Create(user).Error)

	ws := &models.Workspace{
		Base:    models.Base{ID: uuid.New()},
		Name:    "Test Workspace",
		Slug:    "test-workspace",
		OwnerID: user.ID,
		Plan:    models.PlanFree,
	}
	require.NoError(t, db.Create(ws).Error)
	return user, ws
}

// newTestApp creates a Fiber app with the posts handler routes registered.
// The authenticated user is injected into Locals so auth-gated routes work.
func newTestApp(db *gorm.DB, user *models.User) *fiber.App {
	log := zap.NewNop()
	schedSvc := scheduling.New(db, log)
	postRepo := repository.NewPostRepo(db)
	// asynq.Client is nil — tests that reach the publish path should not be
	// included here; those tests rely on early-exit validation logic.
	h := handlers.NewPostsHandler(postRepo, schedSvc, nil, log)

	app := fiber.New(fiber.Config{
		// Return errors as JSON so we can parse status codes reliably.
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})

	// Inject the authenticated user into every request via a simple middleware.
	app.Use(func(c *fiber.Ctx) error {
		if user != nil {
			c.Locals(middleware.LocalsUser, user)
		}
		return c.Next()
	})

	// Register the routes under the same path pattern the router uses.
	app.Get("/workspaces/:wid/posts", h.ListPosts)
	app.Post("/workspaces/:wid/posts", h.CreatePost)
	app.Get("/workspaces/:wid/posts/:id", h.GetPost)
	app.Delete("/workspaces/:wid/posts/:id", h.DeletePost)

	return app
}

// doRequest performs a test HTTP request and returns the response.
func doRequest(app *fiber.App, method, url string, body io.Reader) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, url, body)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, _ := app.Test(req, -1)
	// Wrap in ResponseRecorder so callers can use assert helpers directly.
	rec := httptest.NewRecorder()
	rec.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(rec.Body, resp.Body)
	return rec
}

// ─── TestListPosts_InvalidWorkspaceID ────────────────────────────────────────

func TestListPosts_InvalidWorkspaceID(t *testing.T) {
	db := setupHandlerDB(t)
	user, _ := seedUserAndWorkspace(t, db)
	app := newTestApp(db, user)

	rec := doRequest(app, "GET", "/workspaces/not-a-uuid/posts", nil)

	assert.Equal(t, fiber.StatusBadRequest, rec.Code,
		"invalid workspace UUID must return 400 Bad Request")

	var body map[string]interface{}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	assert.Contains(t, body, "error")
}

// ─── TestGetPost_NotFound ─────────────────────────────────────────────────────

func TestGetPost_NotFound(t *testing.T) {
	db := setupHandlerDB(t)
	user, ws := seedUserAndWorkspace(t, db)
	app := newTestApp(db, user)

	nonExistentID := uuid.New()
	url := "/workspaces/" + ws.ID.String() + "/posts/" + nonExistentID.String()
	rec := doRequest(app, "GET", url, nil)

	assert.Equal(t, fiber.StatusNotFound, rec.Code,
		"querying a non-existent post must return 404 Not Found")

	var body map[string]interface{}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	assert.Contains(t, body, "error")
}

// ─── TestCreatePost_MissingContent ───────────────────────────────────────────

func TestCreatePost_MissingContent(t *testing.T) {
	db := setupHandlerDB(t)
	user, ws := seedUserAndWorkspace(t, db)
	app := newTestApp(db, user)

	// Send a body with platforms set but content intentionally omitted.
	payload := map[string]interface{}{
		"platforms": []string{"twitter"},
	}
	b, _ := json.Marshal(payload)
	url := "/workspaces/" + ws.ID.String() + "/posts"
	rec := doRequest(app, "POST", url, bytes.NewReader(b))

	assert.Equal(t, fiber.StatusBadRequest, rec.Code,
		"post creation without content must return 400 Bad Request")

	var body map[string]interface{}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	assert.Contains(t, body, "error")
}

// ─── TestCreatePost_MissingPlatforms ─────────────────────────────────────────

func TestCreatePost_MissingPlatforms(t *testing.T) {
	db := setupHandlerDB(t)
	user, ws := seedUserAndWorkspace(t, db)
	app := newTestApp(db, user)

	payload := map[string]interface{}{
		"content": "Great content but no platforms",
	}
	b, _ := json.Marshal(payload)
	url := "/workspaces/" + ws.ID.String() + "/posts"
	rec := doRequest(app, "POST", url, bytes.NewReader(b))

	assert.Equal(t, fiber.StatusBadRequest, rec.Code,
		"post creation without platforms must return 400 Bad Request")
}

// ─── TestCreatePost_EmptyBody ─────────────────────────────────────────────────

func TestCreatePost_EmptyBody(t *testing.T) {
	db := setupHandlerDB(t)
	user, ws := seedUserAndWorkspace(t, db)
	app := newTestApp(db, user)

	url := "/workspaces/" + ws.ID.String() + "/posts"
	// Send an empty JSON object — neither content nor platforms are set.
	rec := doRequest(app, "POST", url, bytes.NewReader([]byte("{}")))

	assert.Equal(t, fiber.StatusBadRequest, rec.Code,
		"empty request body must return 400 Bad Request")
}

// ─── TestDeletePost_Success ───────────────────────────────────────────────────

func TestDeletePost_Success(t *testing.T) {
	db := setupHandlerDB(t)
	user, ws := seedUserAndWorkspace(t, db)
	app := newTestApp(db, user)

	// Insert a post directly into the database.
	post := &models.Post{
		Base:        models.Base{ID: uuid.New()},
		WorkspaceID: ws.ID,
		AuthorID:    user.ID,
		Content:     "Post to be deleted",
		Type:        models.PostTypeText,
		Status:      models.PostStatusDraft,
		Platforms:   models.StringSlice{"twitter"},
	}
	require.NoError(t, db.Create(post).Error)

	url := "/workspaces/" + ws.ID.String() + "/posts/" + post.ID.String()
	rec := doRequest(app, "DELETE", url, nil)

	assert.Equal(t, fiber.StatusOK, rec.Code,
		"deleting an existing post must return 200 OK")

	var body map[string]interface{}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	data, ok := body["data"].(map[string]interface{})
	require.True(t, ok, "response must contain a 'data' object")
	assert.Equal(t, "post deleted", data["message"],
		"response message must confirm deletion")

	// Verify the record is soft-deleted (no longer fetchable via GORM default scope).
	var count int64
	db.Model(&models.Post{}).Where("id = ?", post.ID).Count(&count)
	assert.Equal(t, int64(0), count, "soft-deleted post must not appear in default queries")
}

// ─── TestDeletePost_NotFound ──────────────────────────────────────────────────

func TestDeletePost_NotFound(t *testing.T) {
	db := setupHandlerDB(t)
	user, ws := seedUserAndWorkspace(t, db)
	app := newTestApp(db, user)

	// Attempt to delete a post that does not exist.
	nonExistentID := uuid.New()
	url := "/workspaces/" + ws.ID.String() + "/posts/" + nonExistentID.String()
	rec := doRequest(app, "DELETE", url, nil)

	assert.Equal(t, fiber.StatusNotFound, rec.Code,
		"deleting a non-existent post must return 404 Not Found")
}

// ─── TestListPosts_Success ────────────────────────────────────────────────────

func TestListPosts_Success(t *testing.T) {
	db := setupHandlerDB(t)
	user, ws := seedUserAndWorkspace(t, db)
	app := newTestApp(db, user)

	// Insert two posts.
	for i := 0; i < 2; i++ {
		p := &models.Post{
			WorkspaceID: ws.ID,
			AuthorID:    user.ID,
			Content:     "Post content",
			Type:        models.PostTypeText,
			Status:      models.PostStatusDraft,
			Platforms:   models.StringSlice{"instagram"},
		}
		require.NoError(t, db.Create(p).Error)
	}

	url := "/workspaces/" + ws.ID.String() + "/posts"
	rec := doRequest(app, "GET", url, nil)

	assert.Equal(t, fiber.StatusOK, rec.Code,
		"listing posts for a valid workspace must return 200 OK")

	var body map[string]interface{}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Contains(t, body, "data")
	require.Contains(t, body, "meta")

	meta, ok := body["meta"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, float64(2), meta["total"],
		"meta.total must reflect the number of seeded posts")
}

// ─── TestGetPost_Success ──────────────────────────────────────────────────────

func TestGetPost_Success(t *testing.T) {
	db := setupHandlerDB(t)
	user, ws := seedUserAndWorkspace(t, db)
	app := newTestApp(db, user)

	post := &models.Post{
		Base:        models.Base{ID: uuid.New()},
		WorkspaceID: ws.ID,
		AuthorID:    user.ID,
		Content:     "Retrievable post",
		Type:        models.PostTypeText,
		Status:      models.PostStatusDraft,
		Platforms:   models.StringSlice{"facebook"},
	}
	require.NoError(t, db.Create(post).Error)

	url := "/workspaces/" + ws.ID.String() + "/posts/" + post.ID.String()
	rec := doRequest(app, "GET", url, nil)

	assert.Equal(t, fiber.StatusOK, rec.Code,
		"fetching an existing post must return 200 OK")

	var body map[string]interface{}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	data, ok := body["data"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, "Retrievable post", data["content"])
}

// ─── TestGetPost_InvalidPostID ────────────────────────────────────────────────

func TestGetPost_InvalidPostID(t *testing.T) {
	db := setupHandlerDB(t)
	user, ws := seedUserAndWorkspace(t, db)
	app := newTestApp(db, user)

	url := "/workspaces/" + ws.ID.String() + "/posts/not-a-uuid"
	rec := doRequest(app, "GET", url, nil)

	assert.Equal(t, fiber.StatusBadRequest, rec.Code,
		"invalid post ID must return 400 Bad Request")
}

// ─── TestCreatePost_InvalidWorkspaceID ───────────────────────────────────────

func TestCreatePost_InvalidWorkspaceID(t *testing.T) {
	db := setupHandlerDB(t)
	user, _ := seedUserAndWorkspace(t, db)
	app := newTestApp(db, user)

	payload := map[string]interface{}{
		"content":   "Great content",
		"platforms": []string{"instagram"},
	}
	b, _ := json.Marshal(payload)
	rec := doRequest(app, "POST", "/workspaces/bad-uuid/posts", bytes.NewReader(b))

	assert.Equal(t, fiber.StatusBadRequest, rec.Code,
		"invalid workspace UUID in create post must return 400")
}
