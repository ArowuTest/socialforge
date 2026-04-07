-- Migration 008: Comprehensive GORM-to-SQL schema alignment.
--
-- Fixes every column/table mismatch between the Go GORM models (models.go)
-- and the current SQL schema, which caused all registrations to fail with a
-- 500 "registration failed" error.
--
-- Root causes fixed:
--   1. users.name column missing   (GORM User.Name → 'name'; SQL only had 'full_name')
--   2. deleted_at missing          (GORM Base.DeletedAt requires this on users + workspaces)
--   3. Multiple workspace columns  (primary_color, is_whitelabel, stripe_*, current_period_*)
--   4. Multiple user columns       (trial_ends_at, api_key, email_verified_at)
--   5. workspace_members schema    (composite PK, no 'id' col, no 'invited_at')

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. USERS — add every column present in the GORM User model but absent in SQL
-- ═══════════════════════════════════════════════════════════════════════════

-- GORM User.Name maps to column 'name' (snake_case default).
-- SQL schema only had 'full_name'; GORM INSERT on 'name' → column not found.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';

-- Back-fill: copy full_name → name for any existing rows (e.g. seeded admin).
UPDATE users SET name = full_name WHERE name = '' AND full_name IS NOT NULL AND full_name <> '';

-- GORM gorm.DeletedAt (soft-delete) requires a deleted_at column on every table
-- that embeds the Base struct.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Remaining user fields present in the GORM model but absent from migrations.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS trial_ends_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS api_key           TEXT,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_deleted_at
  ON users (deleted_at)
  WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. WORKSPACES — add every column present in the GORM Workspace model but absent in SQL
-- ═══════════════════════════════════════════════════════════════════════════

-- Soft-delete column.
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- GORM Workspace.PrimaryColor maps to 'primary_color'; SQL only had 'brand_color'.
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7);

-- White-label flag.
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS is_whitelabel BOOLEAN NOT NULL DEFAULT FALSE;

-- Workspace-level Stripe billing columns (GORM model has these on Workspace,
-- but the SQL schema only added them to users).
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status    TEXT,
  ADD COLUMN IF NOT EXISTS current_period_start   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_period_end     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_workspaces_deleted_at
  ON workspaces (deleted_at)
  WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. WORKSPACE_MEMBERS — restructure to match GORM WorkspaceMember (uses Base)
--
-- Current SQL:  PRIMARY KEY (workspace_id, user_id), no 'id', no 'updated_at',
--               no 'deleted_at', no 'invited_at'
-- GORM model:   Base embeds id UUID PK + updated_at + deleted_at; has InvitedAt.
-- ═══════════════════════════════════════════════════════════════════════════

-- Step 1: add the id column (DEFAULT supplies values for existing rows too).
ALTER TABLE workspace_members
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

-- Step 2: ensure every existing row has an id (belt-and-suspenders).
UPDATE workspace_members SET id = gen_random_uuid() WHERE id IS NULL;

-- Step 3: id must be NOT NULL before we can make it the PK.
ALTER TABLE workspace_members ALTER COLUMN id SET NOT NULL;

-- Step 4: drop the old composite primary key.
ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_pkey;

-- Step 5: promote id to primary key.
ALTER TABLE workspace_members ADD PRIMARY KEY (id);

-- Step 6: add updated_at and deleted_at for GORM Base.
ALTER TABLE workspace_members
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Step 7: GORM WorkspaceMember.InvitedAt (autoCreateTime) → 'invited_at' column.
ALTER TABLE workspace_members
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Step 8: re-create the unique constraint on (workspace_id, user_id) that
-- the composite PK previously enforced.
DROP INDEX IF EXISTS idx_workspace_members_workspace_user;
CREATE UNIQUE INDEX idx_workspace_members_workspace_user
  ON workspace_members (workspace_id, user_id)
  WHERE deleted_at IS NULL;
