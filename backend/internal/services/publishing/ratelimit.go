// Package publishing provides the multi-platform post publishing service.
package publishing

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// PlatformRateLimits defines per-platform publish rate limits.
var PlatformRateLimits = map[string]RateLimit{
	"tiktok":    {MaxPerMinute: 5, MaxPerHour: 50},
	"instagram": {MaxPerMinute: 10, MaxPerHour: 100},
	"twitter":   {MaxPerMinute: 15, MaxPerHour: 300},
	"linkedin":  {MaxPerMinute: 10, MaxPerHour: 100},
	"facebook":  {MaxPerMinute: 10, MaxPerHour: 200},
	"youtube":   {MaxPerMinute: 3, MaxPerHour: 30},
	"pinterest": {MaxPerMinute: 10, MaxPerHour: 100},
	"threads":   {MaxPerMinute: 10, MaxPerHour: 100},
}

// RateLimit defines per-minute and per-hour publish rate limits.
type RateLimit struct {
	MaxPerMinute int
	MaxPerHour   int
}

// PlatformRateLimiter enforces per-platform, per-account outbound publish rate
// limits using Redis sliding-window counters.
type PlatformRateLimiter struct {
	rdb *redis.Client
}

// NewPlatformRateLimiter creates a PlatformRateLimiter backed by the given Redis client.
func NewPlatformRateLimiter(rdb *redis.Client) *PlatformRateLimiter {
	return &PlatformRateLimiter{rdb: rdb}
}

// Allow checks if a publish to the given platform+accountID is allowed.
// Returns (allowed bool, retryAfter time.Duration).
// Uses sliding window counter via Redis INCR + EXPIRE.
func (rl *PlatformRateLimiter) Allow(ctx context.Context, platform, accountID string) (bool, time.Duration) {
	minuteKey := fmt.Sprintf("rl:%s:%s:min:%d", platform, accountID, time.Now().Unix()/60)
	hourKey := fmt.Sprintf("rl:%s:%s:hr:%d", platform, accountID, time.Now().Unix()/3600)

	limits, ok := PlatformRateLimits[platform]
	if !ok {
		return true, 0 // unknown platform — allow
	}

	// Check minute limit.
	minuteCount, _ := rl.rdb.Incr(ctx, minuteKey).Result()
	if minuteCount == 1 {
		rl.rdb.Expire(ctx, minuteKey, 2*time.Minute)
	}
	if int(minuteCount) > limits.MaxPerMinute {
		return false, time.Duration(60-time.Now().Second()) * time.Second
	}

	// Check hour limit.
	hourCount, _ := rl.rdb.Incr(ctx, hourKey).Result()
	if hourCount == 1 {
		rl.rdb.Expire(ctx, hourKey, 2*time.Hour)
	}
	if int(hourCount) > limits.MaxPerHour {
		return false, time.Duration(3600-(time.Now().Unix()%3600)) * time.Second
	}

	return true, 0
}

// WaitForSlot blocks until the rate limit allows a publish, or ctx is cancelled.
func (rl *PlatformRateLimiter) WaitForSlot(ctx context.Context, platform, accountID string) error {
	for {
		allowed, retryAfter := rl.Allow(ctx, platform, accountID)
		if allowed {
			return nil
		}
		if retryAfter > 2*time.Minute {
			retryAfter = 2 * time.Minute
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(retryAfter):
		}
	}
}
