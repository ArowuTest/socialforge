-- =============================================================================
-- Migration 001: Initial Schema
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- updated_at trigger function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    full_name     TEXT        NOT NULL DEFAULT '',
    avatar_url    TEXT,
    plan          TEXT        NOT NULL DEFAULT 'free'
                              CHECK (plan IN ('free', 'starter', 'pro', 'agency')),
    stripe_customer_id        TEXT UNIQUE,
    stripe_subscription_id    TEXT UNIQUE,
    subscription_status       TEXT NOT NULL DEFAULT 'inactive'
                              CHECK (subscription_status IN ('active', 'inactive', 'past_due', 'canceled', 'trialing')),
    subscription_current_period_end TIMESTAMPTZ,
    email_verified            BOOLEAN     NOT NULL DEFAULT FALSE,
    email_verification_token  TEXT,
    password_reset_token      TEXT,
    password_reset_expires_at TIMESTAMPTZ,
    last_login_at             TIMESTAMPTZ,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_stripe_customer_id ON users (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

CREATE TRIGGER set_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------------------
CREATE TABLE workspaces (
    id             UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id       UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name           TEXT    NOT NULL,
    slug           TEXT    NOT NULL UNIQUE,
    logo_url       TEXT,
    timezone       TEXT    NOT NULL DEFAULT 'UTC',
    -- white-label
    custom_domain  TEXT    UNIQUE,
    brand_color    TEXT,
    -- billing snapshot (denormalised for fast reads)
    plan           TEXT    NOT NULL DEFAULT 'free'
                           CHECK (plan IN ('free', 'starter', 'pro', 'agency')),
    ai_credits_used         INTEGER NOT NULL DEFAULT 0,
    ai_credits_reset_at     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workspaces_owner_id ON workspaces (owner_id);
CREATE INDEX idx_workspaces_slug     ON workspaces (slug);

CREATE TRIGGER set_workspaces_updated_at
    BEFORE UPDATE ON workspaces
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- workspace_members
-- ---------------------------------------------------------------------------
CREATE TABLE workspace_members (
    workspace_id UUID  NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      UUID  NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
    role         TEXT  NOT NULL DEFAULT 'member'
                       CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    invited_by   UUID  REFERENCES users(id) ON DELETE SET NULL,
    accepted_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX idx_workspace_members_user_id ON workspace_members (user_id);

-- ---------------------------------------------------------------------------
-- social_accounts
-- ---------------------------------------------------------------------------
CREATE TABLE social_accounts (
    id             UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id   UUID  NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    platform       TEXT  NOT NULL
                         CHECK (platform IN (
                             'instagram', 'facebook', 'tiktok', 'youtube',
                             'linkedin', 'twitter', 'pinterest', 'threads'
                         )),
    platform_user_id    TEXT NOT NULL,
    platform_username   TEXT NOT NULL,
    platform_name       TEXT,
    avatar_url          TEXT,
    -- tokens are stored AES-encrypted via pgcrypto at the application layer
    access_token_enc    BYTEA,
    refresh_token_enc   BYTEA,
    token_expires_at    TIMESTAMPTZ,
    scopes              TEXT[],
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    last_synced_at      TIMESTAMPTZ,
    follower_count      INTEGER,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, platform, platform_user_id)
);

CREATE INDEX idx_social_accounts_workspace_platform
    ON social_accounts (workspace_id, platform);

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------
CREATE TABLE posts (
    id             UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id   UUID  NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by     UUID  NOT NULL REFERENCES users(id)      ON DELETE SET NULL,
    title          TEXT,
    caption        TEXT,
    media_urls     TEXT[]   NOT NULL DEFAULT '{}',
    media_type     TEXT     NOT NULL DEFAULT 'none'
                            CHECK (media_type IN ('none', 'image', 'video', 'carousel', 'reel', 'story')),
    status         TEXT     NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled')),
    scheduled_at   TIMESTAMPTZ,
    published_at   TIMESTAMPTZ,
    -- AI generation metadata
    ai_generated   BOOLEAN  NOT NULL DEFAULT FALSE,
    ai_prompt      TEXT,
    -- template reference
    template_id    UUID,
    -- error info for failed posts
    last_error     TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_posts_workspace_status_scheduled
    ON posts (workspace_id, status, scheduled_at);
CREATE INDEX idx_posts_scheduled_at
    ON posts (scheduled_at) WHERE status = 'scheduled';

CREATE TRIGGER set_posts_updated_at
    BEFORE UPDATE ON posts
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- post_platforms — which social accounts a post targets + per-platform state
-- ---------------------------------------------------------------------------
CREATE TABLE post_platforms (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id           UUID NOT NULL REFERENCES posts(id)          ON DELETE CASCADE,
    social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    status            TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'publishing', 'published', 'failed')),
    platform_post_id  TEXT,
    platform_url      TEXT,
    published_at      TIMESTAMPTZ,
    error_message     TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (post_id, social_account_id)
);

CREATE INDEX idx_post_platforms_post_id           ON post_platforms (post_id);
CREATE INDEX idx_post_platforms_social_account_id ON post_platforms (social_account_id);

-- ---------------------------------------------------------------------------
-- schedule_slots — recurring best-time-to-post slots per workspace/platform
-- ---------------------------------------------------------------------------
CREATE TABLE schedule_slots (
    id             UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id   UUID  NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    platform       TEXT  NOT NULL,
    day_of_week    SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun
    time_of_day    TIME  NOT NULL,
    is_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schedule_slots_workspace ON schedule_slots (workspace_id, platform);

-- ---------------------------------------------------------------------------
-- content_templates
-- ---------------------------------------------------------------------------
CREATE TABLE content_templates (
    id           UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID  NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by   UUID  REFERENCES users(id) ON DELETE SET NULL,
    name         TEXT  NOT NULL,
    description  TEXT,
    category     TEXT,
    platforms    TEXT[] NOT NULL DEFAULT '{}',
    caption_template TEXT,
    hashtag_groups   TEXT[] DEFAULT '{}',
    media_urls       TEXT[] DEFAULT '{}',
    is_public        BOOLEAN NOT NULL DEFAULT FALSE,
    usage_count      INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_content_templates_workspace ON content_templates (workspace_id);

-- ---------------------------------------------------------------------------
-- ai_jobs — async AI generation tasks
-- ---------------------------------------------------------------------------
CREATE TABLE ai_jobs (
    id             UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id   UUID  NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id        UUID  NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
    job_type       TEXT  NOT NULL
                         CHECK (job_type IN ('caption', 'hashtags', 'image', 'video', 'schedule_suggestion')),
    status         TEXT  NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    credits_used   INTEGER NOT NULL DEFAULT 0,
    input_payload  JSONB,
    output_payload JSONB,
    error_message  TEXT,
    started_at     TIMESTAMPTZ,
    completed_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_jobs_workspace ON ai_jobs (workspace_id);
CREATE INDEX idx_ai_jobs_status    ON ai_jobs (status) WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- api_keys — programmatic access tokens
-- ---------------------------------------------------------------------------
CREATE TABLE api_keys (
    id             UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id   UUID  NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by     UUID  NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
    name           TEXT  NOT NULL,
    -- SHA-256 hash of the raw key; raw key is shown once and never stored
    key_hash       TEXT  NOT NULL UNIQUE,
    key_prefix     TEXT  NOT NULL,        -- e.g. "sf_live_abc123" — for display
    scopes         TEXT[] NOT NULL DEFAULT '{"read"}',
    last_used_at   TIMESTAMPTZ,
    expires_at     TIMESTAMPTZ,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_key_hash    ON api_keys (key_hash);
CREATE INDEX idx_api_keys_workspace   ON api_keys (workspace_id);

-- ---------------------------------------------------------------------------
-- audit_logs — immutable activity log
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id             UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id   UUID  REFERENCES workspaces(id) ON DELETE SET NULL,
    user_id        UUID  REFERENCES users(id)      ON DELETE SET NULL,
    action         TEXT  NOT NULL,   -- e.g. "post.create", "account.connect"
    resource_type  TEXT,             -- e.g. "post", "social_account"
    resource_id    UUID,
    metadata       JSONB,
    ip_address     INET,
    user_agent     TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_workspace_created
    ON audit_logs (workspace_id, created_at DESC);
CREATE INDEX idx_audit_logs_user_id
    ON audit_logs (user_id);

COMMIT;
