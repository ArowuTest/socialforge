// Package api wires together Fiber routes, middleware, and handler dependencies.
package api

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/api/handlers"
	"github.com/socialforge/backend/internal/api/middleware"
	"github.com/socialforge/backend/internal/config"
	"github.com/socialforge/backend/internal/models"
	"github.com/socialforge/backend/internal/repository"
	ai "github.com/socialforge/backend/internal/services/ai"
	analyticssvc "github.com/socialforge/backend/internal/services/analytics"
	authsvc "github.com/socialforge/backend/internal/services/auth"
	billingsvc "github.com/socialforge/backend/internal/services/billing"
	"github.com/socialforge/backend/internal/services/notifications"
	scheduling "github.com/socialforge/backend/internal/services/scheduling"
)

// Deps bundles all application-level dependencies passed to route handlers.
type Deps struct {
	DB               *gorm.DB
	RDB              *redis.Client
	Config           *config.Config
	Log              *zap.Logger
	AuthService      *authsvc.Service
	AIService        *ai.Service
	AnalyticsService *analyticssvc.Service
	BillingService       *billingsvc.Service
	ScheduleService      *scheduling.Service
	NotificationsService *notifications.Service
	AsynqClient          *asynq.Client
	PlatformClients  map[string]handlers.PlatformOAuthClient
}

// SetupRoutes registers all API routes on the provided Fiber app.
func SetupRoutes(app *fiber.App, deps Deps) {
	// Build the repository container from the shared *gorm.DB.
	repos := repository.NewContainer(deps.DB)

	// Build middleware group.
	mw := middleware.New(deps.AuthService, deps.DB, deps.RDB, deps.Config, deps.Log)

	// Build handler groups, injecting repository interfaces instead of raw *gorm.DB.
	authH := handlers.NewAuthHandler(repos.Users, repos.Workspaces, repos.APIKeys, deps.AuthService, deps.NotificationsService, deps.Config, deps.Log)
	postsH := handlers.NewPostsHandler(repos.Posts, deps.ScheduleService, deps.AsynqClient, deps.Log)
	accountsH := handlers.NewAccountsHandler(deps.DB, deps.PlatformClients, deps.Config, deps.Log)
	scheduleH := handlers.NewScheduleHandler(deps.DB, deps.ScheduleService, deps.Log)
	aiH := handlers.NewAIHandler(deps.DB, deps.AIService, deps.AnalyticsService, deps.AsynqClient, deps.Log)
	billingH := handlers.NewBillingHandler(deps.BillingService, deps.Log, deps.RDB)
	analyticsH := handlers.NewAnalyticsHandler(deps.AnalyticsService, deps.Log)
	whitelabelH := handlers.NewWhitelabelHandler(deps.DB, deps.Config, deps.Log)
	adminH := handlers.NewAdminHandler(deps.DB, repos, deps.Log)
	mediaH := handlers.NewMediaHandler(deps.DB,
		deps.Config.Storage.Endpoint,
		deps.Config.Storage.Bucket,
		deps.Config.Storage.AccessKeyID,
		deps.Config.Storage.SecretAccessKey,
		deps.Log)
	repurposeH := handlers.NewRepurposeHandler(deps.AIService, deps.Log)
	costConfigH := handlers.NewCostConfigHandler(deps.DB, deps.Config.JWT.Secret, deps.Log)
	membersH := handlers.NewMembersHandler(deps.DB, deps.RDB, repos.Workspaces, repos.Users, deps.NotificationsService, deps.Config, deps.Log)
	workspaceH := handlers.NewWorkspaceHandler(repos.Workspaces, deps.Log)
	gdprH := handlers.NewGDPRHandler(deps.DB, deps.Log)

	// ── Health & root probe ──────────────────────────────────────────────────
	// GET /health — structured health check used by Render, k8s, etc.
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok", "service": "socialforge-api"})
	})
	// HEAD / GET / — respond 200 for infrastructure probes (Render, load
	// balancers, uptime monitors) that hit the root path before the
	// healthCheckPath setting has been applied or during cold-start.
	rootHandler := func(c *fiber.Ctx) error { return c.SendStatus(fiber.StatusOK) }
	app.Head("/", rootHandler)
	app.Get("/", rootHandler)

	v1 := app.Group("/api/v1")

	// ── Auth ─────────────────────────────────────────────────────────────────
	// Brute-force protection: 10 attempts per IP per minute on unauthenticated
	// credential endpoints. Fails open on Redis errors (see RateLimiter impl).
	authLimiter := mw.RateLimiter(middleware.RateLimiterConfig{
		Max:    10,
		Window: time.Minute,
	})
	auth := v1.Group("/auth")
	auth.Post("/register", authLimiter, authH.Register)
	auth.Post("/login", authLimiter, authH.Login)
	auth.Post("/refresh", authLimiter, authH.RefreshToken)
	auth.Post("/logout", authH.Logout)
	auth.Post("/password-reset/request", authLimiter, authH.RequestPasswordReset)
	auth.Post("/password-reset/confirm", authLimiter, authH.ConfirmPasswordReset)
	auth.Post("/accept-invite", mw.JWTAuth(), membersH.AcceptInvite)
	auth.Get("/me", mw.JWTAuth(), authH.GetCurrentUser)
	auth.Delete("/account", mw.JWTAuth(), gdprH.DeleteAccount)
	auth.Get("/account/export", mw.JWTAuth(), gdprH.ExportData)
	auth.Post("/api-keys", mw.JWTAuth(), authH.CreateAPIKey)
	auth.Get("/api-keys", mw.JWTAuth(), authH.ListAPIKeys)
	auth.Delete("/api-keys/:id", mw.JWTAuth(), authH.DeleteAPIKey)

	// ── OAuth ─────────────────────────────────────────────────────────────────
	oauth := v1.Group("/oauth")
	oauth.Get("/:platform/connect", mw.JWTAuth(), accountsH.InitiateOAuth)
	oauth.Get("/:platform/callback", accountsH.OAuthCallback)

	// ── Workspace-scoped routes ───────────────────────────────────────────────
	ws := v1.Group("/workspaces/:workspaceId", mw.JWTAuth(), mw.WorkspaceAuth())

	// Workspace CRUD
	ws.Get("", workspaceH.GetWorkspace)
	ws.Patch("", workspaceH.UpdateWorkspace)

	// Members
	ws.Get("/members", membersH.ListMembers)
	ws.Post("/members/invite", membersH.InviteMember)
	ws.Patch("/members/:memberId", membersH.UpdateMemberRole)
	ws.Delete("/members/:memberId", membersH.RemoveMember)

	// Social Accounts
	ws.Get("/accounts", accountsH.ListAccounts)
	ws.Delete("/accounts/:id", accountsH.DisconnectAccount)
	ws.Post("/accounts/:id/refresh", accountsH.RefreshAccount)

	// Posts
	ws.Get("/posts", postsH.ListPosts)
	ws.Post("/posts", postsH.CreatePost)
	ws.Get("/posts/:id", postsH.GetPost)
	ws.Patch("/posts/:id", postsH.UpdatePost)
	ws.Delete("/posts/:id", postsH.DeletePost)
	ws.Post("/posts/:id/publish", postsH.PublishNow)
	ws.Post("/posts/bulk", postsH.BulkCreatePosts)

	// Schedule
	ws.Get("/schedule/slots", scheduleH.ListSlots)
	ws.Post("/schedule/slots", scheduleH.CreateSlot)
	ws.Delete("/schedule/slots/:id", scheduleH.DeleteSlot)
	ws.Get("/schedule/next-slot", scheduleH.GetNextFreeSlot)
	ws.Get("/schedule/calendar", scheduleH.GetCalendar)

	// AI
	ws.Post("/ai/generate-caption", aiH.GenerateCaption)
	ws.Post("/ai/generate-image", aiH.GenerateImage)
	ws.Post("/ai/generate-video", aiH.GenerateVideo)
	// NOTE: /ai/repurpose was removed in favour of /repurpose (richer schema).
	ws.Post("/ai/hashtags", aiH.GenerateHashtags)
	ws.Get("/ai/jobs/:id", aiH.GetAIJobStatus)
	ws.Post("/ai/analyse", aiH.AnalyseViralPotential)

	// Analytics
	ws.Get("/analytics", analyticsH.GetDashboard)
	ws.Get("/analytics/top-posts", analyticsH.GetTopPosts)

	// Billing (workspace-scoped usage)
	ws.Get("/billing/usage", billingH.GetUsage)
	ws.Get("/billing/subscription", billingH.GetSubscription)

	// Media
	ws.Post("/media/presign", mediaH.GetPresignedUploadURL)
	ws.Get("/media", mediaH.ListMedia)
	ws.Delete("/media/:key", mediaH.DeleteMedia)

	// Repurpose
	ws.Post("/repurpose", repurposeH.RepurposeContent)

	// Whitelabel (member-readable, admin-writable)
	ws.Get("/whitelabel", whitelabelH.GetWhitelabelConfig)
	ws.Patch("/whitelabel", mw.RequireRole(models.WorkspaceRoleAdmin), whitelabelH.UpdateWhitelabelConfig)

	// Client management (admin only)
	wsAdmin := v1.Group("/workspaces/:workspaceId", mw.JWTAuth(), mw.WorkspaceAuth(), mw.RequireRole(models.WorkspaceRoleAdmin))
	wsAdmin.Get("/clients", whitelabelH.ListClients)
	wsAdmin.Post("/clients", whitelabelH.CreateClient)
	wsAdmin.Delete("/clients/:id", whitelabelH.RemoveClient)

	// ── Admin ─────────────────────────────────────────────────────────────────────
	// Double guard: valid JWT + is_super_admin flag. Any other user gets 403.
	admin := v1.Group("/admin", mw.JWTAuth(), mw.RequireSuperAdmin())
	admin.Get("/stats", adminH.GetAdminStats)
	admin.Get("/users", adminH.ListAllUsers)
	admin.Get("/users/:id", adminH.GetUser)
	admin.Post("/users/:id/suspend", adminH.SuspendUser)
	admin.Get("/workspaces", adminH.ListAllWorkspaces)
	admin.Get("/ai-jobs", adminH.ListAllAIJobs)
	admin.Get("/audit-logs", adminH.ListAuditLogs)
	admin.Get("/revenue", adminH.GetRevenueStats)
	admin.Post("/grant-credits", adminH.GrantCredits)
	admin.Post("/grant-plan", adminH.GrantPlanAccess)

	// Cost configuration (admin-only)
	admin.Get("/cost-config/ai-jobs",         costConfigH.GetAIJobCosts)
	admin.Patch("/cost-config/ai-jobs/:jobType", costConfigH.UpdateAIJobCost)
	admin.Put("/cost-config/ai-jobs",         costConfigH.BulkUpdateAIJobCosts)
	admin.Get("/cost-config/packages",        costConfigH.GetCreditPackages)
	admin.Patch("/cost-config/packages/:id",  costConfigH.UpdateCreditPackage)
	admin.Get("/cost-config/settings",        costConfigH.GetPlatformSettings)
	admin.Put("/cost-config/settings/:key",   costConfigH.UpdatePlatformSetting)
	admin.Get("/cost-config/integrations",    costConfigH.GetIntegrationStatus)

	// ── Billing ───────────────────────────────────────────────────────────────
	billing := v1.Group("/billing")
	billing.Get("/plans", billingH.GetPlans)
	billing.Post("/subscribe", mw.JWTAuth(), billingH.CreateSubscription)
	billing.Post("/portal", mw.JWTAuth(), billingH.CustomerPortal)
	billing.Post("/webhook", billingH.StripeWebhook)
	billing.Get("/usage", mw.JWTAuth(), billingH.GetUsage)
	billing.Get("/subscription", mw.JWTAuth(), billingH.GetSubscription)

	// Credit packages (public — no auth needed)
	billing.Get("/credits/packages", billingH.GetCreditPackages)
	billing.Post("/paystack/webhook", billingH.PaystackWebhook)

	// Workspace-scoped credit routes (authenticated via ws group)
	ws.Post("/billing/credits/topup", billingH.InitiateCreditTopUp)
	ws.Get("/billing/credits/balance", billingH.GetCreditBalance)
	ws.Get("/billing/credits/ledger", billingH.GetCreditLedger)
}
