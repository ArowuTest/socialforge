// Package api wires together Fiber routes, middleware, and handler dependencies.
package api

import (
	"context"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
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
	scheduling "github.com/socialforge/backend/internal/services/scheduling"
)

// PlatformOAuthClient is the interface every platform adapter must satisfy for
// OAuth initiation and callback handling.
type PlatformOAuthClient interface {
	GetAuthURL(workspaceID uuid.UUID, state string) string
	ExchangeCode(ctx context.Context, code, state string, workspaceID uuid.UUID) (*models.SocialAccount, error)
}

// Deps bundles all application-level dependencies passed to route handlers.
type Deps struct {
	DB               *gorm.DB
	RDB              *redis.Client
	Config           *config.Config
	Log              *zap.Logger
	AuthService      *authsvc.Service
	AIService        *ai.Service
	AnalyticsService *analyticssvc.Service
	BillingService   *billingsvc.Service
	ScheduleService  *scheduling.Service
	AsynqClient      *asynq.Client
	PlatformClients  map[string]PlatformOAuthClient
}

// SetupRoutes registers all API routes on the provided Fiber app.
func SetupRoutes(app *fiber.App, deps Deps) {
	// Build the repository container from the shared *gorm.DB.
	repos := repository.NewContainer(deps.DB)

	// Build middleware group.
	mw := middleware.New(deps.AuthService, deps.DB, deps.RDB, deps.Config, deps.Log)

	// Build handler groups, injecting repository interfaces instead of raw *gorm.DB.
	authH := handlers.NewAuthHandler(repos.Users, repos.Workspaces, repos.APIKeys, deps.AuthService, deps.Log)
	postsH := handlers.NewPostsHandler(repos.Posts, deps.ScheduleService, deps.AsynqClient, deps.Log)
	accountsH := handlers.NewAccountsHandler(deps.DB, deps.PlatformClients, deps.Config, deps.Log)
	scheduleH := handlers.NewScheduleHandler(deps.DB, deps.ScheduleService, deps.Log)
	aiH := handlers.NewAIHandler(deps.DB, deps.AIService, deps.AnalyticsService, deps.AsynqClient, deps.Log)
	billingH := handlers.NewBillingHandler(deps.BillingService, deps.Log)
	analyticsH := handlers.NewAnalyticsHandler(deps.AnalyticsService, deps.Log)
	whitelabelH := handlers.NewWhitelabelHandler(deps.DB, deps.Config, deps.Log)

	// ── Health ──────────────────────────────────────────────────────────────
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	v1 := app.Group("/api/v1")

	// ── Auth ─────────────────────────────────────────────────────────────────
	auth := v1.Group("/auth")
	auth.Post("/register", authH.Register)
	auth.Post("/login", authH.Login)
	auth.Post("/refresh", authH.RefreshToken)
	auth.Post("/logout", authH.Logout)
	auth.Get("/me", mw.JWTAuth(), authH.GetCurrentUser)
	auth.Post("/api-keys", mw.JWTAuth(), authH.CreateAPIKey)
	auth.Get("/api-keys", mw.JWTAuth(), authH.ListAPIKeys)
	auth.Delete("/api-keys/:id", mw.JWTAuth(), authH.DeleteAPIKey)

	// ── OAuth ─────────────────────────────────────────────────────────────────
	oauth := v1.Group("/oauth")
	oauth.Get("/:platform/connect", mw.JWTAuth(), accountsH.InitiateOAuth)
	oauth.Get("/:platform/callback", accountsH.OAuthCallback)

	// ── Workspace-scoped routes ───────────────────────────────────────────────
	ws := v1.Group("/workspaces/:wid", mw.JWTAuth(), mw.WorkspaceAuth())

	// Social Accounts
	ws.Get("/accounts", accountsH.ListAccounts)
	ws.Delete("/accounts/:id", accountsH.DisconnectAccount)

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
	ws.Post("/ai/repurpose", aiH.RepurposeContent)
	ws.Get("/ai/jobs/:id", aiH.GetAIJobStatus)
	ws.Post("/ai/analyse", aiH.AnalyseViralPotential)

	// Analytics
	ws.Get("/analytics", analyticsH.GetDashboard)

	// Billing (workspace-scoped usage)
	ws.Get("/billing/usage", billingH.GetUsage)

	// Whitelabel (member-readable, admin-writable)
	ws.Get("/whitelabel", whitelabelH.GetWhitelabelConfig)
	ws.Patch("/whitelabel", mw.RequireRole(models.WorkspaceRoleAdmin), whitelabelH.UpdateWhitelabelConfig)

	// Client management (admin only)
	wsAdmin := v1.Group("/workspaces/:wid", mw.JWTAuth(), mw.WorkspaceAuth(), mw.RequireRole(models.WorkspaceRoleAdmin))
	wsAdmin.Get("/clients", whitelabelH.ListClients)
	wsAdmin.Post("/clients", whitelabelH.CreateClient)
	wsAdmin.Delete("/clients/:id", whitelabelH.RemoveClient)

	// ── Billing ───────────────────────────────────────────────────────────────
	billing := v1.Group("/billing")
	billing.Get("/plans", billingH.GetPlans)
	billing.Post("/subscribe", mw.JWTAuth(), billingH.CreateSubscription)
	billing.Post("/portal", mw.JWTAuth(), billingH.CustomerPortal)
	billing.Post("/webhook", billingH.StripeWebhook)
	billing.Get("/usage", mw.JWTAuth(), billingH.GetUsage)
}
