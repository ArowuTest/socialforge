// Package auth provides authentication and authorisation services for SocialForge.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/config"
	"github.com/socialforge/backend/internal/models"
)

// ─── Errors ───────────────────────────────────────────────────────────────────

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrUserAlreadyExists  = errors.New("a user with that email already exists")
	ErrInvalidToken       = errors.New("token is invalid or has expired")
	ErrTokenNotFound      = errors.New("refresh token not found")
	ErrInvalidAPIKey      = errors.New("api key is invalid or inactive")
	ErrWorkspaceSlugTaken = errors.New("workspace slug is already taken")
)

// ─── Token constants ──────────────────────────────────────────────────────────

const (
	refreshTokenPrefix = "refresh:"
	bcryptCost         = 12
	apiKeyPrefix       = "sfk_" // SocialForge Key
	apiKeyLength       = 32     // raw bytes → 43-char base64url
)

// ─── Claims ───────────────────────────────────────────────────────────────────

// Claims are the JWT payload stored in access tokens.
type Claims struct {
	UserID      uuid.UUID `json:"user_id"`
	Email       string    `json:"email"`
	Plan        string    `json:"plan"`
	jwt.RegisteredClaims
}

// ─── TokenPair ────────────────────────────────────────────────────────────────

// TokenPair bundles an access token with its companion refresh token.
type TokenPair struct {
	AccessToken  string    `json:"access_token"`
	RefreshToken string    `json:"refresh_token"`
	ExpiresAt    time.Time `json:"expires_at"`
}

// ─── RegisterInput ────────────────────────────────────────────────────────────

// RegisterInput is the payload required to create a new user account.
type RegisterInput struct {
	Email         string
	Password      string
	Name          string
	WorkspaceName string
}

// ─── Service ──────────────────────────────────────────────────────────────────

// Service provides all authentication operations.
type Service struct {
	db  *gorm.DB
	rdb *redis.Client
	cfg *config.Config
	log *zap.Logger
}

// New constructs a ready-to-use auth Service.
func New(db *gorm.DB, rdb *redis.Client, cfg *config.Config, log *zap.Logger) *Service {
	return &Service{db: db, rdb: rdb, cfg: cfg, log: log}
}

// ─── Register ─────────────────────────────────────────────────────────────────

// Register creates a new User and a default Workspace in a single transaction.
// It returns a TokenPair so the client is immediately authenticated.
func (s *Service) Register(ctx context.Context, in RegisterInput) (*models.User, *TokenPair, error) {
	// Normalise email.
	email := strings.ToLower(strings.TrimSpace(in.Email))

	// Check uniqueness.
	var existing models.User
	result := s.db.WithContext(ctx).Where("email = ?", email).First(&existing)
	if result.Error == nil {
		return nil, nil, ErrUserAlreadyExists
	}
	if !errors.Is(result.Error, gorm.ErrRecordNotFound) {
		return nil, nil, fmt.Errorf("db lookup user: %w", result.Error)
	}

	// Hash password.
	hash, err := hashPassword(in.Password)
	if err != nil {
		return nil, nil, fmt.Errorf("hashPassword: %w", err)
	}

	// Build workspace slug.
	slug := buildSlug(in.WorkspaceName)

	var user models.User
	var workspace models.Workspace

	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		user = models.User{
			Email:               email,
			PasswordHash:        hash,
			Name:                strings.TrimSpace(in.Name),
			Plan:                models.PlanFree,
			SubscriptionStatus:  models.SubscriptionStatusActive,
		}
		if err := tx.Create(&user).Error; err != nil {
			return fmt.Errorf("create user: %w", err)
		}

		// Ensure slug uniqueness.
		slug, err = uniqueSlug(ctx, tx, slug)
		if err != nil {
			return err
		}

		workspace = models.Workspace{
			Name:               strings.TrimSpace(in.WorkspaceName),
			Slug:               slug,
			OwnerID:            user.ID,
			Plan:               models.PlanFree,
			SubscriptionStatus: models.SubscriptionStatusActive,
		}
		if err := tx.Create(&workspace).Error; err != nil {
			return fmt.Errorf("create workspace: %w", err)
		}

		// Create owner membership.
		member := models.WorkspaceMember{
			WorkspaceID: workspace.ID,
			UserID:      user.ID,
			Role:        models.WorkspaceRoleOwner,
		}
		accepted := time.Now()
		member.AcceptedAt = &accepted
		if err := tx.Create(&member).Error; err != nil {
			return fmt.Errorf("create workspace member: %w", err)
		}

		return nil
	})
	if err != nil {
		return nil, nil, err
	}

	// Issue tokens.
	pair, err := s.issueTokenPair(ctx, &user)
	if err != nil {
		return nil, nil, err
	}

	s.log.Info("user registered",
		zap.String("user_id", user.ID.String()),
		zap.String("email", email),
		zap.String("workspace_id", workspace.ID.String()),
	)

	return &user, pair, nil
}

// ─── Login ────────────────────────────────────────────────────────────────────

// Login validates credentials and returns a TokenPair on success.
func (s *Service) Login(ctx context.Context, email, password string) (*models.User, *TokenPair, error) {
	email = strings.ToLower(strings.TrimSpace(email))

	var user models.User
	if err := s.db.WithContext(ctx).Where("email = ?", email).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil, ErrInvalidCredentials
		}
		return nil, nil, fmt.Errorf("db lookup user: %w", err)
	}

	if !verifyPassword(password, user.PasswordHash) {
		return nil, nil, ErrInvalidCredentials
	}

	pair, err := s.issueTokenPair(ctx, &user)
	if err != nil {
		return nil, nil, err
	}

	// Update last login timestamp.
	now := time.Now()
	_ = s.db.WithContext(ctx).Model(&user).Update("last_login_at", now).Error

	s.log.Info("user logged in",
		zap.String("user_id", user.ID.String()),
		zap.String("email", email),
	)

	return &user, pair, nil
}

// ─── RefreshToken ────────────────────────────────────────────────────────────

// RefreshToken validates a refresh token stored in Redis and issues a new TokenPair.
// The old refresh token is atomically deleted (rotation).
func (s *Service) RefreshToken(ctx context.Context, rawRefreshToken string) (*TokenPair, error) {
	key := refreshTokenKey(rawRefreshToken)

	userIDStr, err := s.rdb.Get(ctx, key).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return nil, ErrTokenNotFound
		}
		return nil, fmt.Errorf("redis get refresh token: %w", err)
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return nil, ErrInvalidToken
	}

	var user models.User
	if err := s.db.WithContext(ctx).First(&user, "id = ?", userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// Token references a deleted user — clean up.
			_ = s.rdb.Del(ctx, key).Err()
			return nil, ErrInvalidToken
		}
		return nil, fmt.Errorf("db lookup user: %w", err)
	}

	// Delete old refresh token (rotation).
	if err := s.rdb.Del(ctx, key).Err(); err != nil {
		s.log.Warn("could not delete old refresh token from redis", zap.Error(err))
	}

	pair, err := s.issueTokenPair(ctx, &user)
	if err != nil {
		return nil, err
	}

	s.log.Debug("refresh token rotated", zap.String("user_id", user.ID.String()))
	return pair, nil
}

// ─── Logout ───────────────────────────────────────────────────────────────────

// Logout deletes the given refresh token from Redis, invalidating the session.
func (s *Service) Logout(ctx context.Context, rawRefreshToken string) error {
	key := refreshTokenKey(rawRefreshToken)
	if err := s.rdb.Del(ctx, key).Err(); err != nil {
		return fmt.Errorf("redis del refresh token: %w", err)
	}
	s.log.Debug("refresh token deleted (logout)")
	return nil
}

// ─── GenerateAPIKey ───────────────────────────────────────────────────────────

// GenerateAPIKey creates a new hashed API key record and returns the raw key.
// The raw key is shown ONCE and is never retrievable again.
func (s *Service) GenerateAPIKey(ctx context.Context, workspaceID, userID uuid.UUID, name string) (rawKey string, record *models.ApiKey, err error) {
	raw, err := generateSecureToken(apiKeyLength)
	if err != nil {
		return "", nil, fmt.Errorf("generate secure token: %w", err)
	}

	rawKey = apiKeyPrefix + raw
	hash := sha256Hex(rawKey)
	prefix := rawKey[:min(len(rawKey), 12)]

	record = &models.ApiKey{
		WorkspaceID: workspaceID,
		UserID:      userID,
		Name:        name,
		KeyHash:     hash,
		KeyPrefix:   prefix,
		IsActive:    true,
	}

	if err := s.db.WithContext(ctx).Create(record).Error; err != nil {
		return "", nil, fmt.Errorf("db create api key: %w", err)
	}

	s.log.Info("api key generated",
		zap.String("workspace_id", workspaceID.String()),
		zap.String("user_id", userID.String()),
		zap.String("key_name", name),
	)

	return rawKey, record, nil
}

// ─── ValidateAPIKey ───────────────────────────────────────────────────────────

// ValidateAPIKey looks up a raw key by its SHA-256 hash and returns the record
// if it exists, is active, and has not expired.
func (s *Service) ValidateAPIKey(ctx context.Context, rawKey string) (*models.ApiKey, error) {
	hash := sha256Hex(rawKey)

	var key models.ApiKey
	err := s.db.WithContext(ctx).
		Where("key_hash = ? AND is_active = true", hash).
		First(&key).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrInvalidAPIKey
		}
		return nil, fmt.Errorf("db lookup api key: %w", err)
	}

	// Check optional expiry.
	if key.ExpiresAt != nil && key.ExpiresAt.Before(time.Now()) {
		return nil, ErrInvalidAPIKey
	}

	// Async last-used update — non-blocking, best-effort.
	go func() {
		now := time.Now()
		if err := s.db.WithContext(context.Background()).
			Model(&key).Update("last_used_at", now).Error; err != nil {
			s.log.Warn("failed to update api key last_used_at", zap.Error(err))
		}
	}()

	return &key, nil
}

// ─── ValidateAccessToken ─────────────────────────────────────────────────────

// ValidateAccessToken parses and validates a signed JWT access token,
// returning the embedded claims on success.
func (s *Service) ValidateAccessToken(tokenStr string) (*Claims, error) {
	return parseJWT(tokenStr, s.cfg.JWT.Secret)
}

// ─── internal helpers ─────────────────────────────────────────────────────────

// issueTokenPair generates a new JWT access token and a secure refresh token,
// stores the refresh token in Redis, and returns both.
func (s *Service) issueTokenPair(ctx context.Context, user *models.User) (*TokenPair, error) {
	accessToken, expiresAt, err := generateJWT(user, s.cfg.JWT.Secret, s.cfg.JWT.AccessTokenExpiry)
	if err != nil {
		return nil, fmt.Errorf("generateJWT: %w", err)
	}

	rawRefresh, err := generateSecureToken(32)
	if err != nil {
		return nil, fmt.Errorf("generateSecureToken: %w", err)
	}

	key := refreshTokenKey(rawRefresh)
	ttl := s.cfg.JWT.RefreshTokenExpiry

	if err := s.rdb.Set(ctx, key, user.ID.String(), ttl).Err(); err != nil {
		return nil, fmt.Errorf("redis set refresh token: %w", err)
	}

	return &TokenPair{
		AccessToken:  accessToken,
		RefreshToken: rawRefresh,
		ExpiresAt:    expiresAt,
	}, nil
}

// ─── JWT helpers ──────────────────────────────────────────────────────────────

func generateJWT(user *models.User, secret string, expiry time.Duration) (string, time.Time, error) {
	expiresAt := time.Now().Add(expiry)

	claims := Claims{
		UserID: user.ID,
		Email:  user.Email,
		Plan:   string(user.Plan),
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.ID.String(),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			Issuer:    "socialforge",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign jwt: %w", err)
	}

	return signed, expiresAt, nil
}

func parseJWT(tokenStr, secret string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, ErrInvalidToken
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, ErrInvalidToken
	}

	return claims, nil
}

// ─── Password helpers ─────────────────────────────────────────────────────────

func hashPassword(plain string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plain), bcryptCost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func verifyPassword(plain, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}

// ─── Misc helpers ─────────────────────────────────────────────────────────────

// generateSecureToken returns a URL-safe base64-encoded random token of n bytes.
func generateSecureToken(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// sha256Hex returns the lowercase hex-encoded SHA-256 hash of s.
func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

// refreshTokenKey returns the Redis key for a given raw refresh token.
func refreshTokenKey(rawToken string) string {
	return refreshTokenPrefix + sha256Hex(rawToken)
}

// buildSlug converts a workspace name to a URL-safe slug.
func buildSlug(name string) string {
	slug := strings.ToLower(strings.TrimSpace(name))
	var sb strings.Builder
	for _, r := range slug {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			sb.WriteRune(r)
		case r == ' ', r == '-', r == '_':
			sb.WriteRune('-')
		}
	}
	s := strings.Trim(sb.String(), "-")
	// Ensure minimum length.
	if len(s) < 3 {
		s = s + "-workspace"
	}
	return s
}

// uniqueSlug appends a counter suffix until the slug is unused.
func uniqueSlug(ctx context.Context, db *gorm.DB, base string) (string, error) {
	candidate := base
	for i := 1; i <= 100; i++ {
		var count int64
		if err := db.WithContext(ctx).Model(&models.Workspace{}).
			Where("slug = ?", candidate).Count(&count).Error; err != nil {
			return "", fmt.Errorf("check slug: %w", err)
		}
		if count == 0 {
			return candidate, nil
		}
		candidate = fmt.Sprintf("%s-%d", base, i)
	}
	return "", ErrWorkspaceSlugTaken
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
