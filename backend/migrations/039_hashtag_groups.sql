-- 039_hashtag_groups.sql
-- Phase 3 #4: Smart Hashtag Groups — saved reusable hashtag bundles.
-- Name is unique per-workspace so editors can't create two "Marketing" groups.
-- hashtags is stored as JSON text (matches the StringSlice GORM type used
-- elsewhere in the codebase) for portability.
BEGIN;

CREATE TABLE IF NOT EXISTS hashtag_groups (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name         TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 50),
    hashtags     TEXT NOT NULL DEFAULT '[]'::text,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_hashtag_groups_workspace
    ON hashtag_groups (workspace_id, name);

-- Admin-configurable caps. The frontend reads these via the workspace
-- profile / settings call so it knows when to block create attempts client-
-- side; the backend enforces them as the source of truth.
INSERT INTO platform_settings (key, value, description) VALUES
    ('hashtag_max_groups_per_workspace', '50', 'Max number of saved hashtag groups per workspace'),
    ('hashtag_max_per_group',            '30', 'Max number of hashtags allowed in a single group')
ON CONFLICT (key) DO NOTHING;

COMMIT;
