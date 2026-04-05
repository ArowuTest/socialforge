// cmd/migrate — SQL migration runner for SocialForge.
//
// Usage:
//
//	go run ./cmd/migrate            # apply all pending migrations
//	go run ./cmd/migrate -dir path  # specify a custom migrations directory
//
// The runner tracks applied migrations in a `schema_migrations` table so each
// file is executed exactly once, in lexicographic filename order.
package main

import (
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/joho/godotenv"
	_ "github.com/jackc/pgx/v5/stdlib" // pgx driver registered as "pgx"
)

// ----------------------------------------------------------------------------
// Schema migrations tracking table
// ----------------------------------------------------------------------------

const createMigrationsTable = `
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     TEXT        PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

func main() {
	dir := flag.String("dir", "migrations", "directory containing .sql migration files")
	flag.Parse()

	// Load .env if present (dev convenience — in production env is injected)
	_ = godotenv.Load()

	dbURL := mustEnv("DATABASE_URL")

	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		log.Fatalf("migrate: open db: %v", err)
	}
	defer db.Close()

	// Wait up to 30 s for postgres to be ready
	if err := waitForDB(db, 30*time.Second); err != nil {
		log.Fatalf("migrate: db not ready: %v", err)
	}

	if err := run(db, *dir); err != nil {
		log.Fatalf("migrate: %v", err)
	}
}

// ----------------------------------------------------------------------------
// Core runner
// ----------------------------------------------------------------------------

func run(db *sql.DB, dir string) error {
	// Ensure tracking table exists
	if _, err := db.Exec(createMigrationsTable); err != nil {
		return fmt.Errorf("create schema_migrations table: %w", err)
	}

	// Collect already-applied versions
	applied, err := appliedVersions(db)
	if err != nil {
		return fmt.Errorf("query applied versions: %w", err)
	}

	// Collect migration files
	files, err := sqlFiles(dir)
	if err != nil {
		return fmt.Errorf("list migration files: %w", err)
	}

	if len(files) == 0 {
		log.Printf("migrate: no .sql files found in %s", dir)
		return nil
	}

	pending := 0
	for _, f := range files {
		version := migrationVersion(f)
		if applied[version] {
			log.Printf("migrate: [skip]  %s", f)
			continue
		}
		log.Printf("migrate: [apply] %s", f)
		if err := applyFile(db, dir, f, version); err != nil {
			return fmt.Errorf("apply %s: %w", f, err)
		}
		pending++
	}

	if pending == 0 {
		log.Printf("migrate: all migrations already applied — nothing to do")
	} else {
		log.Printf("migrate: applied %d migration(s) successfully", pending)
	}
	return nil
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

func appliedVersions(db *sql.DB) (map[string]bool, error) {
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

func sqlFiles(dir string) ([]string, error) {
	var files []string
	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() && path != dir {
			return fs.SkipDir
		}
		if !d.IsDir() && strings.HasSuffix(d.Name(), ".sql") {
			files = append(files, d.Name())
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Strings(files)
	return files, nil
}

func migrationVersion(filename string) string {
	// Strip extension — "001_initial.sql" → "001_initial"
	return strings.TrimSuffix(filename, ".sql")
}

func applyFile(db *sql.DB, dir, filename, version string) error {
	content, err := os.ReadFile(filepath.Join(dir, filename))
	if err != nil {
		return fmt.Errorf("read file: %w", err)
	}

	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	if _, err = tx.Exec(string(content)); err != nil {
		return fmt.Errorf("exec sql: %w", err)
	}

	if _, err = tx.Exec(
		`INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW())`,
		version,
	); err != nil {
		return fmt.Errorf("record version: %w", err)
	}

	return tx.Commit()
}

// waitForDB retries pinging the database until it's ready or the timeout fires.
func waitForDB(db *sql.DB, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if err := db.Ping(); err == nil {
			return nil
		}
		log.Printf("migrate: waiting for database…")
		time.Sleep(2 * time.Second)
	}
	return errors.New("timed out waiting for database")
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("migrate: required environment variable %q is not set", key)
	}
	return v
}
