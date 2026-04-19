-- Migration 025: Ensure campaign_posts has all required columns
-- Fixes: ai_prompts_used column missing on instances where migration 023
-- was applied before the column was added to the schema.

ALTER TABLE campaign_posts
    ADD COLUMN IF NOT EXISTS ai_prompts_used TEXT NOT NULL DEFAULT '{}';

-- Also ensure credits_budget_cap exists on campaigns (from migration 024)
ALTER TABLE campaigns
    ADD COLUMN IF NOT EXISTS credits_budget_cap INTEGER NOT NULL DEFAULT 0;
