-- 004_ai_cost_config.sql
-- Stores per-job AI cost configuration, editable by admins at runtime.
BEGIN;

CREATE TABLE IF NOT EXISTS ai_job_costs (
    job_type        TEXT        PRIMARY KEY,
    label           TEXT        NOT NULL,
    description     TEXT        NOT NULL DEFAULT '',
    usd_cost        NUMERIC(10,6) NOT NULL,
    credits         INTEGER     NOT NULL DEFAULT 1,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by      UUID        REFERENCES users(id) ON DELETE SET NULL
);

-- Default costs seeded from known provider pricing
INSERT INTO ai_job_costs (job_type, label, description, usd_cost, credits) VALUES
    ('caption',   'Caption Generation', 'GPT-4o prompt + completion',            0.005, 1),
    ('hashtags',  'Hashtag Generation', 'GPT-4o short completion',               0.003, 1),
    ('carousel',  'Carousel Copy',      'Multi-slide caption set',               0.010, 2),
    ('analyse',   'Viral Analysis',     'Engagement scoring prompt',             0.005, 1),
    ('repurpose', 'Repurpose Content',  '8-platform repurpose (8× prompts)',     0.015, 3),
    ('improve',   'Improve Caption',    'Rewrite / tone-adjust prompt',          0.004, 1),
    ('image',     'AI Image',           'FLUX schnell on Fal.ai',                0.030, 5),
    ('video',     'AI Video',           'Kling / Seedance on Fal.ai',            0.200, 20)
ON CONFLICT (job_type) DO NOTHING;

CREATE TABLE IF NOT EXISTS credit_package_config (
    id              TEXT        PRIMARY KEY,           -- e.g. "credits_500"
    label           TEXT        NOT NULL,
    credits         INTEGER     NOT NULL,
    usd_price       NUMERIC(10,4) NOT NULL,
    ngn_price       NUMERIC(12,2) NOT NULL,
    is_best_value   BOOLEAN     NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    sort_order      INTEGER     NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by      UUID        REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO credit_package_config (id, label, credits, usd_price, ngn_price, is_best_value, sort_order) VALUES
    ('credits_100',  'Starter Pack',  100,  5.00,   8000.00,  FALSE, 1),
    ('credits_500',  'Growth Pack',   500,  20.00,  32000.00, FALSE, 2),
    ('credits_1500', 'Pro Pack',      1500, 50.00,  80000.00, TRUE,  3),
    ('credits_5000', 'Agency Pack',   5000, 150.00, 240000.00,FALSE, 4)
ON CONFLICT (id) DO NOTHING;

-- Settings table for global scalar config (NGN rate, etc.)
CREATE TABLE IF NOT EXISTS platform_settings (
    key         TEXT        PRIMARY KEY,
    value       TEXT        NOT NULL,
    description TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by  UUID        REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO platform_settings (key, value, description) VALUES
    ('ngn_per_usd',  '1600',  'Nigerian Naira per USD for credit package pricing'),
    ('ai_credits_free_plan',    '50',   'AI credits per month for Free plan'),
    ('ai_credits_starter_plan', '500',  'AI credits per month for Starter plan'),
    ('ai_credits_pro_plan',     '2000', 'AI credits per month for Pro plan'),
    ('ai_credits_agency_plan',  '10000','AI credits per month for Agency plan')
ON CONFLICT (key) DO NOTHING;

COMMIT;
