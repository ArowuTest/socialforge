package database

import (
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// Migrate runs only safe, idempotent supplementary index creation.
//
// All table creation and schema changes are handled by the SQL migration files
// in the /migrations directory, executed by cmd/migrate at deploy time.
// GORM AutoMigrate is intentionally NOT used because it conflicts with the
// named constraints and indexes that the SQL migrations create.
func Migrate(log *zap.Logger) error {
	db := GetDB()
	return applySupplementaryIndexes(db, log)
}

// MigrateWithDB is an alternative entry point that accepts an explicit *gorm.DB,
// useful in tests or CLI tooling where the singleton is not used.
func MigrateWithDB(db *gorm.DB, log *zap.Logger) error {
	return applySupplementaryIndexes(db, log)
}

// applySupplementaryIndexes creates performance indexes that are safe to
// re-run on every startup (all use IF NOT EXISTS).
func applySupplementaryIndexes(db *gorm.DB, log *zap.Logger) error {
	log.Info("applying supplementary indexes")

	indexes := []struct {
		name string
		sql  string
	}{
		{
			"idx_posts_workspace_status_scheduled",
			`CREATE INDEX IF NOT EXISTS idx_posts_workspace_status_scheduled ON posts (workspace_id, status, scheduled_at)`,
		},
		{
			"idx_social_accounts_workspace_platform",
			`CREATE INDEX IF NOT EXISTS idx_social_accounts_workspace_platform ON social_accounts (workspace_id, platform)`,
		},
		{
			"idx_ai_jobs_workspace_status",
			`CREATE INDEX IF NOT EXISTS idx_ai_jobs_workspace_status ON ai_jobs (workspace_id, status)`,
		},
		{
			"idx_audit_logs_workspace_created",
			`CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_created ON audit_logs (workspace_id, created_at DESC)`,
		},
		{
			"idx_users_stripe_customer",
			`CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL`,
		},
		{
			"idx_workspaces_custom_domain",
			`CREATE INDEX IF NOT EXISTS idx_workspaces_custom_domain ON workspaces (custom_domain) WHERE custom_domain IS NOT NULL`,
		},
		{
			"idx_schedule_slots_workspace_active",
			`CREATE INDEX IF NOT EXISTS idx_schedule_slots_workspace_active ON schedule_slots (workspace_id, is_enabled, day_of_week)`,
		},
		{
			"idx_api_keys_hash",
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (key_hash)`,
		},
	}

	for _, idx := range indexes {
		if err := db.Exec(idx.sql).Error; err != nil {
			// Non-fatal — log and continue. The index may already exist with a
			// different definition, or the table may not exist yet in dev.
			log.Warn("supplementary index skipped", zap.String("index", idx.name), zap.Error(err))
		}
	}

	log.Info("supplementary indexes applied")
	return nil
}
