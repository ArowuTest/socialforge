// Package main is the entry point for the SocialForge API server.
package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/fiber/v2/middleware/requestid"
	"github.com/hibiken/asynq"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"github.com/socialforge/backend/internal/api"
	"github.com/socialforge/backend/internal/api/handlers"
	"github.com/socialforge/backend/internal/config"
	"github.com/socialforge/backend/internal/database"
	"github.com/socialforge/backend/internal/queue"
	"github.com/socialforge/backend/internal/repository"
	"github.com/socialforge/backend/internal/services/ai"
	analyticssvc "github.com/socialforge/backend/internal/services/analytics"
	authsvc "github.com/socialforge/backend/internal/services/auth"
	billingsvc "github.com/socialforge/backend/internal/services/billing"
	"github.com/socialforge/backend/internal/services/publishing"
	"github.com/socialforge/backend/internal/services/scheduling"

	"github.com/socialforge/backend/internal/platforms/facebook"
	"github.com/socialforge/backend/internal/platforms/instagram"
	"github.com/socialforge/backend/internal/platforms/linkedin"
	"github.com/socialforge/backend/internal/platforms/pinterest"
	"github.com/socialforge/backend/internal/platforms/threads"
	"github.com/socialforge/backend/internal/platforms/tiktok"
	"github.com/socialforge/backend/internal/platforms/twitter"
	"github.com/socialforge/backend/internal/platforms/youtube"
)

func main() {
	// ── Logger ────────────────────────────────────────────────────────────────
	log := buildLogger()
	defer log.Sync() //nolint:errcheck

	// ── Config ────────────────────────────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		log.Fatal("failed to load config", zap.Error(err))
	}
	log.Info("config loaded", zap.String("env", cfg.Server.Environment))

	// ── Database ──────────────────────────────────────────────────────────────
	if err := database.Connect(cfg, log); err != nil {
		log.Fatal("failed to connect to postgres", zap.Error(err))
	}
	defer database.Close(log)

	db := database.GetDB()

	if err := database.Migrate(log); err != nil {
		log.Fatal("auto-migrate failed", zap.Error(err))
	}

	// ── Redis ─────────────────────────────────────────────────────────────────
	if err := database.ConnectRedis(cfg, log); err != nil {
		log.Fatal("failed to connect to redis", zap.Error(err))
	}
	defer database.CloseRedis(log)

	rdb := database.GetRedis()

	// ── Services ──────────────────────────────────────────────────────────────
	encryptionSecret := cfg.JWT.Secret // reuse JWT secret as encryption key

	repos := repository.NewContainer(db)

	authService := authsvc.New(db, rdb, cfg, log)
	aiService := ai.New(db, cfg.OpenAI.APIKey, cfg.FalAI.APIKey, log)
	scheduleService := scheduling.New(db, log)
	analyticsService := analyticssvc.NewService(repos.Analytics, log)
	billingService := billingsvc.NewService(cfg, repos, db, log)

	// ── Platform clients ──────────────────────────────────────────────────────
	igClient := instagram.New(cfg.OAuth.Instagram, encryptionSecret, db, log)
	ttClient := tiktok.New(cfg.OAuth.TikTok, encryptionSecret, db, log)
	ytClient := youtube.New(cfg.OAuth.YouTube, encryptionSecret, db, log)
	liClient := linkedin.New(cfg.OAuth.LinkedIn, encryptionSecret, db, log)
	twClient := twitter.New(cfg.OAuth.Twitter, encryptionSecret, db, rdb, log)
	fbClient := facebook.New(cfg.OAuth.Facebook, encryptionSecret, db, log)
	piClient := pinterest.New(cfg.OAuth.Pinterest, encryptionSecret, db, log)
	thClient := threads.New(cfg.OAuth.Threads, encryptionSecret, db, log)

	// ── Publishing service ────────────────────────────────────────────────────
	platformMap := map[string]publishing.PlatformClient{
		"instagram": igClient,
		"tiktok":    ttClient,
		"youtube":   ytClient,
		"linkedin":  liClient,
		"twitter":   twClient,
		"facebook":  fbClient,
		"pinterest": piClient,
		"threads":   thClient,
	}
	mediaService := publishing.NewMediaService(cfg, log)
	publishService := publishing.NewPublisher(db, platformMap, mediaService, log)

	// ── Asynq client ──────────────────────────────────────────────────────────
	redisOpt := asynq.RedisClientOpt{
		Addr:     rdb.Options().Addr,
		Password: rdb.Options().Password,
		DB:       rdb.Options().DB,
	}
	asynqClient := asynq.NewClient(redisOpt)
	defer asynqClient.Close()

	// ── Asynq server + worker deps ────────────────────────────────────────────
	workerDeps := queue.WorkerDeps{
		DB:             db,
		Logger:         log,
		Publisher:      publishService,
		AIService:      aiService,
		OAuthRefresher: publishService,
	}
	queueSrv, mux := queue.NewServer(rdb, workerDeps, queue.DefaultServerConfig())

	// Register scheduler meta-task handlers.
	schedulerWorker := queue.NewSchedulerWorker(rdb, db, log)
	schedulerWorker.RegisterHandlers(mux)

	// ── Asynq scheduler ───────────────────────────────────────────────────────
	scheduler, err := queue.NewScheduler(rdb, db, log)
	if err != nil {
		log.Fatal("failed to create scheduler", zap.Error(err))
	}

	go func() {
		log.Info("starting asynq scheduler")
		if err := scheduler.Start(); err != nil {
			log.Error("scheduler stopped with error", zap.Error(err))
		}
	}()

	// ── Asynq queue server ────────────────────────────────────────────────────
	go func() {
		log.Info("starting asynq queue server")
		if err := queueSrv.Run(mux); err != nil {
			log.Error("queue server stopped with error", zap.Error(err))
		}
	}()

	// ── Fiber app ─────────────────────────────────────────────────────────────
	app := fiber.New(fiber.Config{
		AppName:               "SocialForge API",
		ServerHeader:          "",
		DisableStartupMessage: cfg.IsProduction(),
		ErrorHandler:          globalErrorHandler(log),
		ReadTimeout:           30 * time.Second,
		WriteTimeout:          60 * time.Second,
		IdleTimeout:           120 * time.Second,
		BodyLimit:             50 * 1024 * 1024, // 50 MB
	})

	// ── Global middleware ─────────────────────────────────────────────────────
	app.Use(requestid.New())

	app.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.App.FrontendURL,
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization, X-API-Key, X-Request-ID",
		AllowMethods:     "GET, POST, PUT, PATCH, DELETE, OPTIONS",
		AllowCredentials: true,
		MaxAge:           86400,
	}))

	app.Use(recover.New(recover.Config{
		EnableStackTrace: !cfg.IsProduction(),
	}))

	app.Use(fiberZapLogger(log))

	// ── Routes ────────────────────────────────────────────────────────────────
	deps := api.Deps{
		DB:               db,
		RDB:              rdb,
		Config:           cfg,
		Log:              log,
		AuthService:      authService,
		AIService:        aiService,
		AnalyticsService: analyticsService,
		BillingService:   billingService,
		ScheduleService:  scheduleService,
		AsynqClient:      asynqClient,
		PlatformClients: map[string]handlers.PlatformOAuthClient{
			"instagram": igClient,
			"tiktok":    ttClient,
			"youtube":   ytClient,
			"linkedin":  liClient,
			"twitter":   twClient,
			"facebook":  fbClient,
			"pinterest": piClient,
			"threads":   thClient,
		},
	}
	api.SetupRoutes(app, deps)

	// ── Graceful shutdown ─────────────────────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)

	go func() {
		addr := fmt.Sprintf(":%s", cfg.Server.Port)
		log.Info("starting HTTP server", zap.String("addr", addr))
		if err := app.Listen(addr); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal("HTTP server error", zap.Error(err))
		}
	}()

	sig := <-quit
	log.Info("received shutdown signal", zap.String("signal", sig.String()))

	// Give in-flight requests up to 30 seconds to complete.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := app.ShutdownWithContext(shutdownCtx); err != nil {
		log.Error("HTTP server shutdown error", zap.Error(err))
	}

	scheduler.Stop()
	queueSrv.Shutdown()

	log.Info("server exited cleanly")
}

// buildLogger constructs a production or development zap logger based on APP_ENV.
func buildLogger() *zap.Logger {
	env := os.Getenv("APP_ENV")
	var log *zap.Logger
	if env == "production" || env == "staging" {
		cfg := zap.NewProductionConfig()
		cfg.EncoderConfig.TimeKey = "ts"
		cfg.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
		log, _ = cfg.Build()
	} else {
		log, _ = zap.NewDevelopment()
	}
	if log == nil {
		log = zap.NewNop()
	}
	return log
}

// fiberZapLogger returns a Fiber middleware that logs each request with zap.
func fiberZapLogger(log *zap.Logger) fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()
		err := c.Next()
		latency := time.Since(start)

		status := c.Response().StatusCode()
		level := zap.InfoLevel
		if status >= 500 {
			level = zap.ErrorLevel
		} else if status >= 400 {
			level = zap.WarnLevel
		}

		log.Log(level, "http request",
			zap.String("method", c.Method()),
			zap.String("path", c.Path()),
			zap.Int("status", status),
			zap.Duration("latency", latency),
			zap.String("ip", c.IP()),
			zap.String("request_id", c.GetRespHeader("X-Request-ID")),
		)
		return err
	}
}

// globalErrorHandler is the Fiber application-level error handler.
func globalErrorHandler(log *zap.Logger) fiber.ErrorHandler {
	return func(c *fiber.Ctx, err error) error {
		code := fiber.StatusInternalServerError
		msg := "internal server error"

		var fe *fiber.Error
		if errors.As(err, &fe) {
			code = fe.Code
			msg = fe.Message
		}

		log.Error("unhandled error",
			zap.Error(err),
			zap.String("path", c.Path()),
			zap.String("method", c.Method()),
		)

		return c.Status(code).JSON(fiber.Map{
			"error": msg,
			"code":  "INTERNAL_ERROR",
		})
	}
}
