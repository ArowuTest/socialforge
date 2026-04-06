package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/socialforge/backend/internal/models"
	"gorm.io/gorm"
)

// socialAccountRepo is the GORM-backed implementation of SocialAccountRepository.
type socialAccountRepo struct {
	db *gorm.DB
}

// NewSocialAccountRepo constructs a socialAccountRepo backed by the given *gorm.DB.
func NewSocialAccountRepo(db *gorm.DB) SocialAccountRepository {
	return &socialAccountRepo{db: db}
}

// Create inserts a new social account record into the database.
func (r *socialAccountRepo) Create(ctx context.Context, account *models.SocialAccount) error {
	result := r.db.WithContext(ctx).Create(account)
	return result.Error
}

// GetByID retrieves a social account by its UUID primary key.
// Returns ErrNotFound when no matching record exists.
func (r *socialAccountRepo) GetByID(ctx context.Context, id uuid.UUID) (*models.SocialAccount, error) {
	var account models.SocialAccount
	result := r.db.WithContext(ctx).Where("id = ?", id).First(&account)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, result.Error
	}
	return &account, nil
}

// GetByPlatformAccountID retrieves a social account by the combination of
// platform type and the platform-native account ID.
// Returns ErrNotFound when no matching record exists.
func (r *socialAccountRepo) GetByPlatformAccountID(ctx context.Context, platform models.PlatformType, accountID string) (*models.SocialAccount, error) {
	var account models.SocialAccount
	result := r.db.WithContext(ctx).
		Where("platform = ? AND account_id = ?", platform, accountID).
		First(&account)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, result.Error
	}
	return &account, nil
}

// Update saves all fields of the social account record to the database.
func (r *socialAccountRepo) Update(ctx context.Context, account *models.SocialAccount) error {
	result := r.db.WithContext(ctx).Save(account)
	return result.Error
}

// Delete soft-deletes the social account identified by id.
func (r *socialAccountRepo) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.WithContext(ctx).Delete(&models.SocialAccount{}, "id = ?", id)
	return result.Error
}

// ListByWorkspace returns all social accounts belonging to the given workspace.
func (r *socialAccountRepo) ListByWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]*models.SocialAccount, error) {
	var accounts []*models.SocialAccount
	result := r.db.WithContext(ctx).
		Where("workspace_id = ?", workspaceID).
		Find(&accounts)
	if result.Error != nil {
		return nil, result.Error
	}
	return accounts, nil
}

// ListByWorkspaceAndPlatform returns all social accounts for a workspace that
// belong to a specific platform.
func (r *socialAccountRepo) ListByWorkspaceAndPlatform(ctx context.Context, workspaceID uuid.UUID, platform models.PlatformType) ([]*models.SocialAccount, error) {
	var accounts []*models.SocialAccount
	result := r.db.WithContext(ctx).
		Where("workspace_id = ? AND platform = ?", workspaceID, platform).
		Find(&accounts)
	if result.Error != nil {
		return nil, result.Error
	}
	return accounts, nil
}

// ListExpiringTokens returns all active social accounts whose token_expires_at
// is on or before the given time, so the caller can proactively refresh them.
func (r *socialAccountRepo) ListExpiringTokens(ctx context.Context, before time.Time) ([]*models.SocialAccount, error) {
	var accounts []*models.SocialAccount
	result := r.db.WithContext(ctx).
		Where("token_expires_at <= ? AND is_active = ?", before, true).
		Find(&accounts)
	if result.Error != nil {
		return nil, result.Error
	}
	return accounts, nil
}

// UpdateTokens performs a targeted update of only the token-related fields
// (access_token, refresh_token, token_expires_at) for the account identified
// by id. No other fields are touched.
func (r *socialAccountRepo) UpdateTokens(ctx context.Context, id uuid.UUID, accessToken, refreshToken string, expiresAt time.Time) error {
	result := r.db.WithContext(ctx).
		Model(&models.SocialAccount{}).
		Where("id = ?", id).
		Updates(map[string]interface{}{
			"access_token":     accessToken,
			"refresh_token":    refreshToken,
			"token_expires_at": expiresAt,
		})
	return result.Error
}
