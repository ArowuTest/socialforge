package repository_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	gormsqlite "gorm.io/driver/sqlite"
	"gorm.io/gorm"
	_ "modernc.org/sqlite"

	"github.com/socialforge/backend/internal/models"
	"github.com/socialforge/backend/internal/repository"
)

// setupTestDB opens an in-memory SQLite database and creates all tables needed
// for user and workspace tests using raw SQL (avoiding Postgres-specific DDL
// such as gen_random_uuid() which is not available in SQLite).
func setupTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(gormsqlite.Dialector{DriverName: "sqlite", DSN: ":memory:"}, &gorm.Config{})
	require.NoError(t, err, "failed to open in-memory SQLite")
	require.NoError(t, createTestTables(db), "createTestTables failed")
	return db
}

// createTestTables creates all tables used by repository tests in SQLite-compatible DDL.
func createTestTables(db *gorm.DB) error {
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
			logo_url TEXT, primary_color TEXT, custom_domain TEXT, is_whitelabel INTEGER NOT NULL DEFAULT 0,
			plan TEXT NOT NULL DEFAULT 'free',
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
		`CREATE TABLE IF NOT EXISTS social_accounts (
			id TEXT PRIMARY KEY,
			created_at DATETIME, updated_at DATETIME, deleted_at DATETIME,
			workspace_id TEXT NOT NULL, platform TEXT NOT NULL, account_id TEXT NOT NULL,
			account_name TEXT, account_handle TEXT, account_type TEXT,
			avatar_url TEXT, access_token TEXT NOT NULL, refresh_token TEXT,
			token_expires_at DATETIME, scopes TEXT, is_active INTEGER NOT NULL DEFAULT 1,
			page_id TEXT, page_name TEXT, follower_count INTEGER DEFAULT 0,
			profile_url TEXT, metadata TEXT
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
		`CREATE TABLE IF NOT EXISTS schedule_slots (
			id TEXT PRIMARY KEY,
			created_at DATETIME, updated_at DATETIME, deleted_at DATETIME,
			workspace_id TEXT NOT NULL, platform TEXT NOT NULL,
			day_of_week INTEGER NOT NULL, time_of_day TEXT NOT NULL,
			timezone TEXT NOT NULL DEFAULT 'UTC', is_active INTEGER NOT NULL DEFAULT 1
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
		if err := db.Exec(stmt).Error; err != nil {
			return err
		}
	}
	return nil
}

// newTestUser returns a minimal valid User ready to be created.
func newTestUser(email, name string) *models.User {
	return &models.User{
		Email:        email,
		PasswordHash: "$2a$12$xxxxhashplaceholder", // not used for auth in these tests
		Name:         name,
		Plan:         models.PlanFree,
	}
}

// ─── TestUserRepo_Create ──────────────────────────────────────────────────────

func TestUserRepo_Create(t *testing.T) {
	db := setupTestDB(t)
	repo := repository.NewUserRepo(db)
	ctx := context.Background()

	user := newTestUser("alice@example.com", "Alice")
	err := repo.Create(ctx, user)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, user.ID, "ID must be populated after Create")

	// Verify the record is retrievable.
	fetched, err := repo.GetByID(ctx, user.ID)
	require.NoError(t, err)
	assert.Equal(t, user.ID, fetched.ID)
	assert.Equal(t, "alice@example.com", fetched.Email)
	assert.Equal(t, "Alice", fetched.Name)
	assert.Equal(t, models.PlanFree, fetched.Plan)
}

// ─── TestUserRepo_GetByEmail ──────────────────────────────────────────────────

func TestUserRepo_GetByEmail(t *testing.T) {
	db := setupTestDB(t)
	repo := repository.NewUserRepo(db)
	ctx := context.Background()

	user := newTestUser("bob@example.com", "Bob")
	require.NoError(t, repo.Create(ctx, user))

	fetched, err := repo.GetByEmail(ctx, "bob@example.com")
	require.NoError(t, err)
	assert.Equal(t, user.ID, fetched.ID)
	assert.Equal(t, "bob@example.com", fetched.Email)
	assert.Equal(t, "Bob", fetched.Name)
}

// ─── TestUserRepo_GetByEmail_NotFound ─────────────────────────────────────────

func TestUserRepo_GetByEmail_NotFound(t *testing.T) {
	db := setupTestDB(t)
	repo := repository.NewUserRepo(db)
	ctx := context.Background()

	_, err := repo.GetByEmail(ctx, "ghost@example.com")
	require.Error(t, err)
	assert.ErrorIs(t, err, repository.ErrNotFound, "should return ErrNotFound for unknown email")
}

// ─── TestUserRepo_ExistsByEmail_True ─────────────────────────────────────────

func TestUserRepo_ExistsByEmail_True(t *testing.T) {
	db := setupTestDB(t)
	repo := repository.NewUserRepo(db)
	ctx := context.Background()

	user := newTestUser("carol@example.com", "Carol")
	require.NoError(t, repo.Create(ctx, user))

	exists, err := repo.ExistsByEmail(ctx, "carol@example.com")
	require.NoError(t, err)
	assert.True(t, exists, "ExistsByEmail should return true for an existing user")
}

// ─── TestUserRepo_ExistsByEmail_False ─────────────────────────────────────────

func TestUserRepo_ExistsByEmail_False(t *testing.T) {
	db := setupTestDB(t)
	repo := repository.NewUserRepo(db)
	ctx := context.Background()

	exists, err := repo.ExistsByEmail(ctx, "nobody@example.com")
	require.NoError(t, err)
	assert.False(t, exists, "ExistsByEmail should return false for a non-existent user")
}

// ─── TestUserRepo_Update ──────────────────────────────────────────────────────

func TestUserRepo_Update(t *testing.T) {
	db := setupTestDB(t)
	repo := repository.NewUserRepo(db)
	ctx := context.Background()

	user := newTestUser("dave@example.com", "Dave")
	require.NoError(t, repo.Create(ctx, user))

	// Update the name.
	user.Name = "David Updated"
	err := repo.Update(ctx, user)
	require.NoError(t, err)

	// Reload and verify the new name is persisted.
	updated, err := repo.GetByID(ctx, user.ID)
	require.NoError(t, err)
	assert.Equal(t, "David Updated", updated.Name)
}

// ─── TestUserRepo_Delete ──────────────────────────────────────────────────────

func TestUserRepo_Delete(t *testing.T) {
	db := setupTestDB(t)
	repo := repository.NewUserRepo(db)
	ctx := context.Background()

	user := newTestUser("eve@example.com", "Eve")
	require.NoError(t, repo.Create(ctx, user))

	// Soft-delete the user.
	err := repo.Delete(ctx, user.ID)
	require.NoError(t, err)

	// GetByID should now return ErrNotFound.
	_, err = repo.GetByID(ctx, user.ID)
	require.Error(t, err)
	assert.ErrorIs(t, err, repository.ErrNotFound, "deleted user should not be retrievable by ID")
}

// ─── TestUserRepo_GetByID_NotFound ────────────────────────────────────────────

func TestUserRepo_GetByID_NotFound(t *testing.T) {
	db := setupTestDB(t)
	repo := repository.NewUserRepo(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	require.Error(t, err)
	assert.ErrorIs(t, err, repository.ErrNotFound)
}
