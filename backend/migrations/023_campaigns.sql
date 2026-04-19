CREATE TABLE IF NOT EXISTS campaigns (
    id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         UUID         NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    brand_kit_id         UUID         REFERENCES brand_kits(id) ON DELETE SET NULL,
    created_by           UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                 VARCHAR(255) NOT NULL,
    status               VARCHAR(50)  NOT NULL DEFAULT 'draft',
    goal                 VARCHAR(50),
    brief                TEXT,
    start_date           TIMESTAMPTZ,
    end_date             TIMESTAMPTZ,
    platforms            TEXT         NOT NULL DEFAULT '[]',
    posting_frequency    TEXT         NOT NULL DEFAULT '{}',
    content_mix          TEXT         NOT NULL DEFAULT '{}',
    auto_approve         BOOLEAN      NOT NULL DEFAULT FALSE,
    credits_estimated    INTEGER      NOT NULL DEFAULT 0,
    credits_used         INTEGER      NOT NULL DEFAULT 0,
    generation_progress  TEXT         NOT NULL DEFAULT '{}',
    total_posts          INTEGER      NOT NULL DEFAULT 0,
    posts_generated      INTEGER      NOT NULL DEFAULT 0,
    posts_approved       INTEGER      NOT NULL DEFAULT 0,
    posts_published      INTEGER      NOT NULL DEFAULT 0,
    settings             TEXT         NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_campaigns_workspace_id ON campaigns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status       ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_deleted_at   ON campaigns(deleted_at);

CREATE TABLE IF NOT EXISTS campaign_posts (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id         UUID         NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    workspace_id        UUID         NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    post_id             UUID         REFERENCES posts(id) ON DELETE SET NULL,
    scheduled_for       TIMESTAMPTZ  NOT NULL,
    platform            VARCHAR(50)  NOT NULL,
    post_type           VARCHAR(50)  NOT NULL,
    content_pillar      VARCHAR(100),
    status              VARCHAR(50)  NOT NULL DEFAULT 'pending_generation',
    generated_caption   TEXT,
    generated_hashtags  TEXT         NOT NULL DEFAULT '[]',
    media_urls          TEXT         NOT NULL DEFAULT '[]',
    ai_prompts_used     TEXT         NOT NULL DEFAULT '{}',
    error_message       TEXT,
    sort_order          INTEGER      NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_campaign_posts_campaign_id  ON campaign_posts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_posts_workspace_id ON campaign_posts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_campaign_posts_status       ON campaign_posts(status);
CREATE INDEX IF NOT EXISTS idx_campaign_posts_deleted_at   ON campaign_posts(deleted_at);
