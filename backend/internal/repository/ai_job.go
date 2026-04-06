package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/socialforge/backend/internal/models"
	"gorm.io/gorm"
)

// aiJobRepo is the GORM-backed implementation of AIJobRepository.
type aiJobRepo struct {
	db *gorm.DB
}

// NewAIJobRepo constructs an aiJobRepo backed by the given *gorm.DB.
func NewAIJobRepo(db *gorm.DB) AIJobRepository {
	return &aiJobRepo{db: db}
}

// Create inserts a new AI job record into the database.
func (r *aiJobRepo) Create(ctx context.Context, job *models.AIJob) error {
	result := r.db.WithContext(ctx).Create(job)
	return result.Error
}

// GetByID retrieves an AI job by its UUID primary key.
// Returns ErrNotFound when no matching record exists.
func (r *aiJobRepo) GetByID(ctx context.Context, id uuid.UUID) (*models.AIJob, error) {
	var job models.AIJob
	result := r.db.WithContext(ctx).Where("id = ?", id).First(&job)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, result.Error
	}
	return &job, nil
}

// Update saves all fields of the AI job record to the database.
func (r *aiJobRepo) Update(ctx context.Context, job *models.AIJob) error {
	result := r.db.WithContext(ctx).Save(job)
	return result.Error
}

// ListByWorkspace returns the most recent AI jobs for the given workspace up
// to the provided limit, ordered by creation date (newest first).
func (r *aiJobRepo) ListByWorkspace(ctx context.Context, workspaceID uuid.UUID, limit int) ([]*models.AIJob, error) {
	if limit < 1 {
		limit = 20
	}
	var jobs []*models.AIJob
	result := r.db.WithContext(ctx).
		Where("workspace_id = ?", workspaceID).
		Order("created_at DESC").
		Limit(limit).
		Find(&jobs)
	if result.Error != nil {
		return nil, result.Error
	}
	return jobs, nil
}

// SumCreditsByWorkspaceThisMonth returns the total credits_used across all AI
// jobs for the given workspace that were created in the current calendar month.
// Returns 0 when no jobs exist for that period.
func (r *aiJobRepo) SumCreditsByWorkspaceThisMonth(ctx context.Context, workspaceID uuid.UUID) (int, error) {
	now := time.Now()
	// First day of the current month, midnight UTC.
	firstDay := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)

	var total int
	result := r.db.WithContext(ctx).
		Model(&models.AIJob{}).
		Select("COALESCE(SUM(credits_used), 0)").
		Where("workspace_id = ? AND created_at >= ?", workspaceID, firstDay).
		Scan(&total)
	if result.Error != nil {
		return 0, result.Error
	}
	return total, nil
}
