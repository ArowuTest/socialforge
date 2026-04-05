package database

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"github.com/socialforge/backend/internal/config"
)

var (
	rdb   *redis.Client
	rdbMu sync.RWMutex
)

// ConnectRedis creates and validates a Redis client from the provided config.
// The client is stored as a package-level singleton accessible via GetRedis().
func ConnectRedis(cfg *config.Config, log *zap.Logger) error {
	rdbMu.Lock()
	defer rdbMu.Unlock()

	opts, err := redis.ParseURL(cfg.Redis.URL)
	if err != nil {
		return fmt.Errorf("redis.ParseURL: %w", err)
	}

	// Allow explicit password override (useful when the URL is a plain host:port).
	if cfg.Redis.Password != "" {
		opts.Password = cfg.Redis.Password
	}

	// Override DB index from config (ParseURL already sets it if present in URL).
	if cfg.Redis.DB != 0 {
		opts.DB = cfg.Redis.DB
	}

	// Tune connection pool for a typical cloud deployment.
	opts.PoolSize = 20
	opts.MinIdleConns = 5
	opts.MaxRetries = 3
	opts.DialTimeout = 5 * time.Second
	opts.ReadTimeout = 3 * time.Second
	opts.WriteTimeout = 3 * time.Second
	opts.PoolTimeout = 4 * time.Second

	client := redis.NewClient(opts)

	// Verify connectivity.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		_ = client.Close()
		return fmt.Errorf("redis ping: %w", err)
	}

	log.Info("connected to redis",
		zap.String("addr", opts.Addr),
		zap.Int("db", opts.DB),
		zap.Int("pool_size", opts.PoolSize),
	)

	rdb = client
	return nil
}

// GetRedis returns the package-level Redis client.
// Panics if ConnectRedis has not been called successfully.
func GetRedis() *redis.Client {
	rdbMu.RLock()
	defer rdbMu.RUnlock()

	if rdb == nil {
		panic("redis: GetRedis called before ConnectRedis")
	}
	return rdb
}

// CloseRedis gracefully shuts down the Redis client.
// Call this during application shutdown.
func CloseRedis(log *zap.Logger) {
	rdbMu.Lock()
	defer rdbMu.Unlock()

	if rdb == nil {
		return
	}

	if err := rdb.Close(); err != nil {
		log.Error("failed to close redis client", zap.Error(err))
		return
	}

	log.Info("redis client closed")
	rdb = nil
}
