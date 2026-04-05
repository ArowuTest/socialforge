package database

import (
	"fmt"
	"sync"
	"time"

	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"github.com/socialforge/backend/internal/config"
)

var (
	db   *gorm.DB
	dbMu sync.RWMutex
)

// Connect establishes a PostgreSQL connection using the provided configuration
// and stores it in the package-level singleton. It configures the connection
// pool and verifies connectivity with a ping before returning.
func Connect(cfg *config.Config, log *zap.Logger) error {
	dbMu.Lock()
	defer dbMu.Unlock()

	// Map application log level to GORM log level.
	gormLogLevel := gormlogger.Warn
	if cfg.IsDevelopment() {
		gormLogLevel = gormlogger.Info
	}

	gormCfg := &gorm.Config{
		Logger:                                   gormlogger.Default.LogMode(gormLogLevel),
		PrepareStmt:                              true,
		DisableForeignKeyConstraintWhenMigrating: false,
	}

	database, err := gorm.Open(postgres.Open(cfg.Database.DSN), gormCfg)
	if err != nil {
		return fmt.Errorf("gorm.Open: %w", err)
	}

	// Retrieve the underlying *sql.DB to configure the connection pool.
	sqlDB, err := database.DB()
	if err != nil {
		return fmt.Errorf("database.DB(): %w", err)
	}

	sqlDB.SetMaxOpenConns(cfg.Database.MaxOpenConns)
	sqlDB.SetMaxIdleConns(cfg.Database.MaxIdleConns)
	sqlDB.SetConnMaxLifetime(cfg.Database.ConnMaxLifetime)
	sqlDB.SetConnMaxIdleTime(10 * time.Minute)

	// Verify the connection is alive.
	if err := sqlDB.Ping(); err != nil {
		return fmt.Errorf("postgres ping: %w", err)
	}

	log.Info("connected to postgres",
		zap.String("dsn_masked", maskDSN(cfg.Database.DSN)),
		zap.Int("max_open_conns", cfg.Database.MaxOpenConns),
		zap.Int("max_idle_conns", cfg.Database.MaxIdleConns),
	)

	db = database
	return nil
}

// GetDB returns the package-level GORM database instance.
// Panics if Connect has not been called successfully, which surfaces
// misconfiguration early during startup.
func GetDB() *gorm.DB {
	dbMu.RLock()
	defer dbMu.RUnlock()

	if db == nil {
		panic("database: GetDB called before Connect")
	}
	return db
}

// Close releases the underlying connection pool.  Call this during graceful
// shutdown after all in-flight requests have completed.
func Close(log *zap.Logger) {
	dbMu.Lock()
	defer dbMu.Unlock()

	if db == nil {
		return
	}

	sqlDB, err := db.DB()
	if err != nil {
		log.Error("failed to get underlying sql.DB for close", zap.Error(err))
		return
	}

	if err := sqlDB.Close(); err != nil {
		log.Error("failed to close postgres connection pool", zap.Error(err))
		return
	}

	log.Info("postgres connection pool closed")
	db = nil
}

// maskDSN replaces the password portion of a DSN with asterisks so it is safe
// to log. It handles both "postgres://user:pass@host/db" and
// "host=... password=... dbname=..." forms.
func maskDSN(dsn string) string {
	// Simple approach: truncate after first 30 chars to avoid leaking credentials.
	if len(dsn) > 30 {
		return dsn[:30] + "***"
	}
	return "***"
}
