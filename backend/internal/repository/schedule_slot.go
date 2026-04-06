package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/socialforge/backend/internal/models"
	"gorm.io/gorm"
)

// scheduleSlotRepo is the GORM-backed implementation of ScheduleSlotRepository.
type scheduleSlotRepo struct {
	db *gorm.DB
}

// NewScheduleSlotRepo constructs a scheduleSlotRepo backed by the given *gorm.DB.
func NewScheduleSlotRepo(db *gorm.DB) ScheduleSlotRepository {
	return &scheduleSlotRepo{db: db}
}

// Create inserts a new schedule slot record into the database.
func (r *scheduleSlotRepo) Create(ctx context.Context, slot *models.ScheduleSlot) error {
	result := r.db.WithContext(ctx).Create(slot)
	return result.Error
}

// GetByID retrieves a schedule slot by its UUID primary key.
// Returns ErrNotFound when no matching record exists.
func (r *scheduleSlotRepo) GetByID(ctx context.Context, id uuid.UUID) (*models.ScheduleSlot, error) {
	var slot models.ScheduleSlot
	result := r.db.WithContext(ctx).Where("id = ?", id).First(&slot)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, result.Error
	}
	return &slot, nil
}

// Delete soft-deletes the schedule slot identified by id.
func (r *scheduleSlotRepo) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.WithContext(ctx).Delete(&models.ScheduleSlot{}, "id = ?", id)
	return result.Error
}

// ListByWorkspace returns all schedule slots belonging to the given workspace.
func (r *scheduleSlotRepo) ListByWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]*models.ScheduleSlot, error) {
	var slots []*models.ScheduleSlot
	result := r.db.WithContext(ctx).
		Where("workspace_id = ?", workspaceID).
		Order("day_of_week ASC, time_of_day ASC").
		Find(&slots)
	if result.Error != nil {
		return nil, result.Error
	}
	return slots, nil
}

// ListByWorkspaceAndPlatform returns all schedule slots for a workspace that
// belong to a specific platform string.
func (r *scheduleSlotRepo) ListByWorkspaceAndPlatform(ctx context.Context, workspaceID uuid.UUID, platform string) ([]*models.ScheduleSlot, error) {
	var slots []*models.ScheduleSlot
	result := r.db.WithContext(ctx).
		Where("workspace_id = ? AND platform = ?", workspaceID, platform).
		Order("day_of_week ASC, time_of_day ASC").
		Find(&slots)
	if result.Error != nil {
		return nil, result.Error
	}
	return slots, nil
}
