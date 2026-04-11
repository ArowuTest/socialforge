-- Migration 014: Make ai_jobs.user_id nullable.
--
-- Root cause: The original 001_initial.sql created ai_jobs with
-- user_id NOT NULL. Migration 009 added requested_by_id as the GORM
-- model's authoritative user-reference column, but left user_id NOT NULL.
-- GORM inserts only into requested_by_id, so the NOT NULL constraint on
-- user_id causes every AI job save to fail with:
--   "null value in column 'user_id' violates not-null constraint"
--
-- Fix: drop the NOT NULL constraint on user_id. requested_by_id is now
-- the canonical column; user_id is kept for backward-compat but optional.

ALTER TABLE ai_jobs
  ALTER COLUMN user_id DROP NOT NULL;
