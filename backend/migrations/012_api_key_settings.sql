-- 012_api_key_settings.sql
-- Add API key rows to platform_settings so admin can configure AI providers
-- via the settings UI. Values are stored AES-256-GCM encrypted.
-- Empty value = fall back to environment variable.

BEGIN;

INSERT INTO platform_settings (key, value, description, updated_at) VALUES
    ('openai_api_key', '', 'OpenAI API key for GPT-4o text generation (encrypted). Falls back to OPENAI_API_KEY env var when empty.', NOW()),
    ('fal_api_key',    '', 'Fal.ai API key for image and video generation (encrypted). Falls back to FAL_API_KEY env var when empty.', NOW())
ON CONFLICT (key) DO NOTHING;

COMMIT;
