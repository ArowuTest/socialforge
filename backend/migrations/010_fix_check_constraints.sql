-- Migration 010: Fix DB CHECK constraints that break GORM INSERT on registration.
--
-- Root cause of "registration failed" 500:
--   GORM inserts all struct fields including zero-value strings.
--   New User registration doesn't set SubscriptionStatus → GORM sends '' (empty).
--   The users.subscription_status CHECK constraint rejects '' → tx rolls back.
--
-- Similarly, workspace_members.role CHECK only allows 'owner'|'admin'|'member'|'viewer'
-- but GORM WorkspaceRole has 'editor' which is not in the list.
--
-- Fix: drop the overly-restrictive CHECK constraints and replace them with
-- permissive versions that match the full Go enum sets (including empty string
-- for fields that may be empty on creation).

-- ── users.subscription_status ────────────────────────────────────────────────

-- Find and drop the auto-named check constraint (name varies by PG version).
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'users'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%subscription_status%';

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', constraint_name);
    END IF;
END;
$$;

-- Add a permissive constraint that includes all Go enum values + empty string.
ALTER TABLE users
  ADD CONSTRAINT users_subscription_status_check
  CHECK (subscription_status IN (
    '', 'active', 'inactive', 'trialing', 'past_due', 'canceled',
    'incomplete', 'incomplete_expired', 'unpaid', 'paused'
  ));

-- ── users.plan ────────────────────────────────────────────────────────────────
-- The existing plan check is fine (GORM always sets 'free' on new users).
-- But make it safe: ensure 'enterprise' is allowed (referenced in frontend types).
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'users'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%plan%';

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', constraint_name);
    END IF;
END;
$$;

ALTER TABLE users
  ADD CONSTRAINT users_plan_check
  CHECK (plan IN ('free', 'starter', 'pro', 'agency', 'enterprise', ''));

-- ── workspace_members.role ───────────────────────────────────────────────────
-- GORM WorkspaceRole has 'editor' but the SQL CHECK only allowed 'member'.
-- Drop and replace.
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'workspace_members'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%role%';

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE workspace_members DROP CONSTRAINT %I', constraint_name);
    END IF;
END;
$$;

ALTER TABLE workspace_members
  ADD CONSTRAINT workspace_members_role_check
  CHECK (role IN ('owner', 'admin', 'editor', 'member', 'viewer', ''));

-- ── workspaces.plan ───────────────────────────────────────────────────────────
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'workspaces'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%plan%';

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE workspaces DROP CONSTRAINT %I', constraint_name);
    END IF;
END;
$$;

ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_plan_check
  CHECK (plan IN ('free', 'starter', 'pro', 'agency', 'enterprise', ''));

-- ── posts.status ─────────────────────────────────────────────────────────────
-- GORM PostStatus has 'publishing' but SQL status check may not include it.
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'posts'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%';

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE posts DROP CONSTRAINT %I', constraint_name);
    END IF;
END;
$$;

-- No replacement needed — let application code validate status values.
-- The column still has NOT NULL DEFAULT 'draft'.
