-- 013_media_items.sql
-- Tracks uploaded media files stored in object storage (S3/R2/MinIO/etc.).
-- Created when a presigned PUT URL is generated; updated when upload is confirmed.

CREATE TABLE IF NOT EXISTS media_items (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    uploaded_by_id  UUID        NOT NULL REFERENCES users(id)      ON DELETE SET NULL,
    filename        TEXT        NOT NULL,
    content_type    TEXT        NOT NULL,
    size_bytes      BIGINT      NOT NULL DEFAULT 0,
    storage_key     TEXT        NOT NULL,
    public_url      TEXT        NOT NULL DEFAULT '',
    media_type      TEXT        NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_media_items_storage_key
    ON media_items (storage_key);

CREATE INDEX IF NOT EXISTS idx_media_items_workspace_id
    ON media_items (workspace_id, created_at DESC);
