-- Run inside a transaction
BEGIN;

ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS usd_cost NUMERIC(10,6) NOT NULL DEFAULT 0;

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS credit_balance INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS paystack_customer_id TEXT;

CREATE TABLE IF NOT EXISTS credit_ledger (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
    entry_type      TEXT        NOT NULL CHECK (entry_type IN ('monthly_grant','top_up','ai_debit','refund','adjustment')),
    credits         INTEGER     NOT NULL,
    balance_after   INTEGER     NOT NULL,
    usd_amount      NUMERIC(10,4),
    currency        TEXT        DEFAULT 'USD',
    exchange_rate   NUMERIC(12,6),
    provider        TEXT,
    provider_ref    TEXT,
    ai_job_id       UUID        REFERENCES ai_jobs(id) ON DELETE SET NULL,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_workspace_created ON credit_ledger (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_provider_ref ON credit_ledger (provider_ref) WHERE provider_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS credit_topups (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credits             INTEGER     NOT NULL,
    usd_amount          NUMERIC(10,4) NOT NULL,
    currency            TEXT        NOT NULL DEFAULT 'USD',
    amount_in_currency  NUMERIC(12,2) NOT NULL,
    exchange_rate       NUMERIC(12,6),
    provider            TEXT        NOT NULL,
    provider_ref        TEXT        UNIQUE,
    status              TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','refunded')),
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_topups_workspace ON credit_topups (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_topups_provider_ref ON credit_topups (provider_ref);
CREATE INDEX IF NOT EXISTS idx_credit_topups_status ON credit_topups (status);

COMMIT;
