-- 037_audit_resource_id_text.sql
-- Bug fix: audit_logs.resource_id was created as UUID in 001_initial.sql, but
-- many code paths pass non-UUID identifiers (platform_setting keys like
-- "comment_max_length", ai_job_cost job_types like "copilot", etc). The Go
-- model already declared the field as `string`, and call sites pass strings
-- directly, so the async INSERT was silently failing for any non-UUID
-- resource_id — meaning admin actions on platform_settings and ai_job_costs
-- had NO audit trail despite the code calling writeAudit() correctly.
--
-- This widens the column to TEXT so any identifier can be stored. Existing
-- UUID values cast implicitly. No data loss.
--
-- After this migration, /admin/audit-logs?action=settings.updated will start
-- returning rows for every admin platform_settings edit (it returned 0
-- previously despite many such edits).
BEGIN;

ALTER TABLE audit_logs ALTER COLUMN resource_id TYPE TEXT USING resource_id::TEXT;

COMMIT;
