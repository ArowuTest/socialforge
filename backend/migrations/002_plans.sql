-- =============================================================================
-- Migration 002: Plans, Billing Limits & Workspace Credits
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- plan_limits — canonical limits per plan tier
-- ---------------------------------------------------------------------------
CREATE TABLE plan_limits (
    plan_name               TEXT     PRIMARY KEY,
    max_social_accounts     INTEGER  NOT NULL,   -- -1 means unlimited
    ai_credits_monthly      INTEGER  NOT NULL,
    max_workspaces          INTEGER  NOT NULL,   -- -1 means unlimited
    max_team_members        INTEGER  NOT NULL,   -- -1 means unlimited
    has_api_access          BOOLEAN  NOT NULL DEFAULT FALSE,
    has_whitelabel          BOOLEAN  NOT NULL DEFAULT FALSE,
    has_analytics           BOOLEAN  NOT NULL DEFAULT FALSE,
    has_bulk_scheduling     BOOLEAN  NOT NULL DEFAULT FALSE,
    has_content_calendar    BOOLEAN  NOT NULL DEFAULT TRUE,
    has_ai_caption          BOOLEAN  NOT NULL DEFAULT TRUE,
    has_ai_image            BOOLEAN  NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Seed plan tiers
-- ---------------------------------------------------------------------------
INSERT INTO plan_limits (
    plan_name,
    max_social_accounts,
    ai_credits_monthly,
    max_workspaces,
    max_team_members,
    has_api_access,
    has_whitelabel,
    has_analytics,
    has_bulk_scheduling,
    has_content_calendar,
    has_ai_caption,
    has_ai_image
) VALUES
-- Free: hobbyist tier
(
    'free',
    2,          -- max 2 social accounts
    100,        -- 100 AI credits / month
    1,          -- 1 workspace
    1,          -- owner only
    FALSE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    FALSE
),
-- Starter: solo creator / small business
(
    'starter',
    20,         -- up to 20 social accounts
    1250,       -- 1,250 AI credits / month
    3,          -- up to 3 workspaces
    5,
    TRUE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE
),
-- Pro: growing team
(
    'pro',
    40,         -- up to 40 social accounts
    5000,       -- 5,000 AI credits / month
    10,         -- up to 10 workspaces
    15,
    TRUE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    TRUE
),
-- Agency: unlimited everything
(
    'agency',
    -1,         -- unlimited social accounts
    28000,      -- 28,000 AI credits / month
    -1,         -- unlimited workspaces
    -1,         -- unlimited team members
    TRUE,
    TRUE,       -- white-label enabled
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    TRUE
);

-- ---------------------------------------------------------------------------
-- Add AI credit tracking columns to workspaces (if not present from 001)
-- ---------------------------------------------------------------------------
ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS ai_credits_used      INTEGER     NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ai_credits_reset_at  TIMESTAMPTZ;

-- Index to find workspaces needing credit reset
CREATE INDEX IF NOT EXISTS idx_workspaces_credits_reset_at
    ON workspaces (ai_credits_reset_at)
    WHERE ai_credits_reset_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Subscription events log — for webhook idempotency & audit trail
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_events (
    id               UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID  REFERENCES users(id) ON DELETE SET NULL,
    stripe_event_id  TEXT  NOT NULL UNIQUE,
    event_type       TEXT  NOT NULL,
    payload          JSONB NOT NULL,
    processed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscription_events_user_id
    ON subscription_events (user_id);
CREATE INDEX idx_subscription_events_stripe_event_id
    ON subscription_events (stripe_event_id);

COMMIT;
