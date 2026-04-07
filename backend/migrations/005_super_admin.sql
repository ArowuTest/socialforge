-- Migration 005: Add is_super_admin and is_suspended columns to users table.
-- is_super_admin = true grants access to the /api/v1/admin/* platform management routes.
-- is_suspended   = true blocks login for the account.
--
-- The seed admin (admin@socialforge.io) is promoted to super-admin here.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_suspended   BOOLEAN NOT NULL DEFAULT FALSE;

-- Promote the seed admin account.
UPDATE users
SET is_super_admin = TRUE
WHERE email = 'admin@socialforge.io';

-- Index for fast admin lookups (small table, but good practice).
CREATE INDEX IF NOT EXISTS idx_users_super_admin ON users (is_super_admin)
  WHERE is_super_admin = TRUE;
