-- Migration 009: Fix remaining GORM-to-SQL mismatches for tables used by
-- admin stats, AI job listing, and post management.
--
-- After migration 008 fixed users/workspaces/workspace_members, this migration
-- adds deleted_at to every remaining table that embeds the GORM Base struct,
-- and fixes critical column-name mismatches that break admin queries.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. social_accounts — Base struct needs deleted_at; column name alignment
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE social_accounts
  ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ,
  -- GORM SocialAccount.AccountID  → 'account_id';  SQL has 'platform_user_id'
  ADD COLUMN IF NOT EXISTS account_id      TEXT NOT NULL DEFAULT '',
  -- GORM SocialAccount.AccountName → 'account_name'; SQL has 'platform_name'
  ADD COLUMN IF NOT EXISTS account_name    TEXT NOT NULL DEFAULT '',
  -- GORM SocialAccount.AccountHandle → 'account_handle'; SQL has 'platform_username'
  ADD COLUMN IF NOT EXISTS account_handle  TEXT NOT NULL DEFAULT '',
  -- GORM-only fields missing from original schema
  ADD COLUMN IF NOT EXISTS account_type    TEXT NOT NULL DEFAULT 'personal',
  -- GORM uses TEXT columns for encrypted tokens, not BYTEA
  ADD COLUMN IF NOT EXISTS access_token    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS refresh_token   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS page_id         TEXT,
  ADD COLUMN IF NOT EXISTS page_name       TEXT,
  ADD COLUMN IF NOT EXISTS profile_url     TEXT,
  ADD COLUMN IF NOT EXISTS metadata        TEXT;        -- JSON stored as TEXT

-- Back-fill new alias columns from old ones for any existing rows.
UPDATE social_accounts SET
  account_id     = COALESCE(platform_user_id, ''),
  account_name   = COALESCE(platform_name, ''),
  account_handle = COALESCE(platform_username, '')
WHERE account_id = '' OR account_name = '' OR account_handle = '';

CREATE INDEX IF NOT EXISTS idx_social_accounts_deleted_at
  ON social_accounts (deleted_at)
  WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. posts — Base struct needs deleted_at; column name alignment
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS deleted_at       TIMESTAMPTZ,
  -- GORM Post.AuthorID → 'author_id'; SQL has 'created_by'
  ADD COLUMN IF NOT EXISTS author_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  -- GORM Post.Content  → 'content';   SQL has 'caption'
  ADD COLUMN IF NOT EXISTS content          TEXT,
  -- GORM Post.Type     → 'type';      SQL has 'media_type' (different meaning)
  ADD COLUMN IF NOT EXISTS type             TEXT NOT NULL DEFAULT 'text',
  -- GORM-only fields missing from original schema
  ADD COLUMN IF NOT EXISTS platforms        TEXT,   -- JSON array stored as TEXT
  ADD COLUMN IF NOT EXISTS thumbnail_url    TEXT,
  ADD COLUMN IF NOT EXISTS platform_post_ids TEXT,  -- JSONB stored as TEXT
  ADD COLUMN IF NOT EXISTS error_message    TEXT,   -- SQL has 'last_error'
  ADD COLUMN IF NOT EXISTS ai_job_id        UUID REFERENCES ai_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hashtags         TEXT,   -- JSON array stored as TEXT
  ADD COLUMN IF NOT EXISTS first_comment    TEXT,
  ADD COLUMN IF NOT EXISTS description      TEXT,
  ADD COLUMN IF NOT EXISTS tags             TEXT,
  ADD COLUMN IF NOT EXISTS privacy          TEXT,
  ADD COLUMN IF NOT EXISTS board_id         TEXT,
  ADD COLUMN IF NOT EXISTS link_url         TEXT,
  ADD COLUMN IF NOT EXISTS retry_count      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attempts         INTEGER NOT NULL DEFAULT 0;

-- Back-fill alias columns.
UPDATE posts SET
  author_id     = created_by,
  content       = COALESCE(caption, ''),
  error_message = COALESCE(last_error, '')
WHERE author_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_posts_deleted_at
  ON posts (deleted_at)
  WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. ai_jobs — Base struct needs deleted_at + updated_at; column name alignment
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE ai_jobs
  ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- GORM AIJob.RequestedByID → 'requested_by_id'; SQL has 'user_id'
  ADD COLUMN IF NOT EXISTS requested_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  -- GORM AIJob.InputData     → 'input_data';      SQL has 'input_payload'
  ADD COLUMN IF NOT EXISTS input_data      TEXT,
  -- GORM AIJob.OutputData    → 'output_data';     SQL has 'output_payload'
  ADD COLUMN IF NOT EXISTS output_data     TEXT,
  -- GORM AIJob.ModelUsed     → 'model_used';      missing from original schema
  ADD COLUMN IF NOT EXISTS model_used      TEXT;

-- Back-fill alias columns.
UPDATE ai_jobs SET
  requested_by_id = user_id,
  input_data      = input_payload::text,
  output_data     = output_payload::text
WHERE requested_by_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_jobs_deleted_at
  ON ai_jobs (deleted_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_jobs_requested_by_id
  ON ai_jobs (requested_by_id)
  WHERE requested_by_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. api_keys — Base struct needs deleted_at + updated_at; column alignment
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- GORM ApiKey.UserID      → 'user_id';      SQL has 'created_by'
  ADD COLUMN IF NOT EXISTS user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  -- GORM ApiKey.Permissions → 'permissions';  SQL has 'scopes'
  ADD COLUMN IF NOT EXISTS permissions TEXT;   -- JSON array stored as TEXT

UPDATE api_keys SET
  user_id     = created_by,
  permissions = scopes::text
WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_api_keys_deleted_at
  ON api_keys (deleted_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id
  ON api_keys (user_id)
  WHERE user_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. schedule_slots — Base struct needs deleted_at + updated_at
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE schedule_slots
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- GORM ScheduleSlot.Timezone → 'timezone'; SQL used workspace default, no column
  ADD COLUMN IF NOT EXISTS timezone    TEXT NOT NULL DEFAULT 'UTC',
  -- GORM uses is_active; SQL uses is_enabled — add alias
  ADD COLUMN IF NOT EXISTS is_active   BOOLEAN NOT NULL DEFAULT TRUE;

-- Sync is_active from is_enabled for existing rows.
UPDATE schedule_slots SET is_active = is_enabled WHERE TRUE;

CREATE INDEX IF NOT EXISTS idx_schedule_slots_deleted_at
  ON schedule_slots (deleted_at)
  WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. content_templates — Base struct needs deleted_at + updated_at alignment
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE content_templates
  ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ,
  -- GORM ContentTemplate.TemplateType → 'template_type'; SQL has 'category'
  ADD COLUMN IF NOT EXISTS template_type   TEXT NOT NULL DEFAULT 'caption',
  -- GORM ContentTemplate.PromptTemplate → 'prompt_template'; SQL has 'caption_template'
  ADD COLUMN IF NOT EXISTS prompt_template TEXT NOT NULL DEFAULT '',
  -- GORM ContentTemplate.ExampleOutput  → 'example_output'; missing from SQL
  ADD COLUMN IF NOT EXISTS example_output  TEXT,
  -- GORM ContentTemplate.IsPublic → 'is_public'; already in SQL ✓
  -- GORM ContentTemplate.UsageCount → 'usage_count'; already in SQL ✓
  -- platform column: SQL has 'platforms TEXT[]'; GORM has 'Platform PlatformType'
  -- Add a singular platform TEXT column alongside the plural
  ADD COLUMN IF NOT EXISTS platform        TEXT;

-- Back-fill from SQL columns.
UPDATE content_templates SET
  template_type   = COALESCE(category, 'caption'),
  prompt_template = COALESCE(caption_template, '')
WHERE template_type = 'caption' AND prompt_template = '';

CREATE INDEX IF NOT EXISTS idx_content_templates_deleted_at
  ON content_templates (deleted_at)
  WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. credit_topups — Base struct needs deleted_at alignment
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE credit_topups
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_credit_topups_deleted_at
  ON credit_topups (deleted_at)
  WHERE deleted_at IS NULL;
