-- Migration 026: Create in-app notifications table.
--
-- Stores persistent in-app notifications delivered to individual users.
-- Created by the SendNotificationHandler when channel = "in_app".

CREATE TABLE IF NOT EXISTS notifications (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID         NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      UUID         NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
    title        VARCHAR(255) NOT NULL,
    body         TEXT         NOT NULL DEFAULT '',
    action_url   VARCHAR(2048),
    is_read      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id      ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_workspace_id ON notifications(workspace_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read      ON notifications(user_id, is_read);
