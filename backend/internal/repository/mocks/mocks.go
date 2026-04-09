// Package mocks provides testify/mock implementations of all repository interfaces.
package mocks

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/mock"

	"github.com/socialforge/backend/internal/models"
	"github.com/socialforge/backend/internal/repository"
)

// ─── MockUserRepository ───────────────────────────────────────────────────────

// MockUserRepository is a testify/mock implementation of repository.UserRepository.
type MockUserRepository struct {
	mock.Mock
}

func (m *MockUserRepository) Create(ctx context.Context, user *models.User) error {
	args := m.Called(ctx, user)
	return args.Error(0)
}

func (m *MockUserRepository) GetByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.User), args.Error(1)
}

func (m *MockUserRepository) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	args := m.Called(ctx, email)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.User), args.Error(1)
}

func (m *MockUserRepository) Update(ctx context.Context, user *models.User) error {
	args := m.Called(ctx, user)
	return args.Error(0)
}

func (m *MockUserRepository) Delete(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func (m *MockUserRepository) ExistsByEmail(ctx context.Context, email string) (bool, error) {
	args := m.Called(ctx, email)
	return args.Bool(0), args.Error(1)
}

// ─── MockWorkspaceRepository ──────────────────────────────────────────────────

// MockWorkspaceRepository is a testify/mock implementation of repository.WorkspaceRepository.
type MockWorkspaceRepository struct {
	mock.Mock
}

func (m *MockWorkspaceRepository) Create(ctx context.Context, ws *models.Workspace) error {
	args := m.Called(ctx, ws)
	return args.Error(0)
}

func (m *MockWorkspaceRepository) GetByID(ctx context.Context, id uuid.UUID) (*models.Workspace, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Workspace), args.Error(1)
}

func (m *MockWorkspaceRepository) GetBySlug(ctx context.Context, slug string) (*models.Workspace, error) {
	args := m.Called(ctx, slug)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Workspace), args.Error(1)
}

func (m *MockWorkspaceRepository) GetByCustomDomain(ctx context.Context, domain string) (*models.Workspace, error) {
	args := m.Called(ctx, domain)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Workspace), args.Error(1)
}

func (m *MockWorkspaceRepository) Update(ctx context.Context, ws *models.Workspace) error {
	args := m.Called(ctx, ws)
	return args.Error(0)
}

func (m *MockWorkspaceRepository) Delete(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func (m *MockWorkspaceRepository) AddMember(ctx context.Context, member *models.WorkspaceMember) error {
	args := m.Called(ctx, member)
	return args.Error(0)
}

func (m *MockWorkspaceRepository) RemoveMember(ctx context.Context, workspaceID, userID uuid.UUID) error {
	args := m.Called(ctx, workspaceID, userID)
	return args.Error(0)
}

func (m *MockWorkspaceRepository) GetMember(ctx context.Context, workspaceID, userID uuid.UUID) (*models.WorkspaceMember, error) {
	args := m.Called(ctx, workspaceID, userID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.WorkspaceMember), args.Error(1)
}

func (m *MockWorkspaceRepository) UpdateMemberRole(ctx context.Context, workspaceID, userID uuid.UUID, role models.WorkspaceRole) error {
	args := m.Called(ctx, workspaceID, userID, role)
	return args.Error(0)
}

func (m *MockWorkspaceRepository) ListMembers(ctx context.Context, workspaceID uuid.UUID) ([]*models.WorkspaceMember, error) {
	args := m.Called(ctx, workspaceID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]*models.WorkspaceMember), args.Error(1)
}

func (m *MockWorkspaceRepository) ListByOwner(ctx context.Context, ownerID uuid.UUID) ([]*models.Workspace, error) {
	args := m.Called(ctx, ownerID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]*models.Workspace), args.Error(1)
}

func (m *MockWorkspaceRepository) ListClients(ctx context.Context, parentID uuid.UUID) ([]*models.Workspace, error) {
	args := m.Called(ctx, parentID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]*models.Workspace), args.Error(1)
}

// ─── MockPostRepository ───────────────────────────────────────────────────────

// MockPostRepository is a testify/mock implementation of repository.PostRepository.
type MockPostRepository struct {
	mock.Mock
}

func (m *MockPostRepository) Create(ctx context.Context, post *models.Post) error {
	args := m.Called(ctx, post)
	return args.Error(0)
}

func (m *MockPostRepository) GetByID(ctx context.Context, id uuid.UUID) (*models.Post, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Post), args.Error(1)
}

func (m *MockPostRepository) Update(ctx context.Context, post *models.Post) error {
	args := m.Called(ctx, post)
	return args.Error(0)
}

func (m *MockPostRepository) Delete(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func (m *MockPostRepository) List(ctx context.Context, filter repository.PostFilter) ([]*models.Post, int64, error) {
	args := m.Called(ctx, filter)
	if args.Get(0) == nil {
		return nil, args.Get(1).(int64), args.Error(2)
	}
	return args.Get(0).([]*models.Post), args.Get(1).(int64), args.Error(2)
}

func (m *MockPostRepository) ListDueForPublishing(ctx context.Context, before time.Time) ([]*models.Post, error) {
	args := m.Called(ctx, before)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]*models.Post), args.Error(1)
}

func (m *MockPostRepository) ListFailed(ctx context.Context, maxAttempts int) ([]*models.Post, error) {
	args := m.Called(ctx, maxAttempts)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]*models.Post), args.Error(1)
}

func (m *MockPostRepository) BulkCreate(ctx context.Context, posts []*models.Post) error {
	args := m.Called(ctx, posts)
	return args.Error(0)
}

func (m *MockPostRepository) UpdateStatus(ctx context.Context, id uuid.UUID, status models.PostStatus, errMsg string) error {
	args := m.Called(ctx, id, status, errMsg)
	return args.Error(0)
}

func (m *MockPostRepository) IncrementAttempts(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func (m *MockPostRepository) UpsertPostPlatform(ctx context.Context, pp *models.PostPlatform) error {
	args := m.Called(ctx, pp)
	return args.Error(0)
}

func (m *MockPostRepository) ListByDateRange(ctx context.Context, workspaceID uuid.UUID, from, to time.Time) ([]*models.Post, error) {
	args := m.Called(ctx, workspaceID, from, to)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]*models.Post), args.Error(1)
}

// ─── MockSocialAccountRepository ─────────────────────────────────────────────

// MockSocialAccountRepository is a testify/mock implementation of repository.SocialAccountRepository.
type MockSocialAccountRepository struct {
	mock.Mock
}

func (m *MockSocialAccountRepository) Create(ctx context.Context, account *models.SocialAccount) error {
	args := m.Called(ctx, account)
	return args.Error(0)
}

func (m *MockSocialAccountRepository) GetByID(ctx context.Context, id uuid.UUID) (*models.SocialAccount, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.SocialAccount), args.Error(1)
}

func (m *MockSocialAccountRepository) GetByPlatformAccountID(ctx context.Context, platform models.PlatformType, accountID string) (*models.SocialAccount, error) {
	args := m.Called(ctx, platform, accountID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.SocialAccount), args.Error(1)
}

func (m *MockSocialAccountRepository) Update(ctx context.Context, account *models.SocialAccount) error {
	args := m.Called(ctx, account)
	return args.Error(0)
}

func (m *MockSocialAccountRepository) Delete(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func (m *MockSocialAccountRepository) ListByWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]*models.SocialAccount, error) {
	args := m.Called(ctx, workspaceID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]*models.SocialAccount), args.Error(1)
}

func (m *MockSocialAccountRepository) ListByWorkspaceAndPlatform(ctx context.Context, workspaceID uuid.UUID, platform models.PlatformType) ([]*models.SocialAccount, error) {
	args := m.Called(ctx, workspaceID, platform)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]*models.SocialAccount), args.Error(1)
}

func (m *MockSocialAccountRepository) ListExpiringTokens(ctx context.Context, before time.Time) ([]*models.SocialAccount, error) {
	args := m.Called(ctx, before)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]*models.SocialAccount), args.Error(1)
}

func (m *MockSocialAccountRepository) UpdateTokens(ctx context.Context, id uuid.UUID, accessToken, refreshToken string, expiresAt time.Time) error {
	args := m.Called(ctx, id, accessToken, refreshToken, expiresAt)
	return args.Error(0)
}

// ─── MockScheduleSlotRepository ──────────────────────────────────────────────

// MockScheduleSlotRepository is a testify/mock implementation of repository.ScheduleSlotRepository.
type MockScheduleSlotRepository struct {
	mock.Mock
}

func (m *MockScheduleSlotRepository) Create(ctx context.Context, slot *models.ScheduleSlot) error {
	args := m.Called(ctx, slot)
	return args.Error(0)
}

func (m *MockScheduleSlotRepository) GetByID(ctx context.Context, id uuid.UUID) (*models.ScheduleSlot, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.ScheduleSlot), args.Error(1)
}

func (m *MockScheduleSlotRepository) Delete(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func (m *MockScheduleSlotRepository) ListByWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]*models.ScheduleSlot, error) {
	args := m.Called(ctx, workspaceID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]*models.ScheduleSlot), args.Error(1)
}

func (m *MockScheduleSlotRepository) ListByWorkspaceAndPlatform(ctx context.Context, workspaceID uuid.UUID, platform string) ([]*models.ScheduleSlot, error) {
	args := m.Called(ctx, workspaceID, platform)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]*models.ScheduleSlot), args.Error(1)
}

// ─── MockAPIKeyRepository ─────────────────────────────────────────────────────

// MockAPIKeyRepository is a testify/mock implementation of repository.APIKeyRepository.
type MockAPIKeyRepository struct {
	mock.Mock
}

func (m *MockAPIKeyRepository) Create(ctx context.Context, key *models.ApiKey) error {
	args := m.Called(ctx, key)
	return args.Error(0)
}

func (m *MockAPIKeyRepository) GetByHash(ctx context.Context, keyHash string) (*models.ApiKey, error) {
	args := m.Called(ctx, keyHash)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.ApiKey), args.Error(1)
}

func (m *MockAPIKeyRepository) GetByID(ctx context.Context, id uuid.UUID) (*models.ApiKey, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.ApiKey), args.Error(1)
}

func (m *MockAPIKeyRepository) ListByWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]*models.ApiKey, error) {
	args := m.Called(ctx, workspaceID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]*models.ApiKey), args.Error(1)
}

func (m *MockAPIKeyRepository) Delete(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func (m *MockAPIKeyRepository) UpdateLastUsed(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

// ─── MockAIJobRepository ──────────────────────────────────────────────────────

// MockAIJobRepository is a testify/mock implementation of repository.AIJobRepository.
type MockAIJobRepository struct {
	mock.Mock
}

func (m *MockAIJobRepository) Create(ctx context.Context, job *models.AIJob) error {
	args := m.Called(ctx, job)
	return args.Error(0)
}

func (m *MockAIJobRepository) GetByID(ctx context.Context, id uuid.UUID) (*models.AIJob, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.AIJob), args.Error(1)
}

func (m *MockAIJobRepository) Update(ctx context.Context, job *models.AIJob) error {
	args := m.Called(ctx, job)
	return args.Error(0)
}

func (m *MockAIJobRepository) ListByWorkspace(ctx context.Context, workspaceID uuid.UUID, limit int) ([]*models.AIJob, error) {
	args := m.Called(ctx, workspaceID, limit)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]*models.AIJob), args.Error(1)
}

func (m *MockAIJobRepository) SumCreditsByWorkspaceThisMonth(ctx context.Context, workspaceID uuid.UUID) (int, error) {
	args := m.Called(ctx, workspaceID)
	return args.Int(0), args.Error(1)
}

// ─── MockAuditLogRepository ───────────────────────────────────────────────────

// MockAuditLogRepository is a testify/mock implementation of repository.AuditLogRepository.
type MockAuditLogRepository struct {
	mock.Mock
}

func (m *MockAuditLogRepository) Create(ctx context.Context, log *models.AuditLog) error {
	args := m.Called(ctx, log)
	return args.Error(0)
}

func (m *MockAuditLogRepository) ListByWorkspace(ctx context.Context, workspaceID uuid.UUID, limit, offset int) ([]*models.AuditLog, error) {
	args := m.Called(ctx, workspaceID, limit, offset)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]*models.AuditLog), args.Error(1)
}

func (m *MockAuditLogRepository) DeleteOlderThan(ctx context.Context, before time.Time) error {
	args := m.Called(ctx, before)
	return args.Error(0)
}

// ─── MockAnalyticsRepository ──────────────────────────────────────────────────

// MockAnalyticsRepository is a testify/mock implementation of repository.AnalyticsRepository.
type MockAnalyticsRepository struct {
	mock.Mock
}

func (m *MockAnalyticsRepository) GetPostCountByDay(ctx context.Context, workspaceID uuid.UUID, from, to time.Time) ([]repository.DayCount, error) {
	args := m.Called(ctx, workspaceID, from, to)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]repository.DayCount), args.Error(1)
}

func (m *MockAnalyticsRepository) GetEngagementByPlatform(ctx context.Context, workspaceID uuid.UUID, from, to time.Time) ([]repository.PlatformEngagement, error) {
	args := m.Called(ctx, workspaceID, from, to)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]repository.PlatformEngagement), args.Error(1)
}

func (m *MockAnalyticsRepository) GetContentTypeBreakdown(ctx context.Context, workspaceID uuid.UUID, from, to time.Time) ([]repository.ContentTypeCount, error) {
	args := m.Called(ctx, workspaceID, from, to)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]repository.ContentTypeCount), args.Error(1)
}

func (m *MockAnalyticsRepository) GetTopPosts(ctx context.Context, workspaceID uuid.UUID, from, to time.Time, limit int) ([]*models.Post, error) {
	args := m.Called(ctx, workspaceID, from, to, limit)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]*models.Post), args.Error(1)
}

func (m *MockAnalyticsRepository) GetPostsThisMonth(ctx context.Context, workspaceID uuid.UUID) (int64, error) {
	args := m.Called(ctx, workspaceID)
	return args.Get(0).(int64), args.Error(1)
}
