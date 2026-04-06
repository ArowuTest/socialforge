// Package analytics_test contains unit tests for the analytics service.
// All repository calls are replaced with testify/mock implementations so
// no database is required.
package analytics_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/socialforge/backend/internal/models"
	"github.com/socialforge/backend/internal/repository"
	"github.com/socialforge/backend/internal/repository/mocks"
	"github.com/socialforge/backend/internal/services/analytics"
)

// ─── helpers ──────────────────────────────────────────────────────────────────

// newService constructs an analytics.Service backed by the supplied mock repo.
func newService(repo repository.AnalyticsRepository) *analytics.Service {
	return analytics.NewService(repo, zap.NewNop())
}

// approxEqual asserts that got is within tolerance of want.
func approxEqual(t *testing.T, want, got time.Time, tolerance time.Duration, label string) {
	t.Helper()
	diff := got.Sub(want)
	if diff < 0 {
		diff = -diff
	}
	assert.LessOrEqualf(t, diff, tolerance,
		"%s: expected %v ≈ %v (within %v), got diff %v", label, got, want, tolerance, diff)
}

// ─── GetDateRange tests ───────────────────────────────────────────────────────

func TestGetDateRange_7d(t *testing.T) {
	svc := newService(&mocks.MockAnalyticsRepository{})
	from, to := svc.GetDateRange("7d")

	now := time.Now().UTC()
	approxEqual(t, now, to, time.Second, "to")
	approxEqual(t, now.AddDate(0, 0, -7), from, time.Second, "from")
	assert.True(t, to.After(from), "to must be after from")
}

func TestGetDateRange_30d(t *testing.T) {
	svc := newService(&mocks.MockAnalyticsRepository{})
	from, to := svc.GetDateRange("30d")

	now := time.Now().UTC()
	approxEqual(t, now, to, time.Second, "to")
	approxEqual(t, now.AddDate(0, 0, -30), from, time.Second, "from")
}

func TestGetDateRange_90d(t *testing.T) {
	svc := newService(&mocks.MockAnalyticsRepository{})
	from, to := svc.GetDateRange("90d")

	now := time.Now().UTC()
	approxEqual(t, now, to, time.Second, "to")
	approxEqual(t, now.AddDate(0, 0, -90), from, time.Second, "from")
}

func TestGetDateRange_Default(t *testing.T) {
	svc := newService(&mocks.MockAnalyticsRepository{})

	// Empty string should behave identically to "30d".
	from, to := svc.GetDateRange("")
	from30, to30 := svc.GetDateRange("30d")

	approxEqual(t, to30, to, time.Second, "to")
	approxEqual(t, from30, from, time.Second, "from")
}

func TestGetDateRange_Unknown(t *testing.T) {
	svc := newService(&mocks.MockAnalyticsRepository{})

	// Any unrecognised period should default to 30 days.
	from, to := svc.GetDateRange("999d")
	from30, to30 := svc.GetDateRange("30d")

	approxEqual(t, to30, to, time.Second, "to")
	approxEqual(t, from30, from, time.Second, "from")
}

// ─── GetDashboardStats tests ──────────────────────────────────────────────────

func TestGetDashboardStats_Success(t *testing.T) {
	repo := &mocks.MockAnalyticsRepository{}
	svc := newService(repo)

	wsID := uuid.New()
	now := time.Now().UTC()
	from := now.AddDate(0, 0, -30)
	to := now

	// Prepare canned test data for each repo method.
	dayCountData := []repository.DayCount{
		{Date: now.AddDate(0, 0, -2), Count: 3},
		{Date: now.AddDate(0, 0, -1), Count: 5},
	}
	engagementData := []repository.PlatformEngagement{
		{Platform: "instagram", Posts: 8, AvgEngagement: 0.75},
		{Platform: "twitter", Posts: 4, AvgEngagement: 0.50},
	}
	contentTypeData := []repository.ContentTypeCount{
		{PostType: "text", Count: 6},
		{PostType: "image", Count: 6},
	}
	topPostsData := []*models.Post{
		{WorkspaceID: wsID, Content: "Top post 1", Status: models.PostStatusPublished},
		{WorkspaceID: wsID, Content: "Top post 2", Status: models.PostStatusPublished},
	}
	var thisMonth int64 = 12

	repo.On("GetPostCountByDay", mock.Anything, wsID, mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time")).
		Return(dayCountData, nil)
	repo.On("GetEngagementByPlatform", mock.Anything, wsID, mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time")).
		Return(engagementData, nil)
	repo.On("GetContentTypeBreakdown", mock.Anything, wsID, mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time")).
		Return(contentTypeData, nil)
	repo.On("GetTopPosts", mock.Anything, wsID, mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time"), 10).
		Return(topPostsData, nil)
	repo.On("GetPostsThisMonth", mock.Anything, wsID).
		Return(thisMonth, nil)

	stats, err := svc.GetDashboardStats(context.Background(), wsID, from, to)
	require.NoError(t, err)
	require.NotNil(t, stats)

	// TotalPosts is the sum of daily counts: 3 + 5 = 8.
	assert.Equal(t, int64(8), stats.TotalPosts)

	// BestPlatform is instagram (8 posts > 4).
	assert.Equal(t, "instagram", stats.BestPlatform)

	// PostsByDay must be populated.
	assert.NotNil(t, stats.PostsByDay)
	assert.Len(t, stats.PostsByDay, 2)

	// EngagementByPlatform must be populated.
	assert.Len(t, stats.EngagementByPlatform, 2)

	// ContentTypeBreakdown must be populated.
	assert.Len(t, stats.ContentTypeBreakdown, 2)

	// TopPosts should be returned.
	assert.Len(t, stats.TopPosts, 2)

	// PostsThisMonth should match the mocked value.
	assert.Equal(t, int64(12), stats.PostsThisMonth)

	repo.AssertExpectations(t)
}

func TestGetDashboardStats_EmptyData(t *testing.T) {
	repo := &mocks.MockAnalyticsRepository{}
	svc := newService(repo)

	wsID := uuid.New()
	now := time.Now().UTC()
	from := now.AddDate(0, 0, -7)
	to := now

	repo.On("GetPostCountByDay", mock.Anything, wsID, mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time")).
		Return([]repository.DayCount{}, nil)
	repo.On("GetEngagementByPlatform", mock.Anything, wsID, mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time")).
		Return([]repository.PlatformEngagement{}, nil)
	repo.On("GetContentTypeBreakdown", mock.Anything, wsID, mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time")).
		Return([]repository.ContentTypeCount{}, nil)
	repo.On("GetTopPosts", mock.Anything, wsID, mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time"), 10).
		Return([]*models.Post{}, nil)
	repo.On("GetPostsThisMonth", mock.Anything, wsID).
		Return(int64(0), nil)

	stats, err := svc.GetDashboardStats(context.Background(), wsID, from, to)
	require.NoError(t, err)
	require.NotNil(t, stats)

	assert.Equal(t, int64(0), stats.TotalPosts)
	assert.Equal(t, "", stats.BestPlatform, "BestPlatform must be empty when no platform data exists")

	repo.AssertExpectations(t)
}

// ─── bestPlatform helper tests (tested indirectly via GetDashboardStats) ─────

func TestGetBestPlatform_HighestWins(t *testing.T) {
	repo := &mocks.MockAnalyticsRepository{}
	svc := newService(repo)

	wsID := uuid.New()
	now := time.Now().UTC()
	from := now.AddDate(0, 0, -30)
	to := now

	// instagram has more posts than tiktok.
	engagementData := []repository.PlatformEngagement{
		{Platform: "instagram", Posts: 100, AvgEngagement: 0.9},
		{Platform: "tiktok", Posts: 50, AvgEngagement: 0.8},
	}

	repo.On("GetPostCountByDay", mock.Anything, wsID, mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time")).
		Return([]repository.DayCount{{Date: now, Count: 150}}, nil)
	repo.On("GetEngagementByPlatform", mock.Anything, wsID, mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time")).
		Return(engagementData, nil)
	repo.On("GetContentTypeBreakdown", mock.Anything, wsID, mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time")).
		Return([]repository.ContentTypeCount{}, nil)
	repo.On("GetTopPosts", mock.Anything, wsID, mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time"), 10).
		Return([]*models.Post{}, nil)
	repo.On("GetPostsThisMonth", mock.Anything, wsID).
		Return(int64(150), nil)

	stats, err := svc.GetDashboardStats(context.Background(), wsID, from, to)
	require.NoError(t, err)
	assert.Equal(t, "instagram", stats.BestPlatform,
		"platform with highest post count must be selected as BestPlatform")

	repo.AssertExpectations(t)
}

func TestGetBestPlatform_Empty(t *testing.T) {
	repo := &mocks.MockAnalyticsRepository{}
	svc := newService(repo)

	wsID := uuid.New()
	now := time.Now().UTC()
	from := now.AddDate(0, 0, -30)
	to := now

	// No platform engagement data at all.
	repo.On("GetPostCountByDay", mock.Anything, wsID, mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time")).
		Return([]repository.DayCount{}, nil)
	repo.On("GetEngagementByPlatform", mock.Anything, wsID, mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time")).
		Return([]repository.PlatformEngagement{}, nil)
	repo.On("GetContentTypeBreakdown", mock.Anything, wsID, mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time")).
		Return([]repository.ContentTypeCount{}, nil)
	repo.On("GetTopPosts", mock.Anything, wsID, mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time"), 10).
		Return([]*models.Post{}, nil)
	repo.On("GetPostsThisMonth", mock.Anything, wsID).
		Return(int64(0), nil)

	stats, err := svc.GetDashboardStats(context.Background(), wsID, from, to)
	require.NoError(t, err)
	assert.Equal(t, "", stats.BestPlatform,
		"BestPlatform must be empty string when no platforms have data")

	repo.AssertExpectations(t)
}

func TestGetBestPlatform_SinglePlatform(t *testing.T) {
	repo := &mocks.MockAnalyticsRepository{}
	svc := newService(repo)

	wsID := uuid.New()
	now := time.Now().UTC()
	from := now.AddDate(0, 0, -7)
	to := now

	engagementData := []repository.PlatformEngagement{
		{Platform: "linkedin", Posts: 25, AvgEngagement: 0.6},
	}

	repo.On("GetPostCountByDay", mock.Anything, wsID, mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time")).
		Return([]repository.DayCount{{Date: now, Count: 25}}, nil)
	repo.On("GetEngagementByPlatform", mock.Anything, wsID, mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time")).
		Return(engagementData, nil)
	repo.On("GetContentTypeBreakdown", mock.Anything, wsID, mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time")).
		Return([]repository.ContentTypeCount{}, nil)
	repo.On("GetTopPosts", mock.Anything, wsID, mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time"), 10).
		Return([]*models.Post{}, nil)
	repo.On("GetPostsThisMonth", mock.Anything, wsID).
		Return(int64(25), nil)

	stats, err := svc.GetDashboardStats(context.Background(), wsID, from, to)
	require.NoError(t, err)
	assert.Equal(t, "linkedin", stats.BestPlatform,
		"single platform must always be the best platform")

	repo.AssertExpectations(t)
}
