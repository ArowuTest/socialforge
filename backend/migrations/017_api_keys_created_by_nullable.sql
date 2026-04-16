-- Migration 017: make api_keys.created_by nullable
-- created_by duplicates user_id (migration 009 already copies the value).
-- GORM does not reliably include it in INSERTs, causing a NOT NULL violation.
-- Dropping the constraint lets existing rows keep their value while new rows
-- inserted by GORM (which omits the column) default to NULL safely.

ALTER TABLE api_keys
  ALTER COLUMN created_by DROP NOT NULL;
