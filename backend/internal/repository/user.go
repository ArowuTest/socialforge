package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/socialforge/backend/internal/models"
	"gorm.io/gorm"
)

// userRepo is the GORM-backed implementation of UserRepository.
type userRepo struct {
	db *gorm.DB
}

// NewUserRepo constructs a userRepo backed by the given *gorm.DB.
func NewUserRepo(db *gorm.DB) UserRepository {
	return &userRepo{db: db}
}

// Create inserts a new user record into the database.
func (r *userRepo) Create(ctx context.Context, user *models.User) error {
	result := r.db.WithContext(ctx).Create(user)
	return result.Error
}

// GetByID retrieves a user by their UUID primary key.
// Returns ErrNotFound when no matching record exists.
func (r *userRepo) GetByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	var user models.User
	result := r.db.WithContext(ctx).Where("id = ?", id).First(&user)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, result.Error
	}
	return &user, nil
}

// GetByEmail retrieves a user by their email address.
// Returns ErrNotFound when no matching record exists.
func (r *userRepo) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	var user models.User
	result := r.db.WithContext(ctx).Where("email = ?", email).First(&user)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, result.Error
	}
	return &user, nil
}

// Update saves all fields of the user record to the database.
func (r *userRepo) Update(ctx context.Context, user *models.User) error {
	result := r.db.WithContext(ctx).Save(user)
	return result.Error
}

// Delete soft-deletes the user identified by id.
func (r *userRepo) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.WithContext(ctx).Delete(&models.User{}, "id = ?", id)
	return result.Error
}

// ExistsByEmail reports whether a user with the given email address exists.
// It queries only the id column for efficiency.
func (r *userRepo) ExistsByEmail(ctx context.Context, email string) (bool, error) {
	var user models.User
	result := r.db.WithContext(ctx).Select("id").Where("email = ?", email).First(&user)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, result.Error
	}
	return true, nil
}
