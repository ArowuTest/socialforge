-- Migration 007: Add ai_credits_limit column to workspaces.
-- This column was in the GORM model but missing from all SQL migrations,
-- causing GORM INSERT (registration) to fail with column-not-found error.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS ai_credits_limit INTEGER NOT NULL DEFAULT 100;
