-- Migration 021: Create automations table.
--
-- Automations let users define rules that fire on triggers (post events,
-- schedules) and execute actions (notifications, repurposing, republishing).

CREATE TABLE IF NOT EXISTS automations (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id     UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name             VARCHAR(255) NOT NULL,
    description      TEXT,
    trigger_type     VARCHAR(50)  NOT NULL,
    trigger_config   TEXT        NOT NULL DEFAULT '{}',
    action_type      VARCHAR(50)  NOT NULL,
    action_config    TEXT        NOT NULL DEFAULT '{}',
    is_enabled       BOOLEAN     NOT NULL DEFAULT TRUE,
    last_triggered_at TIMESTAMPTZ,
    run_count        INTEGER     NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_automations_workspace_id ON automations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_automations_deleted_at   ON automations(deleted_at);
