-- Migration 011: Convert UNIQUE constraints on nullable fields to partial unique
-- indexes so that GORM's empty-string zero-values don't cause duplicate-key
-- errors on the second (and every subsequent) registration.
--
-- Root cause: migration 001 created these columns with plain UNIQUE constraints:
--   users.stripe_customer_id, users.stripe_subscription_id,
--   workspaces.custom_domain
-- GORM inserts '' (empty string) for every new user/workspace because the fields
-- are unset string types.  PostgreSQL treats '' as a real value: the first
-- registration succeeds, the second fails with a unique constraint violation.
--
-- Fix: replace each plain UNIQUE constraint with a partial unique index that
-- only enforces uniqueness for non-empty, non-null values.

-- ── users.stripe_customer_id ─────────────────────────────────────────────────
DO $$
DECLARE
    cname TEXT;
BEGIN
    SELECT conname INTO cname
    FROM pg_constraint
    WHERE conrelid = 'users'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%stripe_customer_id%';
    IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', cname);
    END IF;
END;
$$;

DROP INDEX IF EXISTS idx_users_stripe_customer_id;
CREATE UNIQUE INDEX idx_users_stripe_customer_id
  ON users (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL AND stripe_customer_id <> '';

-- ── users.stripe_subscription_id ─────────────────────────────────────────────
DO $$
DECLARE
    cname TEXT;
BEGIN
    SELECT conname INTO cname
    FROM pg_constraint
    WHERE conrelid = 'users'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%stripe_subscription_id%';
    IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', cname);
    END IF;
END;
$$;

DROP INDEX IF EXISTS idx_users_stripe_subscription_id;
CREATE UNIQUE INDEX idx_users_stripe_subscription_id
  ON users (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL AND stripe_subscription_id <> '';

-- ── workspaces.custom_domain ──────────────────────────────────────────────────
DO $$
DECLARE
    cname TEXT;
BEGIN
    SELECT conname INTO cname
    FROM pg_constraint
    WHERE conrelid = 'workspaces'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%custom_domain%';
    IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE workspaces DROP CONSTRAINT %I', cname);
    END IF;
END;
$$;

DROP INDEX IF EXISTS idx_workspaces_custom_domain;
CREATE UNIQUE INDEX idx_workspaces_custom_domain
  ON workspaces (custom_domain)
  WHERE custom_domain IS NOT NULL AND custom_domain <> '';
