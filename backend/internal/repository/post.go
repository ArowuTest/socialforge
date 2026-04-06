package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/socialforge/backend/internal/models"
	"gorm.io/gorm"
)

// postRepo is the GORM-backed implementation of PostRepository.
type postRepo struct {
	db *gorm.DB
}

// NewPostRepo constructs a postRepo backed by the given *gorm.DB.
func NewPostRepo(db *gorm.DB) PostRepository {
	return &postRepo{db: db}
}

// Create inserts a new post record into the database.
func (r *postRepo) Create(ctx context.Context, post *models.Post) error {
	result := r.db.WithContext(ctx).Create(post)
	return result.Error
}

// GetByID retrieves a post by its UUID primary key, preloading PostPlatforms.
// Returns ErrNotFound when no matching record exists.
func (r *postRepo) GetByID(ctx context.Context, id uuid.UUID) (*models.Post, error) {
	var post models.Post
	result := r.db.WithContext(ctx).
		Preload("PostPlatforms").
		Where("id = ?", id).
		First(&post)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, result.Error
	}
	return &post, nil
}

// Update saves all fields of the post record to the database.
func (r *postRepo) Update(ctx context.Context, post *models.Post) error {
	result := r.db.WithContext(ctx).Save(post)
	return result.Error
}

// Delete soft-deletes the post identified by id.
func (r *postRepo) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.WithContext(ctx).Delete(&models.Post{}, "id = ?", id)
	return result.Error
}

// List returns a paginated, filtered list of posts along with the total count
// of matching records (before pagination). All active PostFilter fields are
// applied as scopes so the count and fetch share the same query logic.
func (r *postRepo) List(ctx context.Context, filter PostFilter) ([]*models.Post, int64, error) {
	// Build a base query with all filter conditions as a scope.
	scope := func(db *gorm.DB) *gorm.DB {
		q := db
		if filter.WorkspaceID != uuid.Nil {
			q = q.Where("workspace_id = ?", filter.WorkspaceID)
		}
		if filter.Status != "" {
			q = q.Where("status = ?", filter.Status)
		}
		if filter.Platform != "" {
			// platforms is stored as a JSON array in a text column; use a JSON
			// containment check that works on Postgres.
			q = q.Where("platforms::jsonb ? ?", filter.Platform)
		}
		if filter.From != nil {
			q = q.Where("scheduled_at >= ?", *filter.From)
		}
		if filter.To != nil {
			q = q.Where("scheduled_at <= ?", *filter.To)
		}
		return q
	}

	// Count total rows matching the filter (without pagination).
	var total int64
	if err := r.db.WithContext(ctx).Model(&models.Post{}).Scopes(scope).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Apply pagination defaults.
	page := filter.Page
	if page < 1 {
		page = 1
	}
	limit := filter.Limit
	if limit < 1 {
		limit = 20
	}
	offset := (page - 1) * limit

	var posts []*models.Post
	result := r.db.WithContext(ctx).
		Scopes(scope).
		Preload("PostPlatforms").
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&posts)
	if result.Error != nil {
		return nil, 0, result.Error
	}
	return posts, total, nil
}

// ListDueForPublishing returns all scheduled posts whose scheduled_at is on or
// before the given time and that have not been soft-deleted.
func (r *postRepo) ListDueForPublishing(ctx context.Context, before time.Time) ([]*models.Post, error) {
	var posts []*models.Post
	result := r.db.WithContext(ctx).
		Where("status = ? AND scheduled_at <= ? AND deleted_at IS NULL", models.PostStatusScheduled, before).
		Preload("PostPlatforms").
		Find(&posts)
	if result.Error != nil {
		return nil, result.Error
	}
	return posts, nil
}

// ListFailed returns all posts in the failed state whose retry count is below
// maxAttempts (i.e. still eligible for a retry attempt).
func (r *postRepo) ListFailed(ctx context.Context, maxAttempts int) ([]*models.Post, error) {
	var posts []*models.Post
	result := r.db.WithContext(ctx).
		Where("status = ? AND retry_count < ?", models.PostStatusFailed, maxAttempts).
		Preload("PostPlatforms").
		Find(&posts)
	if result.Error != nil {
		return nil, result.Error
	}
	return posts, nil
}

// BulkCreate inserts a slice of posts using batches of 100 records to keep
// individual INSERT statements from growing too large.
func (r *postRepo) BulkCreate(ctx context.Context, posts []*models.Post) error {
	if len(posts) == 0 {
		return nil
	}
	result := r.db.WithContext(ctx).CreateInBatches(posts, 100)
	return result.Error
}

// UpdateStatus atomically updates the status and error_message fields of a post.
func (r *postRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status models.PostStatus, errMsg string) error {
	result := r.db.WithContext(ctx).
		Model(&models.Post{}).
		Where("id = ?", id).
		Updates(map[string]interface{}{
			"status":        status,
			"error_message": errMsg,
		})
	return result.Error
}

// IncrementAttempts atomically increments the retry_count field by 1.
func (r *postRepo) IncrementAttempts(ctx context.Context, id uuid.UUID) error {
	result := r.db.WithContext(ctx).
		Model(&models.Post{}).
		Where("id = ?", id).
		UpdateColumn("retry_count", gorm.Expr("retry_count + 1"))
	return result.Error
}

// UpsertPostPlatform saves a PostPlatform record, inserting it if it does not
// exist or updating all fields when the record already exists. GORM's Save
// performs an INSERT … ON CONFLICT UPDATE via the primary key.
func (r *postRepo) UpsertPostPlatform(ctx context.Context, pp *models.PostPlatform) error {
	result := r.db.WithContext(ctx).Save(pp)
	return result.Error
}

// ListByDateRange returns all posts for a workspace whose scheduled_at falls
// within the inclusive [from, to] window. Intended for calendar views.
func (r *postRepo) ListByDateRange(ctx context.Context, workspaceID uuid.UUID, from, to time.Time) ([]*models.Post, error) {
	var posts []*models.Post
	result := r.db.WithContext(ctx).
		Where("workspace_id = ? AND scheduled_at >= ? AND scheduled_at <= ?", workspaceID, from, to).
		Preload("PostPlatforms").
		Order("scheduled_at ASC").
		Find(&posts)
	if result.Error != nil {
		return nil, result.Error
	}
	return posts, nil
}
