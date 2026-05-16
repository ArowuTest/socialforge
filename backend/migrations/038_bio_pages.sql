-- 038_bio_pages.sql
-- Phase 3 #3: Link-in-bio microsite builder.
-- Creates the three tables (bio_pages, bio_links, bio_link_clicks) plus the
-- admin-configurable setting that caps how many links a page can hold.
-- All idempotent so re-runs are safe.
BEGIN;

-- ── bio_pages ────────────────────────────────────────────────────────────────
-- 1:1 with workspaces (UNIQUE on workspace_id). Slug is public so we enforce
-- shape + uniqueness here as well as in Go validation.
CREATE TABLE IF NOT EXISTS bio_pages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
    slug            TEXT NOT NULL UNIQUE
                        CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),
    title           TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
    description     TEXT CHECK (description IS NULL OR length(description) <= 500),
    avatar_url      TEXT CHECK (avatar_url IS NULL OR length(avatar_url) <= 2048),
    theme           TEXT NOT NULL DEFAULT 'default'
                        CHECK (theme IN ('default','dark','minimal')),
    is_disabled     BOOLEAN NOT NULL DEFAULT FALSE,
    disabled_reason TEXT CHECK (disabled_reason IS NULL OR length(disabled_reason) <= 500),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── bio_links ────────────────────────────────────────────────────────────────
-- ClickCount is denormalised onto each row so /bio/:slug doesn't have to
-- aggregate from bio_link_clicks on every public request.
CREATE TABLE IF NOT EXISTS bio_links (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id     UUID NOT NULL REFERENCES bio_pages(id) ON DELETE CASCADE,
    title       TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
    url         TEXT NOT NULL CHECK (length(url) BETWEEN 1 AND 2048
                                       AND url ~* '^https?://'),
    icon        TEXT CHECK (icon IS NULL OR length(icon) <= 50),
    sort_order  INT NOT NULL DEFAULT 0,
    click_count INT NOT NULL DEFAULT 0 CHECK (click_count >= 0),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bio_links_page_order
    ON bio_links (page_id, sort_order);

-- ── bio_link_clicks ──────────────────────────────────────────────────────────
-- ip_hash is SHA-256 of the visitor IP — never store raw IP for privacy.
CREATE TABLE IF NOT EXISTS bio_link_clicks (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    link_id    UUID NOT NULL REFERENCES bio_links(id) ON DELETE CASCADE,
    page_id    UUID NOT NULL REFERENCES bio_pages(id) ON DELETE CASCADE,
    referer    TEXT,
    user_agent TEXT,
    ip_hash    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bio_clicks_link_created
    ON bio_link_clicks (link_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bio_clicks_page_created
    ON bio_link_clicks (page_id, created_at DESC);

-- ── Admin-configurable knobs ─────────────────────────────────────────────────
INSERT INTO platform_settings (key, value, description) VALUES
    ('bio_max_links_per_page',    '25',   'Max number of links allowed on a single bio page'),
    ('bio_click_tracking_enabled','true', 'Whether public /bio/:slug clicks are tracked in bio_link_clicks')
ON CONFLICT (key) DO NOTHING;

COMMIT;
