package database

import (
	"fmt"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/socialforge/backend/internal/models"
)

// Migrate runs GORM AutoMigrate for all application models and then applies
// any manual index or constraint statements that GORM cannot express natively.
//
// AutoMigrate only ever adds or modifies columns – it never drops existing
// columns or tables, making it safe to run on every startup.
func Migrate(log *zap.Logger) error {
	db := GetDB()

	log.Info("running database migrations")

	// Enable the uuid-ossp extension so gen_random_uuid() is available.
	if err := db.Exec(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`).Error; err != nil {
		log.Warn("could not enable pgcrypto extension (may already exist)", zap.Error(err))
	}

	// Models to migrate, in dependency order (referenced tables first).
	migrateTargets := []interface{}{
		&models.User{},
		&models.Workspace{},
		&models.WorkspaceMember{},
		&models.SocialAccount{},
		&models.Post{},
		&models.PostPlatform{},
		&models.ScheduleSlot{},
		&models.ContentTemplate{},
		&models.AIJob{},
		&models.ApiKey{},
		&models.AuditLog{},
		&models.CreditTopUp{},
		&models.CreditLedger{},
	}

	if err := db.AutoMigrate(migrateTargets...); err != nil {
		return fmt.Errorf("AutoMigrate: %w", err)
	}

	// Apply supplementary indexes that improve query performance.
	supplementaryIndexes := []struct {
		name  string
		table string
		sql   string
	}{
		{
			name:  "idx_posts_workspace_status_scheduled",
			table: "posts",
			sql:   `CREATE INDEX IF NOT EXISTS idx_posts_workspace_status_scheduled ON posts (workspace_id, status, scheduled_at) WHERE deleted_at IS NULL`,
		},
		{
			name:  "idx_social_accounts_workspace_platform",
			table: "social_accounts",
			sql:   `CREATE INDEX IF NOT EXISTS idx_social_accounts_workspace_platform ON social_accounts (workspace_id, platform) WHERE deleted_at IS NULL`,
		},
		{
			name:  "idx_ai_jobs_workspace_status",
			table: "ai_jobs",
			sql:   `CREATE INDEX IF NOT EXISTS idx_ai_jobs_workspace_status ON ai_jobs (workspace_id, status) WHERE deleted_at IS NULL`,
		},
		{
			name:  "idx_audit_logs_workspace_created",
			table: "audit_logs",
			sql:   `CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_created ON audit_logs (workspace_id, created_at DESC)`,
		},
		{
			name:  "idx_users_stripe_customer",
			table: "users",
			sql:   `CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL AND deleted_at IS NULL`,
		},
		{
			name:  "idx_workspaces_custom_domain",
			table: "workspaces",
			sql:   `CREATE INDEX IF NOT EXISTS idx_workspaces_custom_domain ON workspaces (custom_domain) WHERE custom_domain IS NOT NULL AND deleted_at IS NULL`,
		},
		{
			name:  "idx_schedule_slots_workspace_active",
			table: "schedule_slots",
			sql:   `CREATE INDEX IF NOT EXISTS idx_schedule_slots_workspace_active ON schedule_slots (workspace_id, is_active, day_of_week) WHERE deleted_at IS NULL`,
		},
		{
			name:  "idx_api_keys_hash",
			table: "api_keys",
			sql:   `CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (key_hash) WHERE deleted_at IS NULL`,
		},
	}

	for _, idx := range supplementaryIndexes {
		if err := db.Exec(idx.sql).Error; err != nil {
			log.Warn("could not create supplementary index",
				zap.String("index", idx.name),
				zap.Error(err),
			)
		}
	}

	log.Info("database migrations completed successfully")
	return nil
}

// MigrateWithDB is an alternative entry point that accepts an explicit *gorm.DB,
// useful in tests or CLI tooling where the singleton is not used.
func MigrateWithDB(db *gorm.DB, log *zap.Logger) error {
	log.Info("running database migrations (explicit db)")

	if err := db.Exec(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`).Error; err != nil {
		log.Warn("could not enable pgcrypto extension", zap.Error(err))
	}

	migrateTargets := []interface{}{
		&models.User{},
		&models.Workspace{},
		&models.WorkspaceMember{},
		&models.SocialAccount{},
		&models.Post{},
		&models.PostPlatform{},
		&models.ScheduleSlot{},
		&models.ContentTemplate{},
		&models.AIJob{},
		&models.ApiKey{},
		&models.AuditLog{},
		&models.CreditTopUp{},
		&models.CreditLedger{},
	}

	if err := db.AutoMigrate(migrateTargets...); err != nil {
		return fmt.Errorf("AutoMigrate: %w", err)
	}

	log.Info("database migrations completed successfully (explicit db)")
	return nil
}
