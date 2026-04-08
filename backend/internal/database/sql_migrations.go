package database

import (
	"database/sql"
	"fmt"
	"io/fs"
	"sort"
	"strings"

	"go.uber.org/zap"

	migrations "github.com/socialforge/backend/migrations"
)

const createMigrationsTable = `
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     TEXT        PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`

// bootstrapMigrations are the migration versions that were applied manually
// (via the seeder or DB console) before the embedded runner existed.
// If the schema_migrations table is empty but the users table exists, we mark
// these as already applied so the runner doesn't try to re-run CREATE TABLE
// statements against an existing schema.
var bootstrapMigrations = []string{
	"001_initial",
	"002_plans",
	"003_credit_system",
	"004_ai_cost_config",
	"005_super_admin",
}

// RunSQLMigrations applies all pending SQL migration files embedded in the
// migrations package. Each file is run exactly once; applied versions are
// tracked in the schema_migrations table.
//
// This function obtains the underlying *sql.DB from the GORM singleton so it
// must be called after database.Connect().
func RunSQLMigrations(log *zap.Logger) error {
	gdb := GetDB()
	sqlDB, err := gdb.DB()
	if err != nil {
		return fmt.Errorf("get sql.DB from gorm: %w", err)
	}

	return runEmbeddedMigrations(sqlDB, migrations.FS, log)
}

func runEmbeddedMigrations(db *sql.DB, fsys fs.FS, log *zap.Logger) error {
	// Ensure the tracking table exists.
	if _, err := db.Exec(createMigrationsTable); err != nil {
		return fmt.Errorf("create schema_migrations table: %w", err)
	}

	// Read already-applied versions.
	applied, err := appliedMigrationVersions(db)
	if err != nil {
		return fmt.Errorf("query applied versions: %w", err)
	}

	// Bootstrap detection: if schema_migrations is empty but the users table
	// already exists, this is an existing deployment that pre-dates the embedded
	// runner. Mark early migrations as applied without re-running them (those
	// CREATE TABLE statements would fail on an existing schema).
	if len(applied) == 0 {
		if exists, _ := tableExists(db, "users"); exists {
			log.Info("existing schema detected — bootstrapping schema_migrations table")
			for _, v := range bootstrapMigrations {
				if _, err := db.Exec(
					`INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW()) ON CONFLICT DO NOTHING`,
					v,
				); err != nil {
					log.Warn("bootstrap: failed to record migration version",
						zap.String("version", v), zap.Error(err))
				}
			}
			// Re-read applied versions after bootstrap.
			applied, err = appliedMigrationVersions(db)
			if err != nil {
				return fmt.Errorf("re-query applied versions after bootstrap: %w", err)
			}
		}
	}

	// Collect *.sql files from the embedded FS.
	entries, err := fs.ReadDir(fsys, ".")
	if err != nil {
		return fmt.Errorf("read embedded migrations dir: %w", err)
	}

	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)

	pending := 0
	for _, filename := range files {
		version := strings.TrimSuffix(filename, ".sql")
		if applied[version] {
			log.Debug("migration already applied — skipping", zap.String("version", version))
			continue
		}

		log.Info("applying SQL migration", zap.String("version", version))

		content, err := fs.ReadFile(fsys, filename)
		if err != nil {
			return fmt.Errorf("read migration file %s: %w", filename, err)
		}

		tx, err := db.Begin()
		if err != nil {
			return fmt.Errorf("begin tx for %s: %w", filename, err)
		}

		if _, err := tx.Exec(string(content)); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("exec migration %s: %w", filename, err)
		}

		if _, err := tx.Exec(
			`INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW())`,
			version,
		); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("record migration %s: %w", filename, err)
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %s: %w", filename, err)
		}

		log.Info("migration applied", zap.String("version", version))
		pending++
	}

	if pending == 0 {
		log.Info("all SQL migrations already applied — nothing to do")
	} else {
		log.Info("SQL migrations applied", zap.Int("count", pending))
	}

	return nil
}

func appliedMigrationVersions(db *sql.DB) (map[string]bool, error) {
	rows, err := db.Query(`SELECT version FROM schema_migrations`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	m := make(map[string]bool)
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		m[v] = true
	}
	return m, rows.Err()
}

// tableExists returns true if the named table exists in the public schema.
func tableExists(db *sql.DB, tableName string) (bool, error) {
	var exists bool
	err := db.QueryRow(
		`SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_schema = 'public' AND table_name = $1
		)`,
		tableName,
	).Scan(&exists)
	return exists, err
}
