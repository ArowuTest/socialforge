package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/socialforge/backend/internal/models"
)

// UserRepository defines all user persistence operations.
type UserRepository interface {
	Create(ctx context.Context, user *models.User) error
	GetByID(ctx context.Context, id uuid.UUID) (*models.User, error)
	GetByEmail(ctx context.Context, email string) (*models.User, error)
	Update(ctx context.Context, user *models.User) error
	Delete(ctx context.Context, id uuid.UUID) error
	ExistsByEmail(ctx context.Context, email string) (bool, error)
}

// WorkspaceRepository defines all workspace persistence operations.
type WorkspaceRepository interface {
	Create(ctx context.Context, ws *models.Workspace) error
	GetByID(ctx context.Context, id uuid.UUID) (*models.Workspace, error)
	GetBySlug(ctx context.Context, slug string) (*models.Workspace, error)
	GetByCustomDomain(ctx context.Context, domain string) (*models.Workspace, error)
	Update(ctx context.Context, ws *models.Workspace) error
	Delete(ctx context.Context, id uuid.UUID) error
	AddMember(ctx context.Context, member *models.WorkspaceMember) error
	RemoveMember(ctx context.Context, workspaceID, userID uuid.UUID) error
	GetMember(ctx context.Context, workspaceID, userID uuid.UUID) (*models.WorkspaceMember, error)
	ListMembers(ctx context.Context, workspaceID uuid.UUID) ([]*models.WorkspaceMember, error)
	ListByOwner(ctx context.Context, ownerID uuid.UUID) ([]*models.Workspace, error)
	ListClients(ctx context.Context, parentID uuid.UUID) ([]*models.Workspace, error)
}

// PostRepository defines all post persistence operations.
type PostRepository interface {
	Create(ctx context.Context, post *models.Post) error
	GetByID(ctx context.Context, id uuid.UUID) (*models.Post, error)
	Update(ctx context.Context, post *models.Post) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, filter PostFilter) ([]*models.Post, int64, error)
	ListDueForPublishing(ctx context.Context, before time.Time) ([]*models.Post, error)
	ListFailed(ctx context.Context, maxAttempts int) ([]*models.Post, error)
	BulkCreate(ctx context.Context, posts []*models.Post) error
	UpdateStatus(ctx context.Context, id uuid.UUID, status models.PostStatus, errMsg string) error
	IncrementAttempts(ctx context.Context, id uuid.UUID) error
	UpsertPostPlatform(ctx context.Context, pp *models.PostPlatform) error
	ListByDateRange(ctx context.Context, workspaceID uuid.UUID, from, to time.Time) ([]*models.Post, error)
}

// PostFilter holds filtering options for listing posts.
type PostFilter struct {
	WorkspaceID uuid.UUID
	Status      string
	Platform    string
	From        *time.Time
	To          *time.Time
	Page        int
	Limit       int
}

// SocialAccountRepository defines all social account persistence operations.
type SocialAccountRepository interface {
	Create(ctx context.Context, account *models.SocialAccount) error
	GetByID(ctx context.Context, id uuid.UUID) (*models.SocialAccount, error)
	GetByPlatformAccountID(ctx context.Context, platform models.PlatformType, accountID string) (*models.SocialAccount, error)
	Update(ctx context.Context, account *models.SocialAccount) error
	Delete(ctx context.Context, id uuid.UUID) error
	ListByWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]*models.SocialAccount, error)
	ListByWorkspaceAndPlatform(ctx context.Context, workspaceID uuid.UUID, platform models.PlatformType) ([]*models.SocialAccount, error)
	ListExpiringTokens(ctx context.Context, before time.Time) ([]*models.SocialAccount, error)
	UpdateTokens(ctx context.Context, id uuid.UUID, accessToken, refreshToken string, expiresAt time.Time) error
}

// ScheduleSlotRepository defines schedule slot persistence operations.
type ScheduleSlotRepository interface {
	Create(ctx context.Context, slot *models.ScheduleSlot) error
	GetByID(ctx context.Context, id uuid.UUID) (*models.ScheduleSlot, error)
	Delete(ctx context.Context, id uuid.UUID) error
	ListByWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]*models.ScheduleSlot, error)
	ListByWorkspaceAndPlatform(ctx context.Context, workspaceID uuid.UUID, platform string) ([]*models.ScheduleSlot, error)
}

// APIKeyRepository defines API key persistence operations.
type APIKeyRepository interface {
	Create(ctx context.Context, key *models.ApiKey) error
	GetByHash(ctx context.Context, keyHash string) (*models.ApiKey, error)
	GetByID(ctx context.Context, id uuid.UUID) (*models.ApiKey, error)
	ListByWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]*models.ApiKey, error)
	Delete(ctx context.Context, id uuid.UUID) error
	UpdateLastUsed(ctx context.Context, id uuid.UUID) error
}

// AIJobRepository defines AI job persistence operations.
type AIJobRepository interface {
	Create(ctx context.Context, job *models.AIJob) error
	GetByID(ctx context.Context, id uuid.UUID) (*models.AIJob, error)
	Update(ctx context.Context, job *models.AIJob) error
	ListByWorkspace(ctx context.Context, workspaceID uuid.UUID, limit int) ([]*models.AIJob, error)
	SumCreditsByWorkspaceThisMonth(ctx context.Context, workspaceID uuid.UUID) (int, error)
}

// AuditLogRepository defines audit log persistence operations.
type AuditLogRepository interface {
	Create(ctx context.Context, log *models.AuditLog) error
	ListByWorkspace(ctx context.Context, workspaceID uuid.UUID, limit, offset int) ([]*models.AuditLog, error)
	DeleteOlderThan(ctx context.Context, before time.Time) error
}

// AnalyticsRepository is defined in analytics.go alongside its value types
// (DayCount, PlatformEngagement, ContentTypeCount) and GORM implementation.
