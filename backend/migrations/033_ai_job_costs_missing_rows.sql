-- 033_ai_job_costs_missing_rows.sql
-- Adds ai_job_costs rows for AI job types that shipped after the initial
-- 004 migration so the admin /admin/settings → AI Costs tab can configure
-- them too. Previously these defaulted to the hardcoded values in Go and
-- couldn't be tuned without a redeploy.
--
-- Also adds platform_settings keys that the new DB-backed plan-limit and
-- FX loaders look for, so admins can edit values out of the box. All
-- inserts use ON CONFLICT DO NOTHING to remain idempotent on re-runs.
BEGIN;

-- ── AI job costs ─────────────────────────────────────────────────────────
INSERT INTO ai_job_costs (job_type, label, description, usd_cost, credits) VALUES
    ('image_premium',      'AI Image (Premium)',  'GPT Image 2 / DALL-E 3 HD',                 0.080, 25),
    ('reply_suggestions',  'Inbox AI Reply',      'GPT-4o mini, 3 on-brand reply options',     0.002, 1),
    ('brand_voice',        'Brand Voice Analysis','GPT-4o tone profile from example posts',    0.006, 1)
ON CONFLICT (job_type) DO NOTHING;

-- ── Plan limits (admin-editable) ──────────────────────────────────────────
-- These keys are read by Service.LoadPlanLimits to enforce quotas in real
-- time. Admins edit via /admin/settings → AI Costs / Plans.
INSERT INTO platform_settings (key, value, description) VALUES
    -- Social account limits per plan
    ('max_accounts_free',     '2',   'Max connected social accounts on Free plan'),
    ('max_accounts_starter',  '20',  'Max connected social accounts on Starter plan'),
    ('max_accounts_pro',      '40',  'Max connected social accounts on Pro plan'),
    ('max_accounts_agency',   '999', 'Max connected social accounts on Agency plan'),

    -- AI credits per month per plan (canonical keys used by plan limits loader)
    ('plan_credits_free',     '100',   'AI credits/month on Free plan'),
    ('plan_credits_starter',  '1250',  'AI credits/month on Starter plan'),
    ('plan_credits_pro',      '5000',  'AI credits/month on Pro plan'),
    ('plan_credits_agency',   '28000', 'AI credits/month on Agency plan'),

    -- Scheduled-posts ceiling per plan
    ('plan_posts_free',     '10',    'Max scheduled posts on Free plan'),
    ('plan_posts_starter',  '500',   'Max scheduled posts on Starter plan'),
    ('plan_posts_pro',      '2000',  'Max scheduled posts on Pro plan'),
    ('plan_posts_agency',   '50000', 'Max scheduled posts on Agency plan'),

    -- Workspace limits per plan
    ('plan_workspaces_free',     '1',   'Max workspaces on Free plan'),
    ('plan_workspaces_starter',  '1',   'Max workspaces on Starter plan'),
    ('plan_workspaces_pro',      '5',   'Max workspaces on Pro plan'),
    ('plan_workspaces_agency',   '999', 'Max workspaces on Agency plan'),

    -- Feature gates per plan
    ('plan_whitelabel_free',     'false', 'White-label branding on Free plan'),
    ('plan_whitelabel_starter',  'false', 'White-label branding on Starter plan'),
    ('plan_whitelabel_pro',      'false', 'White-label branding on Pro plan'),
    ('plan_whitelabel_agency',   'true',  'White-label branding on Agency plan'),
    ('plan_api_free',     'false', 'API access on Free plan'),
    ('plan_api_starter',  'true',  'API access on Starter plan'),
    ('plan_api_pro',      'true',  'API access on Pro plan'),
    ('plan_api_agency',   'true',  'API access on Agency plan'),

    -- AI model selection per job (so admins can swap to a newer model
    -- without a redeploy). The Go service reads these via LoadStringSetting
    -- and falls back to gpt-4o if missing.
    ('ai_model_caption',          'gpt-4o',      'OpenAI model for caption generation'),
    ('ai_model_hashtags',         'gpt-4o',      'OpenAI model for hashtag generation'),
    ('ai_model_analyse',          'gpt-4o',      'OpenAI model for viral analysis'),
    ('ai_model_replies',          'gpt-4o-mini', 'OpenAI model for inbox AI reply suggestions'),
    ('ai_model_brand_voice',      'gpt-4o',      'OpenAI model for brand voice extraction'),
    ('ai_model_repurpose',        'gpt-4o',      'OpenAI model for multi-platform repurpose'),
    ('ai_model_carousel',         'gpt-4o',      'OpenAI model for carousel slide generation')
ON CONFLICT (key) DO NOTHING;

COMMIT;
