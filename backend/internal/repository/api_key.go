package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/socialforge/backend/internal/models"
	"gorm.io/gorm"
)

// apiKeyRepo is the GORM-backed implementation of APIKeyRepository.
type apiKeyRepo struct {
	db *gorm.DB
}

// NewAPIKeyRepo constructs an apiKeyRepo backed by the given *gorm.DB.
func NewAPIKeyRepo(db *gorm.DB) APIKeyRepository {
	return &apiKeyRepo{db: db}
}

// Create inserts a new API key record into the database.
func (r *apiKeyRepo) Create(ctx context.Context, key *models.ApiKey) error {
	result := r.db.WithContext(ctx).Create(key)
	return result.Error
}

// GetByHash retrieves an API key by its hashed key value.
// Returns ErrNotFound when no matching record exists.
func (r *apiKeyRepo) GetByHash(ctx context.Context, keyHash string) (*models.ApiKey, error) {
	var key models.ApiKey
	result := r.db.WithContext(ctx).Where("key_hash = ?", keyHash).First(&key)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, result.Error
	}
	return &key, nil
}

// GetByID retrieves an API key by its UUID primary key.
// Returns ErrNotFound when no matching record exists.
func (r *apiKeyRepo) GetByID(ctx context.Context, id uuid.UUID) (*models.ApiKey, error) {
	var key models.ApiKey
	result := r.db.WithContext(ctx).Where("id = ?", id).First(&key)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, result.Error
	}
	return &key, nil
}

// ListByWorkspace returns all API keys belonging to the given workspace,
// ordered by creation date (newest first).
func (r *apiKeyRepo) ListByWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]*models.ApiKey, error) {
	var keys []*models.ApiKey
	result := r.db.WithContext(ctx).
		Where("workspace_id = ?", workspaceID).
		Order("created_at DESC").
		Find(&keys)
	if result.Error != nil {
		return nil, result.Error
	}
	return keys, nil
}

// Delete soft-deletes the API key identified by id.
func (r *apiKeyRepo) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.WithContext(ctx).Delete(&models.ApiKey{}, "id = ?", id)
	return result.Error
}

// UpdateLastUsed stamps the last_used_at column with the current database time
// for the API key identified by id. Only this single column is written so the
// hot-path (per-request auth) has a minimal write footprint.
func (r *apiKeyRepo) UpdateLastUsed(ctx context.Context, id uuid.UUID) error {
	now := time.Now()
	result := r.db.WithContext(ctx).
		Model(&models.ApiKey{}).
		Where("id = ?", id).
		UpdateColumn("last_used_at", now)
	return result.Error
}
