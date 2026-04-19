CREATE TABLE IF NOT EXISTS brand_kits (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id     UUID         NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name             VARCHAR(255) NOT NULL,
    is_default       BOOLEAN      NOT NULL DEFAULT FALSE,
    industry         VARCHAR(100),
    primary_color    VARCHAR(7),
    secondary_color  VARCHAR(7),
    accent_color     VARCHAR(7),
    logo_url         TEXT,
    logo_dark_url    TEXT,
    brand_voice      TEXT,
    target_audience  TEXT,
    content_pillars  TEXT         NOT NULL DEFAULT '[]',
    brand_hashtags   TEXT         NOT NULL DEFAULT '[]',
    dos              TEXT         NOT NULL DEFAULT '[]',
    donts            TEXT         NOT NULL DEFAULT '[]',
    example_posts    TEXT         NOT NULL DEFAULT '[]',
    cta_preferences  TEXT         NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_brand_kits_workspace_id ON brand_kits(workspace_id);
CREATE INDEX IF NOT EXISTS idx_brand_kits_deleted_at   ON brand_kits(deleted_at);
