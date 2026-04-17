-- Migration 020: Convert posts.media_urls from TEXT[] to TEXT.
--
-- Root cause: migration 001 created posts.media_urls as TEXT[] (PostgreSQL native
-- array). GORM's StringSlice type serializes to JSON e.g. "[]" or "[\"url\"]".
-- PostgreSQL rejects "[]" as a malformed TEXT[] literal → SQLSTATE 22P02 →
-- HTTP 500 "failed to create post".
--
-- Fix: change the column type to plain TEXT so GORM can store JSON strings.
-- Existing rows (all empty arrays) are back-filled with '[]'.

ALTER TABLE posts
  ALTER COLUMN media_urls TYPE TEXT
  USING COALESCE(array_to_json(media_urls)::text, '[]');

-- Ensure no NULLs (column was NOT NULL before).
UPDATE posts SET media_urls = '[]' WHERE media_urls IS NULL;

ALTER TABLE posts ALTER COLUMN media_urls SET NOT NULL;
ALTER TABLE posts ALTER COLUMN media_urls SET DEFAULT '[]';
