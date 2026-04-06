package config

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

// Config holds all application configuration loaded from environment variables.
type Config struct {
	Server        ServerConfig
	Database      DatabaseConfig
	Redis         RedisConfig
	JWT           JWTConfig
	Stripe        StripeConfig
	OpenAI        OpenAIConfig
	FalAI         FalAIConfig
	OAuth         OAuthConfig
	App           AppConfig
	Storage       StorageConfig
	Notifications NotificationsConfig
}

// ServerConfig holds HTTP server settings.
type ServerConfig struct {
	Port        string
	Environment string // "development" | "production" | "staging"
}

// DatabaseConfig holds PostgreSQL connection settings.
type DatabaseConfig struct {
	DSN             string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
}

// RedisConfig holds Redis connection settings.
type RedisConfig struct {
	URL      string
	Password string
	DB       int
}

// JWTConfig holds JWT signing settings.
type JWTConfig struct {
	Secret              string
	AccessTokenExpiry   time.Duration
	RefreshTokenExpiry  time.Duration
}

// StripeConfig holds Stripe payment settings.
type StripeConfig struct {
	SecretKey     string
	WebhookSecret string
	Prices        StripePrices
}

// StripePrices holds Stripe price IDs for each plan.
type StripePrices struct {
	StarterMonthly string
	StarterYearly  string
	ProMonthly     string
	ProYearly      string
	AgencyMonthly  string
	AgencyYearly   string
}

// OpenAIConfig holds OpenAI API settings.
type OpenAIConfig struct {
	APIKey string
}

// FalAIConfig holds Fal.ai API settings.
type FalAIConfig struct {
	APIKey string
}

// OAuthConfig holds OAuth2 credentials for all social platforms.
type OAuthConfig struct {
	Instagram OAuthPlatformConfig
	Facebook  OAuthPlatformConfig
	TikTok    OAuthPlatformConfig
	YouTube   OAuthPlatformConfig
	Google    OAuthPlatformConfig
	LinkedIn  OAuthPlatformConfig
	Twitter   OAuthPlatformConfig
	Pinterest OAuthPlatformConfig
	Threads   OAuthPlatformConfig
}

// OAuthPlatformConfig holds a single platform's OAuth2 credentials.
type OAuthPlatformConfig struct {
	ClientID     string
	ClientSecret string
	RedirectURL  string
	Scopes       []string
}

// AppConfig holds general application settings.
type AppConfig struct {
	BaseURL     string
	FrontendURL string
}

// StorageConfig holds object storage (S3/R2) settings.
type StorageConfig struct {
	Endpoint        string
	Bucket          string
	Region          string
	AccessKeyID     string
	SecretAccessKey string
	PublicURL       string
}

// ResendConfig holds Resend email API settings.
type ResendConfig struct {
	APIKey    string
	FromEmail string
}

// NotificationsConfig holds notification / email settings.
type NotificationsConfig struct {
	Resend    ResendConfig
	AppName   string
	AppURL    string
}

// Load reads configuration from environment variables.
// It attempts to load a .env file first; missing .env is not an error in production.
func Load() (*Config, error) {
	// Best-effort .env load — ignored in production where env vars are injected directly.
	_ = godotenv.Load()

	cfg := &Config{}

	// ── Server ──────────────────────────────────────────────────────────────────
	cfg.Server.Port = getEnvOrDefault("PORT", "8080")
	cfg.Server.Environment = getEnvOrDefault("APP_ENV", "development")

	// ── Database ────────────────────────────────────────────────────────────────
	cfg.Database.DSN = requireEnv("DATABASE_URL")
	cfg.Database.MaxOpenConns = getEnvInt("DB_MAX_OPEN_CONNS", 25)
	cfg.Database.MaxIdleConns = getEnvInt("DB_MAX_IDLE_CONNS", 10)
	cfg.Database.ConnMaxLifetime = getEnvDuration("DB_CONN_MAX_LIFETIME", 5*time.Minute)

	// ── Redis ───────────────────────────────────────────────────────────────────
	cfg.Redis.URL = getEnvOrDefault("REDIS_URL", "redis://localhost:6379")
	cfg.Redis.Password = os.Getenv("REDIS_PASSWORD")
	cfg.Redis.DB = getEnvInt("REDIS_DB", 0)

	// ── JWT ─────────────────────────────────────────────────────────────────────
	cfg.JWT.Secret = requireEnv("JWT_SECRET")
	cfg.JWT.AccessTokenExpiry = getEnvDuration("JWT_ACCESS_EXPIRY", 15*time.Minute)
	cfg.JWT.RefreshTokenExpiry = getEnvDuration("JWT_REFRESH_EXPIRY", 30*24*time.Hour)

	// ── Stripe ──────────────────────────────────────────────────────────────────
	cfg.Stripe.SecretKey = requireEnv("STRIPE_SECRET_KEY")
	cfg.Stripe.WebhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET")
	cfg.Stripe.Prices.StarterMonthly = getEnvOrDefault("STRIPE_PRICE_STARTER_MONTHLY", "")
	cfg.Stripe.Prices.StarterYearly = getEnvOrDefault("STRIPE_PRICE_STARTER_YEARLY", "")
	cfg.Stripe.Prices.ProMonthly = getEnvOrDefault("STRIPE_PRICE_PRO_MONTHLY", "")
	cfg.Stripe.Prices.ProYearly = getEnvOrDefault("STRIPE_PRICE_PRO_YEARLY", "")
	cfg.Stripe.Prices.AgencyMonthly = getEnvOrDefault("STRIPE_PRICE_AGENCY_MONTHLY", "")
	cfg.Stripe.Prices.AgencyYearly = getEnvOrDefault("STRIPE_PRICE_AGENCY_YEARLY", "")

	// ── OpenAI ──────────────────────────────────────────────────────────────────
	cfg.OpenAI.APIKey = requireEnv("OPENAI_API_KEY")

	// ── Fal.ai ──────────────────────────────────────────────────────────────────
	cfg.FalAI.APIKey = requireEnv("FAL_API_KEY")

	// ── App ─────────────────────────────────────────────────────────────────────
	cfg.App.BaseURL = requireEnv("APP_BASE_URL")
	cfg.App.FrontendURL = getEnvOrDefault("APP_FRONTEND_URL", cfg.App.BaseURL)

	// ── Storage ─────────────────────────────────────────────────────────────────
	cfg.Storage.Endpoint = getEnvOrDefault("STORAGE_ENDPOINT", "")
	cfg.Storage.Bucket = requireEnv("STORAGE_BUCKET")
	cfg.Storage.Region = getEnvOrDefault("STORAGE_REGION", "auto")
	cfg.Storage.AccessKeyID = requireEnv("STORAGE_ACCESS_KEY_ID")
	cfg.Storage.SecretAccessKey = requireEnv("STORAGE_SECRET_ACCESS_KEY")
	cfg.Storage.PublicURL = getEnvOrDefault("STORAGE_PUBLIC_URL", "")

	// ── Notifications / Resend ──────────────────────────────────────────────────
	cfg.Notifications.Resend.APIKey = getEnvOrDefault("RESEND_API_KEY", "")
	cfg.Notifications.Resend.FromEmail = getEnvOrDefault("RESEND_FROM_EMAIL", "noreply@socialforge.io")
	cfg.Notifications.AppName = getEnvOrDefault("APP_NAME", "SocialForge")
	cfg.Notifications.AppURL = getEnvOrDefault("APP_FRONTEND_URL", cfg.App.BaseURL)

	// ── OAuth – Instagram / Facebook ────────────────────────────────────────────
	cfg.OAuth.Instagram = OAuthPlatformConfig{
		ClientID:     getEnvOrDefault("INSTAGRAM_CLIENT_ID", ""),
		ClientSecret: getEnvOrDefault("INSTAGRAM_CLIENT_SECRET", ""),
		RedirectURL:  getEnvOrDefault("INSTAGRAM_REDIRECT_URL", cfg.App.BaseURL+"/api/v1/oauth/instagram/callback"),
		Scopes:       splitEnvCSV("INSTAGRAM_SCOPES", "instagram_basic,instagram_content_publish,pages_read_engagement"),
	}
	cfg.OAuth.Facebook = OAuthPlatformConfig{
		ClientID:     getEnvOrDefault("FACEBOOK_CLIENT_ID", ""),
		ClientSecret: getEnvOrDefault("FACEBOOK_CLIENT_SECRET", ""),
		RedirectURL:  getEnvOrDefault("FACEBOOK_REDIRECT_URL", cfg.App.BaseURL+"/api/v1/oauth/facebook/callback"),
		Scopes:       splitEnvCSV("FACEBOOK_SCOPES", "pages_manage_posts,pages_read_engagement,publish_to_groups"),
	}

	// ── OAuth – TikTok ──────────────────────────────────────────────────────────
	cfg.OAuth.TikTok = OAuthPlatformConfig{
		ClientID:     getEnvOrDefault("TIKTOK_CLIENT_ID", ""),
		ClientSecret: getEnvOrDefault("TIKTOK_CLIENT_SECRET", ""),
		RedirectURL:  getEnvOrDefault("TIKTOK_REDIRECT_URL", cfg.App.BaseURL+"/api/v1/oauth/tiktok/callback"),
		Scopes:       splitEnvCSV("TIKTOK_SCOPES", "user.info.basic,video.upload,video.publish"),
	}

	// ── OAuth – YouTube / Google ─────────────────────────────────────────────────
	cfg.OAuth.YouTube = OAuthPlatformConfig{
		ClientID:     getEnvOrDefault("YOUTUBE_CLIENT_ID", ""),
		ClientSecret: getEnvOrDefault("YOUTUBE_CLIENT_SECRET", ""),
		RedirectURL:  getEnvOrDefault("YOUTUBE_REDIRECT_URL", cfg.App.BaseURL+"/api/v1/oauth/youtube/callback"),
		Scopes:       splitEnvCSV("YOUTUBE_SCOPES", "https://www.googleapis.com/auth/youtube.upload,https://www.googleapis.com/auth/youtube.readonly"),
	}
	cfg.OAuth.Google = OAuthPlatformConfig{
		ClientID:     getEnvOrDefault("GOOGLE_CLIENT_ID", getEnvOrDefault("YOUTUBE_CLIENT_ID", "")),
		ClientSecret: getEnvOrDefault("GOOGLE_CLIENT_SECRET", getEnvOrDefault("YOUTUBE_CLIENT_SECRET", "")),
		RedirectURL:  getEnvOrDefault("GOOGLE_REDIRECT_URL", cfg.App.BaseURL+"/api/v1/oauth/google/callback"),
		Scopes:       splitEnvCSV("GOOGLE_SCOPES", "openid,email,profile"),
	}

	// ── OAuth – LinkedIn ─────────────────────────────────────────────────────────
	cfg.OAuth.LinkedIn = OAuthPlatformConfig{
		ClientID:     getEnvOrDefault("LINKEDIN_CLIENT_ID", ""),
		ClientSecret: getEnvOrDefault("LINKEDIN_CLIENT_SECRET", ""),
		RedirectURL:  getEnvOrDefault("LINKEDIN_REDIRECT_URL", cfg.App.BaseURL+"/api/v1/oauth/linkedin/callback"),
		Scopes:       splitEnvCSV("LINKEDIN_SCOPES", "r_liteprofile,r_emailaddress,w_member_social"),
	}

	// ── OAuth – Twitter / X ──────────────────────────────────────────────────────
	cfg.OAuth.Twitter = OAuthPlatformConfig{
		ClientID:     getEnvOrDefault("TWITTER_CLIENT_ID", ""),
		ClientSecret: getEnvOrDefault("TWITTER_CLIENT_SECRET", ""),
		RedirectURL:  getEnvOrDefault("TWITTER_REDIRECT_URL", cfg.App.BaseURL+"/api/v1/oauth/twitter/callback"),
		Scopes:       splitEnvCSV("TWITTER_SCOPES", "tweet.read,tweet.write,users.read,offline.access"),
	}

	// ── OAuth – Pinterest ────────────────────────────────────────────────────────
	cfg.OAuth.Pinterest = OAuthPlatformConfig{
		ClientID:     getEnvOrDefault("PINTEREST_CLIENT_ID", ""),
		ClientSecret: getEnvOrDefault("PINTEREST_CLIENT_SECRET", ""),
		RedirectURL:  getEnvOrDefault("PINTEREST_REDIRECT_URL", cfg.App.BaseURL+"/api/v1/oauth/pinterest/callback"),
		Scopes:       splitEnvCSV("PINTEREST_SCOPES", "boards:read,pins:read,pins:write"),
	}

	// ── OAuth – Threads ──────────────────────────────────────────────────────────
	cfg.OAuth.Threads = OAuthPlatformConfig{
		ClientID:     getEnvOrDefault("THREADS_CLIENT_ID", ""),
		ClientSecret: getEnvOrDefault("THREADS_CLIENT_SECRET", ""),
		RedirectURL:  getEnvOrDefault("THREADS_REDIRECT_URL", cfg.App.BaseURL+"/api/v1/oauth/threads/callback"),
		Scopes:       splitEnvCSV("THREADS_SCOPES", "threads_basic,threads_content_publish"),
	}

	return cfg, nil
}

// IsDevelopment returns true when running in development mode.
func (c *Config) IsDevelopment() bool {
	return c.Server.Environment == "development"
}

// IsProduction returns true when running in production mode.
func (c *Config) IsProduction() bool {
	return c.Server.Environment == "production"
}

// ─── helpers ────────────────────────────────────────────────────────────────────

func requireEnv(key string) string {
	val := os.Getenv(key)
	if val == "" {
		// Panic at startup — missing required config is a fatal misconfiguration.
		panic(fmt.Sprintf("required environment variable %q is not set", key))
	}
	return val
}

func getEnvOrDefault(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func getEnvInt(key string, defaultVal int) int {
	if val := os.Getenv(key); val != "" {
		n, err := strconv.Atoi(val)
		if err == nil {
			return n
		}
	}
	return defaultVal
}

func getEnvDuration(key string, defaultVal time.Duration) time.Duration {
	if val := os.Getenv(key); val != "" {
		d, err := time.ParseDuration(val)
		if err == nil {
			return d
		}
	}
	return defaultVal
}

// splitEnvCSV splits a comma-separated env var into a string slice.
// Falls back to splitting the provided default string if the env var is unset.
func splitEnvCSV(key, defaultCSV string) []string {
	raw := os.Getenv(key)
	if raw == "" {
		raw = defaultCSV
	}
	if raw == "" {
		return nil
	}
	parts := make([]string, 0)
	start := 0
	for i := 0; i <= len(raw); i++ {
		if i == len(raw) || raw[i] == ',' {
			token := raw[start:i]
			if token != "" {
				parts = append(parts, token)
			}
			start = i + 1
		}
	}
	return parts
}
