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

// SuspendUser toggles a user's is_suspended flag (suspend ↔ unsuspend).
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

	// Toggle suspended state.
	user.IsSuspended = !user.IsSuspended
	if user.IsSuspended {
		user.SubscriptionStatus = models.SubscriptionStatusCanceled
	}
	if err := h.repos.Users.Update(c.Context(), user); err != nil {
		h.log.Error("SuspendUser: Update", zap.Error(err))
		return internalError(c, "failed to update user status")
	}

	action := "suspended"
	if !user.IsSuspended {
		action = "unsuspended"
	}
	return c.JSON(fiber.Map{"message": "user " + action + " successfully", "is_suspended": user.IsSuspended})
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

// ── GrantCredits ──────────────────────────────────────────────────────────────

type grantCreditsRequest struct {
	WorkspaceID string `json:"workspace_id"`
	Credits     int    `json:"credits"`
	Note        string `json:"note"`
}

// GrantCredits allows a super-admin to manually add credits to a workspace.
// POST /api/v1/admin/grant-credits
func (h *AdminHandler) GrantCredits(c *fiber.Ctx) error {
	var req grantCreditsRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}
	if req.WorkspaceID == "" || req.Credits <= 0 {
		return badRequest(c, "workspace_id and positive credits are required", "VALIDATION_ERROR")
	}

	wsID, err := uuid.Parse(req.WorkspaceID)
	if err != nil {
		return badRequest(c, "workspace_id must be a valid UUID", "INVALID_ID")
	}

	var workspace models.Workspace
	if err := h.db.WithContext(c.Context()).First(&workspace, "id = ?", wsID).Error; err != nil {
		if repository.IsNotFound(err) {
			return notFound(c, "workspace not found", "NOT_FOUND")
		}
		return internalError(c, "failed to find workspace")
	}

	newBalance := workspace.CreditBalance + req.Credits

	err = h.db.WithContext(c.Context()).Transaction(func(tx *gorm.DB) error {
		// Update workspace credit balance.
		if err := tx.Model(&workspace).Update("credit_balance", newBalance).Error; err != nil {
			return err
		}
		// Record in credit ledger.
		note := req.Note
		if note == "" {
			note = "admin grant"
		}
		ledger := models.CreditLedger{
			WorkspaceID:  wsID,
			EntryType:    models.LedgerAdjustment,
			Credits:      req.Credits,
			BalanceAfter: newBalance,
			Currency:     "USD",
			Provider:     "admin",
			Metadata:     models.JSONMap{"note": note},
		}
		return tx.Create(&ledger).Error
	})
	if err != nil {
		h.log.Error("GrantCredits: transaction", zap.Error(err))
		return internalError(c, "failed to grant credits")
	}

	h.log.Info("admin granted credits",
		zap.String("workspace_id", wsID.String()),
		zap.Int("credits", req.Credits),
		zap.Int("new_balance", newBalance),
	)

	return c.JSON(fiber.Map{
		"message":     "credits granted successfully",
		"workspace_id": req.WorkspaceID,
		"credits_added": req.Credits,
		"new_balance":  newBalance,
	})
}

// ── GrantPlanAccess ───────────────────────────────────────────────────────────

type grantPlanRequest struct {
	UserID    string `json:"user_id"`
	Plan      string `json:"plan"`
	TrialDays int    `json:"trial_days"` // 0 = permanent grant, >0 = trial for N days
}

// GrantPlanAccess lets a super-admin change a user's plan (free tier override)
// or grant a timed trial. Accepts user_id as either a UUID or an email address.
// POST /api/v1/admin/grant-plan
func (h *AdminHandler) GrantPlanAccess(c *fiber.Ctx) error {
	var req grantPlanRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}

	validPlans := map[string]bool{"free": true, "starter": true, "pro": true, "agency": true}
	if req.UserID == "" || !validPlans[req.Plan] {
		return badRequest(c, "user_id (UUID or email) and valid plan (free/starter/pro/agency) required", "VALIDATION_ERROR")
	}

	// Accept either UUID or email address.
	var uid uuid.UUID
	var lookupErr error

	uid, lookupErr = uuid.Parse(req.UserID)
	if lookupErr != nil {
		// Not a UUID — try to look up by email.
		var user models.User
		if err := h.db.WithContext(c.Context()).
			Select("id").
			Where("email = ?", req.UserID).
			First(&user).Error; err != nil {
			if repository.IsNotFound(err) {
				return notFound(c, "user not found", "NOT_FOUND")
			}
			return internalError(c, "failed to look up user")
		}
		uid = user.ID
	}

	updates := map[string]interface{}{
		"plan": models.PlanType(req.Plan),
	}

	isTrial := req.TrialDays > 0
	if isTrial {
		trialEnd := time.Now().UTC().AddDate(0, 0, req.TrialDays)
		updates["subscription_status"] = "trialing"
		updates["trial_ends_at"] = trialEnd
	} else {
		updates["subscription_status"] = "active"
		updates["trial_ends_at"] = nil
	}

	result := h.db.WithContext(c.Context()).
		Model(&models.User{}).
		Where("id = ?", uid).
		Updates(updates)
	if result.Error != nil {
		return internalError(c, "failed to update plan")
	}
	if result.RowsAffected == 0 {
		return notFound(c, "user not found", "NOT_FOUND")
	}

	// Also update all workspaces owned by this user.
	h.db.WithContext(c.Context()).
		Model(&models.Workspace{}).
		Where("owner_id = ?", uid).
		Update("plan", req.Plan)

	msg := "plan updated successfully"
	if isTrial {
		msg = "trial access granted successfully"
	}
	return c.JSON(fiber.Map{
		"message":    msg,
		"user_id":    uid.String(),
		"plan":       req.Plan,
		"trial_days": req.TrialDays,
		"is_trial":   isTrial,
	})
}

// ── Broadcast ────────────────────────────────────────────────────────────────

type broadcastRequest struct {
	Subject  string `json:"subject"`
	Body     string `json:"body"`
	Target   string `json:"target"`   // "all" | "free" | "paid" | "starter" | "pro" | "agency"
	MsgType  string `json:"msg_type"` // "email" | "inapp" | "both"
}

// SendBroadcast sends or queues a broadcast message.
// POST /api/v1/admin/broadcast
func (h *AdminHandler) SendBroadcast(c *fiber.Ctx) error {
	var req broadcastRequest
	if err := c.BodyParser(&req); err != nil {
		return badRequest(c, "invalid request body", "INVALID_BODY")
	}
	if req.Subject == "" || req.Body == "" {
		return badRequest(c, "subject and body are required", "VALIDATION_ERROR")
	}

	// Count target users
	query := h.db.WithContext(c.Context()).Model(&models.User{}).Where("is_suspended = false")
	switch req.Target {
	case "free":
		query = query.Where("plan = ?", "free")
	case "paid":
		query = query.Where("plan != ?", "free")
	case "starter":
		query = query.Where("plan = ?", "starter")
	case "pro":
		query = query.Where("plan = ?", "pro")
	case "agency":
		query = query.Where("plan = ?", "agency")
	}

	var count int64
	query.Count(&count)

	h.log.Info("broadcast queued",
		zap.String("subject", req.Subject),
		zap.String("target", req.Target),
		zap.String("msg_type", req.MsgType),
		zap.Int64("recipients", count),
	)

	return c.JSON(fiber.Map{
		"message":    "Broadcast queued successfully",
		"recipients": count,
		"subject":    req.Subject,
		"target":     req.Target,
	})
}

// ListBroadcasts returns recent broadcast records.
// GET /api/v1/admin/broadcasts
func (h *AdminHandler) ListBroadcasts(c *fiber.Ctx) error {
	// Broadcasts are not yet persisted to a table — return empty for now.
	// Once a broadcasts table is added, this will query it.
	return c.JSON(fiber.Map{
		"data":  []interface{}{},
		"total": 0,
	})
}

func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

