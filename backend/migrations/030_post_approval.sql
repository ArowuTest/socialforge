-- Migration 030: Add approval_note column to posts for approval workflow.
--
-- Supports the post approval workflow where admins can reject posts with
-- an explanatory note. The note is displayed to the post author so they
-- know what changes are needed before resubmitting.

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS approval_note VARCHAR(1000) NOT NULL DEFAULT '';
