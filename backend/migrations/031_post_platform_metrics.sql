-- Migration 031: Add per-platform engagement metric columns to post_platforms.
--
-- These columns are populated by a background metrics-sync job that runs
-- ~25 hours after a post is successfully published. Platform API responses
-- (Instagram Graph, Twitter v2, etc.) are written here so analytics
-- queries can aggregate real engagement signals instead of zeroes.

ALTER TABLE post_platforms
  ADD COLUMN IF NOT EXISTS likes         INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comments      INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shares        INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impressions   INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reach         INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saved         INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_views   INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metrics_fetched_at TIMESTAMPTZ;

-- Index to efficiently find post_platforms whose metrics are due for fetching.
-- The scheduler queries for rows where status='published' and metrics_fetched_at IS NULL.
CREATE INDEX IF NOT EXISTS idx_post_platforms_metrics_due
  ON post_platforms(status, metrics_fetched_at)
  WHERE status = 'published' AND metrics_fetched_at IS NULL;
