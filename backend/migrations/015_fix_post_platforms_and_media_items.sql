-- Migration 015: Fix two schema gaps that cause runtime 500 errors.
--
-- 1. post_platforms.platform column missing
--    The GORM PostPlatform model has a Platform field but the original SQL schema
--    did not include it (the platform was implied via the social_account_id FK).
--    The analytics repo queries `pp.platform` directly, causing a 500.
--
-- 2. media_items.deleted_at column missing
--    MediaItem embeds Base (which has gorm.DeletedAt), so GORM appends
--    `WHERE media_items.deleted_at IS NULL` to every query.
--    Migration 013 created the table without this column, causing a 500 on list.

-- ─── 1. post_platforms: add platform column ────────────────────────────────────

ALTER TABLE post_platforms
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT '';

-- Back-fill from the related social_account for any existing rows.
UPDATE post_platforms pp
SET    platform = sa.platform
FROM   social_accounts sa
WHERE  pp.social_account_id = sa.id
  AND  pp.platform = '';

CREATE INDEX IF NOT EXISTS idx_post_platforms_platform
  ON post_platforms (platform);

-- ─── 2. media_items: add deleted_at for GORM soft-delete ──────────────────────

ALTER TABLE media_items
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_media_items_deleted_at
  ON media_items (deleted_at)
  WHERE deleted_at IS NULL;
