package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	gormsqlite "gorm.io/driver/sqlite"
	"gorm.io/gorm"
	_ "modernc.org/sqlite"

	"github.com/socialforge/backend/internal/models"
	"github.com/socialforge/backend/internal/repository"
)

// setupPostTestDB opens an in-memory SQLite DB and creates tables needed
// for post tests. It also seeds one User and one Workspace so foreign key
// references can be satisfied.
func setupPostTestDB(t *testing.T) (*gorm.DB, uuid.UUID, uuid.UUID) {
	t.Helper()
	db, err := gorm.Open(gormsqlite.Dialector{DriverName: "sqlite", DSN: ":memory:"}, &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, createTestTables(db))

	// Seed a user.
	user := &models.User{
		Email:        "posttest@example.com",
		PasswordHash: "hash",
		Name:         "Post Tester",
		Plan:         models.PlanFree,
	}
	require.NoError(t, db.Create(user).Error)

	// Seed a workspace owned by that user.
	ws := &models.Workspace{
		Name:    "Test Workspace",
		Slug:    "test-workspace",
		OwnerID: user.ID,
		Plan:    models.PlanFree,
	}
	require.NoError(t, db.Create(ws).Error)

	return db, ws.ID, user.ID
}

// newTestPost constructs a minimal Post for use in tests.
func newTestPost(wsID, authorID uuid.UUID, content string, status models.PostStatus) *models.Post {
	return &models.Post{
		WorkspaceID: wsID,
		AuthorID:    authorID,
		Content:     content,
		Type:        models.PostTypeText,
		Status:      status,
		Platforms:   models.StringSlice{"twitter"},
	}
}

// ─── TestPostRepo_Create ──────────────────────────────────────────────────────

func TestPostRepo_Create(t *testing.T) {
	db, wsID, authorID := setupPostTestDB(t)
	repo := repository.NewPostRepo(db)
	ctx := context.Background()

	post := newTestPost(wsID, authorID, "Hello world", models.PostStatusDraft)
	err := repo.Create(ctx, post)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, post.ID)

	// Verify the record is retrievable and fields match.
	fetched, err := repo.GetByID(ctx, post.ID)
	require.NoError(t, err)
	assert.Equal(t, post.ID, fetched.ID)
	assert.Equal(t, "Hello world", fetched.Content)
	assert.Equal(t, models.PostStatusDraft, fetched.Status)
	assert.Equal(t, wsID, fetched.WorkspaceID)
}

// ─── TestPostRepo_List_FilterByStatus ────────────────────────────────────────

func TestPostRepo_List_FilterByStatus(t *testing.T) {
	db, wsID, authorID := setupPostTestDB(t)
	repo := repository.NewPostRepo(db)
	ctx := context.Background()

	// Create 2 scheduled + 1 draft posts.
	schedTime := time.Now().Add(time.Hour)
	p1 := newTestPost(wsID, authorID, "Scheduled A", models.PostStatusScheduled)
	p1.ScheduledAt = &schedTime
	p2 := newTestPost(wsID, authorID, "Scheduled B", models.PostStatusScheduled)
	p2.ScheduledAt = &schedTime
	p3 := newTestPost(wsID, authorID, "Draft C", models.PostStatusDraft)

	require.NoError(t, repo.Create(ctx, p1))
	require.NoError(t, repo.Create(ctx, p2))
	require.NoError(t, repo.Create(ctx, p3))

	posts, total, err := repo.List(ctx, repository.PostFilter{
		WorkspaceID: wsID,
		Status:      string(models.PostStatusScheduled),
		Page:        1,
		Limit:       50,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(2), total, "total should reflect only scheduled posts")
	assert.Len(t, posts, 2)
	for _, p := range posts {
		assert.Equal(t, models.PostStatusScheduled, p.Status)
	}
}

// ─── TestPostRepo_List_Pagination ────────────────────────────────────────────

func TestPostRepo_List_Pagination(t *testing.T) {
	db, wsID, authorID := setupPostTestDB(t)
	repo := repository.NewPostRepo(db)
	ctx := context.Background()

	// Create 5 draft posts.
	for i := 0; i < 5; i++ {
		p := newTestPost(wsID, authorID, "Paginated post", models.PostStatusDraft)
		require.NoError(t, repo.Create(ctx, p))
	}

	// Fetch page 1, limit 2.
	posts, total, err := repo.List(ctx, repository.PostFilter{
		WorkspaceID: wsID,
		Page:        1,
		Limit:       2,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(5), total, "total count must be 5 regardless of page size")
	assert.Len(t, posts, 2, "first page should have exactly 2 posts")

	// Fetch page 2, limit 2.
	posts2, total2, err := repo.List(ctx, repository.PostFilter{
		WorkspaceID: wsID,
		Page:        2,
		Limit:       2,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(5), total2)
	assert.Len(t, posts2, 2, "second page should also have 2 posts")

	// Post IDs across pages must not overlap.
	seen := map[uuid.UUID]bool{}
	for _, p := range posts {
		seen[p.ID] = true
	}
	for _, p := range posts2 {
		assert.False(t, seen[p.ID], "pages must not return duplicate posts")
	}
}

// ─── TestPostRepo_ListDueForPublishing ───────────────────────────────────────

func TestPostRepo_ListDueForPublishing(t *testing.T) {
	db, wsID, authorID := setupPostTestDB(t)
	repo := repository.NewPostRepo(db)
	ctx := context.Background()

	past := time.Now().Add(-time.Hour)
	future := time.Now().Add(time.Hour)

	// A post scheduled in the past — should be returned.
	overdue := newTestPost(wsID, authorID, "Overdue post", models.PostStatusScheduled)
	overdue.ScheduledAt = &past
	require.NoError(t, repo.Create(ctx, overdue))

	// A post scheduled in the future — should NOT be returned.
	upcoming := newTestPost(wsID, authorID, "Upcoming post", models.PostStatusScheduled)
	upcoming.ScheduledAt = &future
	require.NoError(t, repo.Create(ctx, upcoming))

	// A draft post with no scheduled time — should NOT be returned.
	draft := newTestPost(wsID, authorID, "Draft post", models.PostStatusDraft)
	require.NoError(t, repo.Create(ctx, draft))

	due, err := repo.ListDueForPublishing(ctx, time.Now())
	require.NoError(t, err)
	require.Len(t, due, 1, "only the overdue post should be returned")
	assert.Equal(t, overdue.ID, due[0].ID)
}

// ─── TestPostRepo_UpdateStatus ────────────────────────────────────────────────

func TestPostRepo_UpdateStatus(t *testing.T) {
	db, wsID, authorID := setupPostTestDB(t)
	repo := repository.NewPostRepo(db)
	ctx := context.Background()

	post := newTestPost(wsID, authorID, "Status test post", models.PostStatusScheduled)
	require.NoError(t, repo.Create(ctx, post))

	err := repo.UpdateStatus(ctx, post.ID, models.PostStatusPublished, "")
	require.NoError(t, err)

	updated, err := repo.GetByID(ctx, post.ID)
	require.NoError(t, err)
	assert.Equal(t, models.PostStatusPublished, updated.Status)
	assert.Empty(t, updated.ErrorMessage)
}

// ─── TestPostRepo_UpdateStatus_WithError ─────────────────────────────────────

func TestPostRepo_UpdateStatus_WithError(t *testing.T) {
	db, wsID, authorID := setupPostTestDB(t)
	repo := repository.NewPostRepo(db)
	ctx := context.Background()

	post := newTestPost(wsID, authorID, "Failing post", models.PostStatusScheduled)
	require.NoError(t, repo.Create(ctx, post))

	err := repo.UpdateStatus(ctx, post.ID, models.PostStatusFailed, "rate limit exceeded")
	require.NoError(t, err)

	updated, err := repo.GetByID(ctx, post.ID)
	require.NoError(t, err)
	assert.Equal(t, models.PostStatusFailed, updated.Status)
	assert.Equal(t, "rate limit exceeded", updated.ErrorMessage)
}

// ─── TestPostRepo_BulkCreate ─────────────────────────────────────────────────

func TestPostRepo_BulkCreate(t *testing.T) {
	db, wsID, authorID := setupPostTestDB(t)
	repo := repository.NewPostRepo(db)
	ctx := context.Background()

	posts := make([]*models.Post, 10)
	for i := 0; i < 10; i++ {
		posts[i] = newTestPost(wsID, authorID, "Bulk post", models.PostStatusDraft)
	}

	err := repo.BulkCreate(ctx, posts)
	require.NoError(t, err)

	// Verify all 10 were inserted.
	_, total, err := repo.List(ctx, repository.PostFilter{
		WorkspaceID: wsID,
		Page:        1,
		Limit:       50,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(10), total)
}

// ─── TestPostRepo_IncrementAttempts ──────────────────────────────────────────

func TestPostRepo_IncrementAttempts(t *testing.T) {
	db, wsID, authorID := setupPostTestDB(t)
	repo := repository.NewPostRepo(db)
	ctx := context.Background()

	post := newTestPost(wsID, authorID, "Retry post", models.PostStatusFailed)
	require.NoError(t, repo.Create(ctx, post))
	assert.Equal(t, 0, post.RetryCount)

	require.NoError(t, repo.IncrementAttempts(ctx, post.ID))
	require.NoError(t, repo.IncrementAttempts(ctx, post.ID))

	updated, err := repo.GetByID(ctx, post.ID)
	require.NoError(t, err)
	assert.Equal(t, 2, updated.RetryCount, "RetryCount should be incremented to 2")
}

// ─── TestPostRepo_Delete ──────────────────────────────────────────────────────

func TestPostRepo_Delete(t *testing.T) {
	db, wsID, authorID := setupPostTestDB(t)
	repo := repository.NewPostRepo(db)
	ctx := context.Background()

	post := newTestPost(wsID, authorID, "To be deleted", models.PostStatusDraft)
	require.NoError(t, repo.Create(ctx, post))

	require.NoError(t, repo.Delete(ctx, post.ID))

	_, err := repo.GetByID(ctx, post.ID)
	require.Error(t, err)
	assert.ErrorIs(t, err, repository.ErrNotFound, "soft-deleted post should not be retrievable")
}

// ─── TestPostRepo_ListByDateRange ─────────────────────────────────────────────

func TestPostRepo_ListByDateRange(t *testing.T) {
	db, wsID, authorID := setupPostTestDB(t)
	repo := repository.NewPostRepo(db)
	ctx := context.Background()

	now := time.Now()
	yesterday := now.Add(-24 * time.Hour)
	twoDaysAgo := now.Add(-48 * time.Hour)
	tomorrow := now.Add(24 * time.Hour)

	// Post within range.
	p1 := newTestPost(wsID, authorID, "Yesterday post", models.PostStatusPublished)
	p1.ScheduledAt = &yesterday
	require.NoError(t, repo.Create(ctx, p1))

	// Post outside range (too old).
	p2 := newTestPost(wsID, authorID, "Two days ago post", models.PostStatusPublished)
	p2.ScheduledAt = &twoDaysAgo
	require.NoError(t, repo.Create(ctx, p2))

	from := now.Add(-36 * time.Hour)
	to := now.Add(36 * time.Hour)

	posts, err := repo.ListByDateRange(ctx, wsID, from, to)
	require.NoError(t, err)
	require.Len(t, posts, 1)
	assert.Equal(t, p1.ID, posts[0].ID)

	// tomorrow post should be included.
	p3 := newTestPost(wsID, authorID, "Tomorrow post", models.PostStatusScheduled)
	p3.ScheduledAt = &tomorrow
	require.NoError(t, repo.Create(ctx, p3))

	posts2, err := repo.ListByDateRange(ctx, wsID, from, to)
	require.NoError(t, err)
	assert.Len(t, posts2, 2)
}
