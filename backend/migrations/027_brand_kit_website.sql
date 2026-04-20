-- 027_brand_kit_website.sql
-- Adds website URL input and AI-extracted brand description to brand_kits.
-- The brand_description is populated asynchronously when the user saves a
-- website_url — it holds a GPT-extracted summary of the brand (mission,
-- products, audience, tone) used to enrich all AI generation prompts.

ALTER TABLE brand_kits
    ADD COLUMN IF NOT EXISTS website_url       VARCHAR(2048) DEFAULT '',
    ADD COLUMN IF NOT EXISTS brand_description TEXT          DEFAULT '';
