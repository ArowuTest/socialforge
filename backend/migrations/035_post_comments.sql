-- 035_post_comments.sql
-- Adds the post_comments table that backs the review-workflow comment threads.
-- Flat (no parent_comment_id) for the MVP — every comment is a top-level reply
-- in the post's review thread.
BEGIN;

CREATE TABLE IF NOT EXISTS post_comments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id      UUID NOT NULL REFERENCES posts(id)      ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    author_id    UUID NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
    body         TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Most queries fetch all comments for one post in chronological order.
CREATE INDEX IF NOT EXISTS idx_post_comments_post_created
    ON post_comments (post_id, created_at);

-- For "notify everyone who has commented on this post" the workspace + author
-- combo is the lookup we need.
CREATE INDEX IF NOT EXISTS idx_post_comments_workspace_author
    ON post_comments (workspace_id, author_id);

COMMIT;
