-- Migration 006: Add white-label and client hierarchy columns to workspaces.
-- These columns exist in the Go model but were missing from the SQL schema,
-- causing GORM INSERT to fail with "column does not exist" on registration.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS brand_name           TEXT,
  ADD COLUMN IF NOT EXISTS secondary_color      VARCHAR(7),
  ADD COLUMN IF NOT EXISTS parent_workspace_id  UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_credits_limit     INTEGER NOT NULL DEFAULT 100;

CREATE INDEX IF NOT EXISTS idx_workspaces_parent_id ON workspaces (parent_workspace_id)
  WHERE parent_workspace_id IS NOT NULL;
