ALTER TABLE templates ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_templates_deleted_at ON templates(deleted_at);
