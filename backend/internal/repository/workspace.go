package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/socialforge/backend/internal/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// workspaceRepo is the GORM-backed implementation of WorkspaceRepository.
type workspaceRepo struct {
	db *gorm.DB
}

// NewWorkspaceRepo constructs a workspaceRepo backed by the given *gorm.DB.
func NewWorkspaceRepo(db *gorm.DB) WorkspaceRepository {
	return &workspaceRepo{db: db}
}

// Create inserts a new workspace record into the database.
func (r *workspaceRepo) Create(ctx context.Context, ws *models.Workspace) error {
	result := r.db.WithContext(ctx).Create(ws)
	return result.Error
}

// GetByID retrieves a workspace by its UUID primary key.
// Returns ErrNotFound when no matching record exists.
func (r *workspaceRepo) GetByID(ctx context.Context, id uuid.UUID) (*models.Workspace, error) {
	var ws models.Workspace
	result := r.db.WithContext(ctx).Where("id = ?", id).First(&ws)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, result.Error
	}
	return &ws, nil
}

// GetBySlug retrieves a workspace by its slug using a case-insensitive match.
// Returns ErrNotFound when no matching record exists.
func (r *workspaceRepo) GetBySlug(ctx context.Context, slug string) (*models.Workspace, error) {
	var ws models.Workspace
	result := r.db.WithContext(ctx).Where("LOWER(slug) = LOWER(?)", slug).First(&ws)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, result.Error
	}
	return &ws, nil
}

// GetByCustomDomain retrieves a workspace by its custom domain.
// Returns ErrNotFound when no matching record exists.
func (r *workspaceRepo) GetByCustomDomain(ctx context.Context, domain string) (*models.Workspace, error) {
	var ws models.Workspace
	result := r.db.WithContext(ctx).Where("custom_domain = ?", domain).First(&ws)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, result.Error
	}
	return &ws, nil
}

// Update saves all fields of the workspace record to the database.
func (r *workspaceRepo) Update(ctx context.Context, ws *models.Workspace) error {
	result := r.db.WithContext(ctx).Save(ws)
	return result.Error
}

// Delete soft-deletes the workspace identified by id.
func (r *workspaceRepo) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.WithContext(ctx).Delete(&models.Workspace{}, "id = ?", id)
	return result.Error
}

// AddMember creates a WorkspaceMember record, silently ignoring conflicts so
// the operation is idempotent (ON CONFLICT DO NOTHING).
func (r *workspaceRepo) AddMember(ctx context.Context, member *models.WorkspaceMember) error {
	result := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(member)
	return result.Error
}

// RemoveMember hard-deletes the membership record for the given workspace and user.
// WorkspaceMember does not use soft-delete semantics for membership removal.
func (r *workspaceRepo) RemoveMember(ctx context.Context, workspaceID, userID uuid.UUID) error {
	result := r.db.WithContext(ctx).
		Where("workspace_id = ? AND user_id = ?", workspaceID, userID).
		Delete(&models.WorkspaceMember{})
	return result.Error
}

// GetMember retrieves the membership record for the given workspace and user.
// Returns ErrNotFound when no matching record exists.
func (r *workspaceRepo) GetMember(ctx context.Context, workspaceID, userID uuid.UUID) (*models.WorkspaceMember, error) {
	var member models.WorkspaceMember
	result := r.db.WithContext(ctx).
		Where("workspace_id = ? AND user_id = ?", workspaceID, userID).
		First(&member)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, result.Error
	}
	return &member, nil
}

// ListMembers returns all members belonging to the given workspace.
func (r *workspaceRepo) ListMembers(ctx context.Context, workspaceID uuid.UUID) ([]*models.WorkspaceMember, error) {
	var members []*models.WorkspaceMember
	result := r.db.WithContext(ctx).
		Where("workspace_id = ?", workspaceID).
		Find(&members)
	if result.Error != nil {
		return nil, result.Error
	}
	return members, nil
}

// ListByOwner returns all workspaces owned by the given user.
func (r *workspaceRepo) ListByOwner(ctx context.Context, ownerID uuid.UUID) ([]*models.Workspace, error) {
	var workspaces []*models.Workspace
	result := r.db.WithContext(ctx).
		Where("owner_id = ?", ownerID).
		Find(&workspaces)
	if result.Error != nil {
		return nil, result.Error
	}
	return workspaces, nil
}

// ListClients returns all child workspaces that have parentID as their parent.
func (r *workspaceRepo) ListClients(ctx context.Context, parentID uuid.UUID) ([]*models.Workspace, error) {
	var workspaces []*models.Workspace
	result := r.db.WithContext(ctx).
		Where("parent_workspace_id = ?", parentID).
		Find(&workspaces)
	if result.Error != nil {
		return nil, result.Error
	}
	return workspaces, nil
}
