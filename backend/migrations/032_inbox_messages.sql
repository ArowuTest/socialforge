-- 032_inbox_messages.sql
-- Unified social inbox: stores comments, mentions and DMs fetched from
-- platform APIs so users can read and reply without leaving ChiselPost.

CREATE TABLE IF NOT EXISTS inbox_messages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    social_account_id   UUID        NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    platform            VARCHAR(50) NOT NULL,
    message_type        VARCHAR(20) NOT NULL DEFAULT 'comment', -- comment | mention | dm
    external_id         VARCHAR(255) NOT NULL,                  -- platform's message/comment ID
    sender_name         VARCHAR(255) NOT NULL DEFAULT '',
    sender_handle       VARCHAR(255) NOT NULL DEFAULT '',
    sender_avatar       TEXT         NOT NULL DEFAULT '',
    content             TEXT         NOT NULL DEFAULT '',
    post_id             UUID         REFERENCES posts(id) ON DELETE SET NULL,
    platform_post_id    VARCHAR(255) NOT NULL DEFAULT '',        -- original platform post/media ID
    post_excerpt        VARCHAR(500) NOT NULL DEFAULT '',        -- snippet of the parent post
    is_read             BOOLEAN      NOT NULL DEFAULT false,
    replied_at          TIMESTAMPTZ,
    platform_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Prevent duplicate imports of the same platform message
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_messages_external
    ON inbox_messages(workspace_id, platform, external_id);

-- Fast queries: unread by workspace, filtered by platform
CREATE INDEX IF NOT EXISTS idx_inbox_messages_workspace_unread
    ON inbox_messages(workspace_id, is_read, platform_created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbox_messages_account
    ON inbox_messages(social_account_id);
