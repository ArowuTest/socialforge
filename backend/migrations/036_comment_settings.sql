-- 036_comment_settings.sql
-- Seeds the admin-configurable comment_max_length setting so it surfaces in
-- /admin/cost-config/settings out of the box. Hardcoded fallback in Go is
-- 4000; the DB CHECK on post_comments.body also enforces a hard 4000 ceiling,
-- so admins can lower this but not raise above 4000 without a schema change.
BEGIN;

INSERT INTO platform_settings (key, value, description) VALUES
    ('comment_max_length', '4000', 'Max characters for post review-thread comments (hard ceiling 4000 enforced by DB CHECK)')
ON CONFLICT (key) DO NOTHING;

COMMIT;
