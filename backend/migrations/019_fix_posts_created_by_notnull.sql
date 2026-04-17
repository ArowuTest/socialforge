-- Migration 019: Fix posts.created_by NOT NULL constraint.
--
-- Root cause: migration 001 created posts.created_by as UUID NOT NULL.
-- Migration 009 added posts.author_id as the GORM-mapped column, but did not
-- drop the NOT NULL on the old created_by column.  GORM's INSERT statement
-- only writes author_id; PostgreSQL therefore rejects every new INSERT with a
-- NOT NULL violation → HTTP 500 "failed to create post".
--
-- Fix: make created_by nullable (it is superseded by author_id) and back-fill
-- any existing rows that might still have author_id NULL.

ALTER TABLE posts
  ALTER COLUMN created_by DROP NOT NULL;

-- Back-fill: ensure every existing row has created_by populated from author_id.
UPDATE posts
SET    created_by = author_id
WHERE  created_by IS NULL AND author_id IS NOT NULL;
