package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/models"
	"github.com/socialforge/backend/internal/repository"
)

// AdminHandler handles admin-only API endpoints.
type AdminHandler struct {
	db    *gorm.DB
	repos *repository.Container
	log   *zap.Logger
}

// NewAdminHandler creates a new AdminHandler.
func NewAdminHandler(db *gorm.DB, repos *repository.Container, log *zap.Logger) *AdminHandler {
	return &AdminHandler{db: db, repos: repos, log: log.Named("admin")}
}

// ── GetAdminStats ─────────────────────────────────────────────────────────────

// GetAdminStats returns platform-level aggregate statistics.
// GET /api/v1/admin/stats
func (h *AdminHandler) GetAdminStats(c *fiber.Ctx) error {
	ctx := c.Context()

	var totalUsers int64
	if err := h.db.WithContext(ctx).Model(&models.User{}).Count(&totalUsers).Error; err != nil {
		h.log.Error("GetAdminStats: count users", zap.Error(err))
		return internalError(c, "failed to load stats")
	}

	var totalWorkspaces int64
	if err := h.db.WithContext(ctx).Model(&models.Workspace{}).Count(&totalWorkspaces).Error; err != nil {
		h.log.Error("GetAdminStats: count workspaces", zap.Error(err))
		return internalError(c, "failed to load stats")
	}

	var activeSubscriptions int64
	if err := h.db.WithContext(ctx).Model(&models.User{}).
		Where("subscription_status = ?", "active").
		Count(&activeSubscriptions).Error; err != nil {
		h.log.Error("GetAdminStats: count active subscriptions", zap.Error(err))
		return internalError(c, "failed to load stats")
	}

	var totalSocialAccounts int64
	if err := h.db.WithContext(ctx).Model(&models.SocialAccount{}).Count(&totalSocialAccounts).Error; err != nil {
		h.log.Error("GetAdminStats: count social accounts", zap.Error(err))
		return internalError(c, "failed to load stats")
	}

	var totalPosts int64
	if err := h.db.WithContext(ctx).Model(&models.Post{}).Count(&totalPosts).Error; err != nil {
		h.log.Error("GetAdminStats: count posts", zap.Error(err))
		return internalError(c, "failed to load stats")
	}

	today := time.Now().UTC().Truncate(24 * time.Hour)

	var aiJobsToday int64
	if err := h.db.WithContext(ctx).Model(&models.AIJob{}).
		Where("created_at >= ?", today).
		Count(&aiJobsToday).Error; err != nil {
		h.log.Error("GetAdminStats: count ai jobs today", zap.Error(err))
		return internalError(c, "failed to load stats")
	}

	type creditSum struct {
		Total int64
	}
	var cs creditSum
	if err := h.db.WithContext(ctx).Model(&models.AIJob{}).
		Select("COALESCE(SUM(credits_used), 0) AS total").
		Where("created_at >= ?", today).
		Scan(&cs).Error; err != nil {
		h.log.Error("GetAdminStats: sum ai credits today", zap.Error(err))
		return internalError(c, "failed to load stats")
	}

	return c.JSON(fiber.Map{
		"total_users":           totalUsers,
		"total_workspaces":      totalWorkspaces,
		"active_subscriptions":  activeSubscriptions,
		"total_social_accounts": totalSocialAccounts,
		"total_posts":           totalPosts,
		"ai_jobs_today":         aiJobsToday,
		"ai_credits_today":      cs.Total,
	})
}

// ── ListAllUsers ──────────────────────────────────────────────────────────────

// ListAllUsers returns a paginated list of all users with optional filters.
// GET /api/v1/admin/users?page=1&limit=20&search=&plan=
func (h *AdminHandler) ListAllUsers(c *fiber.Ctx) error {
	page := max(1, c.QueryInt("page", 1))
	limit := clamp(c.QueryInt("limit", 20), 1, 100)
	search := c.Query("search")
	plan := c.Query("plan")

	offset := (page - 1) * limit

	baseQ := h.db.WithContext(c.Context()).Model(&models.User{})
	if search != "" {
		baseQ = baseQ.Where("name ILIKE ? OR email ILIKE ?", "%"+search+"%", "%"+search+"%")
	}
	if plan != "" {
		baseQ = baseQ.Where("plan = ?", plan)
	}

	var total int64
	if err := baseQ.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		h.log.Error("ListAllUsers: count", zap.Error(err))
		return internalError(c, "failed to list users")
	}

	var users []models.User
	if err := baseQ.Session(&gorm.Session{}).Offset(offset).Limit(limit).Order("created_at DESC").Find(&users).Error; err != nil {
		h.log.Error("ListAllUsers: find", zap.Error(err))
		return internalError(c, "failed to list users")
	}

	return c.JSON(fiber.Map{
		"users": users,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

// ── GetUser ───────────────────────────────────────────────────────────────────

// GetUser returns a single user's full profile with workspace and social account counts.
// GET /api/v1/admin/users/:id
func (h *AdminHandler) GetUser(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "id must be a valid UUID", "INVALID_ID")
	}

	user, err := h.repos.Users.GetByID(c.Context(), id)
	if err != nil {
		if repository.IsNotFound(err) {
			return notFound(c, "user not found", "NOT_FOUND")
		}
		h.log.Error("GetUser: GetByID", zap.Error(err))
		return internalError(c, "failed to get user")
	}

	var workspaceCount int64
	h.db.WithContext(c.Context()).Model(&models.Workspace{}).Where("owner_id = ?", id).Count(&workspaceCount)

	var socialAccountCount int64
	h.db.WithContext(c.Context()).
		Model(&models.SocialAccount{}).
		Joins("JOIN workspaces ON workspaces.id = social_accounts.workspace_id").
		Where("workspaces.owner_id = ?", id).
		Count(&socialAccountCount)

	return c.JSON(fiber.Map{
		"user":                 user,
		"workspace_count":      workspaceCount,
		"social_account_count": socialAccountCount,
	})
}

// ── SuspendUser ───────────────────────────────────────────────────────────────

// SuspendUser sets a user's subscription_status to 'canceled'.
// POST /api/v1/admin/users/:id/suspend
func (h *AdminHandler) SuspendUser(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return badRequest(c, "id must be a valid UUID", "INVALID_ID")
	}

	user, err := h.repos.Users.GetByID(c.Context(), id)
	if err != nil {
		if repository.IsNotFound(err) {
			return notFound(c, "user not found", "NOT_FOUND")
		}
		h.log.Error("SuspendUser: GetByID", zap.Error(err))
		return internalError(c, "failed to get user")
	}

	user.SubscriptionStatus = models.SubscriptionStatusCanceled
	if err := h.repos.Users.Update(c.Context(), user); err != nil {
		h.log.Error("SuspendUser: Update", zap.Error(err))
		return internalError(c, "failed to suspend user")
	}

	return c.JSON(fiber.Map{"message": "user suspended successfully"})
}

// ── ListAllWorkspaces ─────────────────────────────────────────────────────────

type workspaceAdminRow struct {
	models.Workspace
	MemberCount       int64 `json:"member_count"`
	SocialAccountCount int64 `json:"social_account_count"`
}

// ListAllWorkspaces returns a paginated list of all workspaces with counts.
// GET /api/v1/admin/workspaces?page=1&limit=20&search=
func (h *AdminHandler) ListAllWorkspaces(c *fiber.Ctx) error {
	page := max(1, c.QueryInt("page", 1))
	limit := clamp(c.QueryInt("limit", 20), 1, 100)
	search := c.Query("search")
	offset := (page - 1) * limit

	baseQ := h.db.WithContext(c.Context()).Model(&models.Workspace{})
	if search != "" {
		baseQ = baseQ.Where("name ILIKE ? OR slug ILIKE ?", "%"+search+"%", "%"+search+"%")
	}

	var total int64
	if err := baseQ.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		h.log.Error("ListAllWorkspaces: count", zap.Error(err))
		return internalError(c, "failed to list workspaces")
	}

	var workspaces []models.Workspace
	if err := baseQ.Session(&gorm.Session{}).Offset(offset).Limit(limit).Order("created_at DESC").Find(&workspaces).Error; err != nil {
		h.log.Error("ListAllWorkspaces: find", zap.Error(err))
		return internalError(c, "failed to list workspaces")
	}

	rows := make([]workspaceAdminRow, 0, len(workspaces))
	for _, ws := range workspaces {
		row := workspaceAdminRow{Workspace: ws}
		h.db.WithContext(c.Context()).Model(&models.WorkspaceMember{}).Where("workspace_id = ?", ws.ID).Count(&row.MemberCount)
		h.db.WithContext(c.Context()).Model(&models.SocialAccount{}).Where("workspace_id = ?", ws.ID).Count(&row.SocialAccountCount)
		rows = append(rows, row)
	}

	return c.JSON(fiber.Map{
		"workspaces": rows,
		"total":      total,
		"page":       page,
		"limit":      limit,
	})
}

// ── ListAllAIJobs ─────────────────────────────────────────────────────────────

type aiJobAdminRow struct {
	models.AIJob
	UserEmail string `json:"user_email"`
	UserName  string `json:"user_name"`
}

// ListAllAIJobs returns a paginated list of all AI jobs with user info.
// GET /api/v1/admin/ai-jobs?page=1&limit=20&status=&job_type=
func (h *AdminHandler) ListAllAIJobs(c *fiber.Ctx) error {
	page := max(1, c.QueryInt("page", 1))
	limit := clamp(c.QueryInt("limit", 20), 1, 100)
	status := c.Query("status")
	jobType := c.Query("job_type")
	offset := (page - 1) * limit

	baseQ := h.db.WithContext(c.Context()).Model(&models.AIJob{})
	if status != "" {
		baseQ = baseQ.Where("status = ?", status)
	}
	if jobType != "" {
		baseQ = baseQ.Where("job_type = ?", jobType)
	}

	var total int64
	if err := baseQ.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		h.log.Error("ListAllAIJobs: count", zap.Error(err))
		return internalError(c, "failed to list AI jobs")
	}

	type jobWithUser struct {
		models.AIJob
		UserEmail string `gorm:"column:user_email"`
		UserName  string `gorm:"column:user_name"`
	}

	q2 := h.db.WithContext(c.Context()).
		Table("ai_jobs").
		Select("ai_jobs.*, users.email AS user_email, users.name AS user_name").
		Joins("LEFT JOIN users ON users.id = ai_jobs.requested_by_id")
	if status != "" {
		q2 = q2.Where("ai_jobs.status = ?", status)
	}
	if jobType != "" {
		q2 = q2.Where("ai_jobs.job_type = ?", jobType)
	}

	var results []jobWithUser
	if err := q2.Order("ai_jobs.created_at DESC").Offset(offset).Limit(limit).Scan(&results).Error; err != nil {
		h.log.Error("ListAllAIJobs: query", zap.Error(err))
		return internalError(c, "failed to list AI jobs")
	}

	rows := make([]aiJobAdminRow, 0, len(results))
	for _, r := range results {
		rows = append(rows, aiJobAdminRow{
			AIJob:     r.AIJob,
			UserEmail: r.UserEmail,
			UserName:  r.UserName,
		})
	}

	return c.JSON(fiber.Map{
		"jobs":  rows,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

// ── ListAuditLogs ─────────────────────────────────────────────────────────────

// ListAuditLogs returns a paginated list of audit log entries.
// GET /api/v1/admin/audit-logs?page=1&limit=50&action=&user_id=
func (h *AdminHandler) ListAuditLogs(c *fiber.Ctx) error {
	page := max(1, c.QueryInt("page", 1))
	limit := clamp(c.QueryInt("limit", 50), 1, 200)
	action := c.Query("action")
	userIDStr := c.Query("user_id")
	offset := (page - 1) * limit

	baseQ := h.db.WithContext(c.Context()).Model(&models.AuditLog{})
	if action != "" {
		baseQ = baseQ.Where("action = ?", action)
	}
	if userIDStr != "" {
		uid, err := uuid.Parse(userIDStr)
		if err != nil {
			return badRequest(c, "user_id must be a valid UUID", "INVALID_ID")
		}
		baseQ = baseQ.Where("user_id = ?", uid)
	}

	var total int64
	if err := baseQ.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		h.log.Error("ListAuditLogs: count", zap.Error(err))
		return internalError(c, "failed to list audit logs")
	}

	var logs []models.AuditLog
	if err := baseQ.Session(&gorm.Session{}).Order("created_at DESC").Offset(offset).Limit(limit).Find(&logs).Error; err != nil {
		h.log.Error("ListAuditLogs: find", zap.Error(err))
		return internalError(c, "failed to list audit logs")
	}

	return c.JSON(fiber.Map{
		"logs":  logs,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

// ── GetRevenueStats ───────────────────────────────────────────────────────────

type planRevenue struct {
	Plan      string `json:"plan"`
	UserCount int64  `json:"user_count"`
	UnitPrice int    `json:"unit_price_usd"`
	MRR       int64  `json:"mrr_usd"`
}

// planPrice returns the monthly price in USD for a given plan.
func planPrice(plan string) int {
	switch plan {
	case "starter":
		return 29
	case "pro":
		return 79
	case "agency":
		return 199
	default:
		return 0
	}
}

// GetRevenueStats returns MRR breakdown by plan.
// GET /api/v1/admin/revenue
func (h *AdminHandler) GetRevenueStats(c *fiber.Ctx) error {
	type planCount struct {
		Plan  string
		Count int64
	}

	var planCounts []planCount
	if err := h.db.WithContext(c.Context()).
		Model(&models.User{}).
		Select("plan, COUNT(*) AS count").
		Where("subscription_status = ?", "active").
		Group("plan").
		Scan(&planCounts).Error; err != nil {
		h.log.Error("GetRevenueStats: query", zap.Error(err))
		return internalError(c, "failed to load revenue stats")
	}

	var totalMRR int64
	breakdown := make([]planRevenue, 0, len(planCounts))
	for _, pc := range planCounts {
		price := planPrice(pc.Plan)
		mrr := pc.Count * int64(price)
		totalMRR += mrr
		breakdown = append(breakdown, planRevenue{
			Plan:      pc.Plan,
			UserCount: pc.Count,
			UnitPrice: price,
			MRR:       mrr,
		})
	}

	return c.JSON(fiber.Map{
		"breakdown": breakdown,
		"total_mrr": totalMRR,
	})
}

// ── helpers ───────────────────────────────────────────────────────────────────

func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

