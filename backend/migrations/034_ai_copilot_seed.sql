-- 034_ai_copilot_seed.sql
-- Seeds the Copilot job-cost row and its admin-configurable model/temperature
-- settings, plus a date-window default. Without these the admin /admin/settings
-- → AI Costs page can't tune the Copilot, and the get_top_posts tool has no
-- default time window for queries like "top posts" (no qualifier).
--
-- All inserts use ON CONFLICT DO NOTHING so re-runs are safe.
BEGIN;

-- ── Copilot job cost (admin-editable in /admin/cost-config/ai-jobs) ──
-- Per-turn cost. 2 credits = ~$0.005 OpenAI spend, ~75% margin on paid plans.
-- Admins can tune via the AI Costs tab without redeploy.
INSERT INTO ai_job_costs (job_type, label, description, usd_cost, credits) VALUES
    ('copilot', 'AI Copilot Chat', 'Workspace-aware chat assistant with tool calls (top posts, brand kit, analytics)', 0.005, 2)
ON CONFLICT (job_type) DO NOTHING;

-- ── Copilot model + temperature (admin-editable) ─────────────────────
-- Service.modelFor("copilot", "gpt-4o") and temperatureFor("copilot", 0.6)
-- consult these. Defaults to gpt-4o; admins can switch to gpt-4o-mini for
-- a ~10× cheaper Copilot without code changes.
INSERT INTO platform_settings (key, value, description) VALUES
    ('ai_model_copilot',       'gpt-4o', 'OpenAI model for the AI Copilot chat assistant'),
    ('ai_temperature_copilot', '0.6',    'Sampling temperature for Copilot (0.0–1.0)')
ON CONFLICT (key) DO NOTHING;

COMMIT;
