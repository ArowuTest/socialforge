-- 024: Campaign enhancements — budget cap, campaign analytics table

-- Add credits budget cap to campaigns (0 = no cap).
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS credits_budget_cap INTEGER NOT NULL DEFAULT 0;

-- campaign_analytics: post-publish performance data per campaign.
CREATE TABLE IF NOT EXISTS campaign_analytics (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID         NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  campaign_post_id  UUID         REFERENCES campaign_posts(id) ON DELETE SET NULL,
  workspace_id      UUID         NOT NULL,
  platform          VARCHAR(50)  NOT NULL,
  post_type         VARCHAR(50)  NOT NULL DEFAULT 'image',
  -- engagement metrics (populated by analytics sync job)
  impressions       INTEGER      NOT NULL DEFAULT 0,
  reach             INTEGER      NOT NULL DEFAULT 0,
  likes             INTEGER      NOT NULL DEFAULT 0,
  comments          INTEGER      NOT NULL DEFAULT 0,
  shares            INTEGER      NOT NULL DEFAULT 0,
  saves             INTEGER      NOT NULL DEFAULT 0,
  clicks            INTEGER      NOT NULL DEFAULT 0,
  video_views       INTEGER      NOT NULL DEFAULT 0,
  engagement_rate   DECIMAL(6,4) NOT NULL DEFAULT 0,
  -- time windows
  published_at      TIMESTAMPTZ,
  synced_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_analytics_campaign_id  ON campaign_analytics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_analytics_workspace_id ON campaign_analytics(workspace_id);
CREATE INDEX IF NOT EXISTS idx_campaign_analytics_platform     ON campaign_analytics(platform);
