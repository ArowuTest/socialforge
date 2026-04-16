-- Migration 016: Seed two test users with comprehensive test data.
--
-- Users:
--   User 1 (existing): tester_april2026@gmail.com  → upgraded to Pro plan
--   User 2 (new):      agency_user@chiselpost.com  / AgencyPass456! → Agency plan
--
-- Each user's workspace gets:
--   • 4 social accounts (twitter, instagram, linkedin, bluesky)
--   • 47 schedule slots  (Mon-Fri 3×/day × 3 platforms + 2 weekend Instagram)
--   • 16 posts           (3 draft, 5 scheduled, 6 published, 2 failed)
--   • 10 AI jobs         (generate_text, generate_image, repurpose_content)
--   •  8 media items     (real Unsplash URLs)
--
-- Also fixes:
--   • social_accounts.platform CHECK  — adds bluesky
--   • ai_jobs.job_type CHECK          — adds generate_text, generate_image, repurpose_content
--
-- Fully idempotent — safe to run multiple times.

-- ── Fix social_accounts.platform CHECK to allow bluesky ───────────────────────
DO $$
DECLARE c TEXT;
BEGIN
  SELECT conname INTO c FROM pg_constraint
  WHERE conrelid = 'social_accounts'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%platform%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE social_accounts DROP CONSTRAINT %I', c); END IF;
END;
$$;

ALTER TABLE social_accounts
  ADD CONSTRAINT social_accounts_platform_check
  CHECK (platform IN (
    'instagram','facebook','tiktok','youtube',
    'linkedin','twitter','pinterest','threads','bluesky',''
  ));

-- ── Fix ai_jobs.job_type CHECK to allow GORM AIJobType values ─────────────────
DO $$
DECLARE c TEXT;
BEGIN
  SELECT conname INTO c FROM pg_constraint
  WHERE conrelid = 'ai_jobs'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%job_type%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE ai_jobs DROP CONSTRAINT %I', c); END IF;
END;
$$;

-- No replacement constraint — GORM / application validates job_type values.

-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_u1_id   UUID;
  v_ws1_id  UUID;
  v_u2_id   UUID;
  v_ws2_id  UUID;
  v_now     TIMESTAMPTZ := NOW();
  v_ws      UUID;
  v_uid     UUID;
BEGIN

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 1. USER 1 — upgrade existing tester to Pro
  -- ═══════════════════════════════════════════════════════════════════════════
  SELECT id INTO v_u1_id FROM users
  WHERE email = 'tester_april2026@gmail.com' AND deleted_at IS NULL LIMIT 1;

  IF v_u1_id IS NULL THEN
    RAISE NOTICE 'seed: tester_april2026@gmail.com not found — skipping user1 upgrade';
  ELSE
    UPDATE users SET
      plan = 'pro', name = 'Test User (Pro)', full_name = 'Test User (Pro)',
      subscription_status = 'active',
      email_verified_at = COALESCE(email_verified_at, v_now),
      updated_at = v_now
    WHERE id = v_u1_id;
    RAISE NOTICE 'seed: upgraded user1 id=%', v_u1_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 2. USER 2 — agency_user@chiselpost.com / AgencyPass456!
  --    bcrypt($2a$10$JWwoyBPib2mh0m8skPEclu8s7loirrHXEMbIMB7Yuo6306uSmKpXu)
  -- ═══════════════════════════════════════════════════════════════════════════
  SELECT id INTO v_u2_id FROM users
  WHERE email = 'agency_user@chiselpost.com' AND deleted_at IS NULL LIMIT 1;

  IF v_u2_id IS NULL THEN
    v_u2_id := gen_random_uuid();
    INSERT INTO users
      (id, email, password_hash, name, full_name, plan,
       subscription_status, is_super_admin, is_suspended,
       email_verified_at, created_at, updated_at)
    VALUES
      (v_u2_id, 'agency_user@chiselpost.com',
       '$2a$10$JWwoyBPib2mh0m8skPEclu8s7loirrHXEMbIMB7Yuo6306uSmKpXu',
       'Agency User', 'Agency User', 'agency',
       'active', FALSE, FALSE, v_now, v_now, v_now);
    RAISE NOTICE 'seed: created user2 id=%', v_u2_id;
  ELSE
    UPDATE users SET plan = 'agency', updated_at = v_now WHERE id = v_u2_id;
    RAISE NOTICE 'seed: user2 already exists id=%', v_u2_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 3. WORKSPACES
  -- ═══════════════════════════════════════════════════════════════════════════

  -- Workspace for User 1
  IF v_u1_id IS NOT NULL THEN
    SELECT id INTO v_ws1_id FROM workspaces
    WHERE owner_id = v_u1_id AND deleted_at IS NULL ORDER BY created_at LIMIT 1;

    IF v_ws1_id IS NULL THEN
      v_ws1_id := gen_random_uuid();
      INSERT INTO workspaces
        (id, owner_id, name, slug, plan,
         ai_credits_used, ai_credits_limit, ai_credits_reset_at,
         is_whitelabel, subscription_status, created_at, updated_at)
      VALUES
        (v_ws1_id, v_u1_id, 'Test Workspace Pro', 'test-workspace-pro', 'pro',
         0, 1000, v_now + INTERVAL '30 days', FALSE, 'active', v_now, v_now);
      INSERT INTO workspace_members
        (id, workspace_id, user_id, role, accepted_at, invited_at, created_at, updated_at)
      VALUES
        (gen_random_uuid(), v_ws1_id, v_u1_id, 'owner', v_now, v_now, v_now, v_now)
      ON CONFLICT DO NOTHING;
      RAISE NOTICE 'seed: created workspace1 id=%', v_ws1_id;
    ELSE
      UPDATE workspaces SET plan = 'pro', ai_credits_limit = 1000, updated_at = v_now
      WHERE id = v_ws1_id;
      RAISE NOTICE 'seed: workspace1 already exists id=%', v_ws1_id;
    END IF;
  END IF;

  -- Workspace for User 2
  SELECT id INTO v_ws2_id FROM workspaces
  WHERE owner_id = v_u2_id AND deleted_at IS NULL ORDER BY created_at LIMIT 1;

  IF v_ws2_id IS NULL THEN
    v_ws2_id := gen_random_uuid();
    INSERT INTO workspaces
      (id, owner_id, name, slug, plan,
       ai_credits_used, ai_credits_limit, ai_credits_reset_at,
       is_whitelabel, subscription_status, created_at, updated_at)
    VALUES
      (v_ws2_id, v_u2_id, 'Digital Agency Hub', 'digital-agency-hub', 'agency',
       0, 1000, v_now + INTERVAL '30 days', FALSE, 'active', v_now, v_now);
    INSERT INTO workspace_members
      (id, workspace_id, user_id, role, accepted_at, invited_at, created_at, updated_at)
    VALUES
      (gen_random_uuid(), v_ws2_id, v_u2_id, 'owner', v_now, v_now, v_now, v_now)
    ON CONFLICT DO NOTHING;
    RAISE NOTICE 'seed: created workspace2 id=%', v_ws2_id;
  ELSE
    UPDATE workspaces SET plan = 'agency', ai_credits_limit = 1000, updated_at = v_now
    WHERE id = v_ws2_id;
    RAISE NOTICE 'seed: workspace2 already exists id=%', v_ws2_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 4. SEED DATA PER WORKSPACE
  -- ═══════════════════════════════════════════════════════════════════════════

  FOR v_ws, v_uid IN
    SELECT ws, u FROM (VALUES (v_ws1_id, v_u1_id),(v_ws2_id, v_u2_id)) t(ws,u)
    WHERE ws IS NOT NULL AND u IS NOT NULL
  LOOP

    -- ── 4a. Social Accounts ─────────────────────────────────────────────────
    IF (SELECT COUNT(*) FROM social_accounts
        WHERE workspace_id = v_ws AND deleted_at IS NULL) = 0 THEN

      -- Note: access_token/refresh_token are empty — accounts display correctly
      -- but won't be usable for publishing until real OAuth tokens are connected.
      -- platform_user_id and platform_username are the original NOT NULL columns.
      -- account_id / account_name / account_handle are aliases added by migration 009.
      -- We must supply both to satisfy the NOT NULL constraints.
      INSERT INTO social_accounts
        (id, workspace_id, platform,
         platform_user_id, platform_username,
         account_id, account_name, account_handle,
         account_type, access_token, refresh_token, is_active, follower_count,
         scopes, created_at, updated_at)
      VALUES
        (gen_random_uuid(), v_ws, 'twitter',
         '1234567890', 'chiselpost_test',
         '1234567890', 'ChiselPost Test',    '@chiselpost_test',        'personal', '', '', TRUE, 4820,  ARRAY[]::text[], v_now, v_now),
        (gen_random_uuid(), v_ws, 'instagram',
         '9876543210', 'chiselpost.test',
         '9876543210', 'chiselpost.test',    '@chiselpost.test',        'business', '', '', TRUE, 12340, ARRAY[]::text[], v_now, v_now),
        (gen_random_uuid(), v_ws, 'linkedin',
         'urn:li:person:seed1234', 'chiselpost-company',
         'urn:li:person:seed1234', 'ChiselPost Company', 'chiselpost-company', 'business', '', '', TRUE, 2187,  ARRAY[]::text[], v_now, v_now),
        (gen_random_uuid(), v_ws, 'bluesky',
         'did:plc:seed1234567890', 'chiselpost.bsky.social',
         'did:plc:seed1234567890', 'ChiselPost',         '@chiselpost.bsky.social', 'personal', '', '', TRUE, 891, ARRAY[]::text[], v_now, v_now);

      RAISE NOTICE 'seed: created social accounts for workspace %', v_ws;
    ELSE
      RAISE NOTICE 'seed: social accounts already exist for workspace % — skipping', v_ws;
    END IF;

    -- ── 4b. Schedule Slots ──────────────────────────────────────────────────
    IF (SELECT COUNT(*) FROM schedule_slots
        WHERE workspace_id = v_ws AND deleted_at IS NULL) = 0 THEN

      INSERT INTO schedule_slots
        (id, workspace_id, platform, day_of_week, time_of_day,
         timezone, is_active, is_enabled, created_at, updated_at)
      SELECT
        gen_random_uuid(), v_ws, platform, dow, slot_time::TIME,
        'UTC', TRUE, TRUE, v_now, v_now
      FROM
        (VALUES ('twitter'),('instagram'),('linkedin')) p(platform),
        (VALUES (1),(2),(3),(4),(5)) d(dow),
        (VALUES ('08:00'),('12:00'),('17:30')) t(slot_time);

      -- Weekend Instagram only
      INSERT INTO schedule_slots
        (id, workspace_id, platform, day_of_week, time_of_day,
         timezone, is_active, is_enabled, created_at, updated_at)
      VALUES
        (gen_random_uuid(), v_ws, 'instagram', 0, '10:00', 'UTC', TRUE, TRUE, v_now, v_now),
        (gen_random_uuid(), v_ws, 'instagram', 6, '10:00', 'UTC', TRUE, TRUE, v_now, v_now);

      RAISE NOTICE 'seed: created schedule slots for workspace %', v_ws;
    ELSE
      RAISE NOTICE 'seed: schedule slots already exist for workspace % — skipping', v_ws;
    END IF;

    -- ── 4c. Posts ───────────────────────────────────────────────────────────
    -- platforms & hashtags are stored as TEXT (JSON string) per migration 009.
    -- media_urls is still TEXT[] per migration 001; use PostgreSQL array literal.
    IF (SELECT COUNT(*) FROM posts
        WHERE workspace_id = v_ws AND deleted_at IS NULL) = 0 THEN

      INSERT INTO posts
        (id, workspace_id, author_id, title, content, type, status,
         platforms, hashtags, media_urls, ai_generated,
         scheduled_at, published_at, retry_count, attempts, created_at, updated_at)
      VALUES
        -- DRAFTS
        (gen_random_uuid(), v_ws, v_uid,
         'Behind the Scenes: Our AI Content Pipeline',
         E'Ever wondered how we generate hundreds of captions in seconds? Deep dive into our AI pipeline. We use GPT-4o for text and Flux for images. \U0001f916\n\nThread below \U0001f447',
         'thread','draft',
         '["twitter"]','["AI","ContentMarketing","SocialMedia","BuildInPublic"]',ARRAY[]::text[],FALSE,
         NULL,NULL,0,0,v_now,v_now),

        (gen_random_uuid(), v_ws, v_uid,
         'Product Launch Teaser',
         E'Something big is coming next week. We''ve been working on this for 3 months. Stay tuned! \U0001f525',
         'text','draft',
         '["twitter","linkedin","instagram"]','["ProductLaunch","ComingSoon","Startup"]',ARRAY[]::text[],FALSE,
         NULL,NULL,0,0,v_now,v_now),

        (gen_random_uuid(), v_ws, v_uid,
         'Why Most Social Media Strategies Fail',
         E'After auditing 200+ brand accounts, we found 3 patterns that kill social media ROI:\n\n1. Posting without a content calendar\n2. Ignoring platform-native formats\n3. No A/B testing on captions\n\nHere''s how to fix each one \U0001f447',
         'text','draft',
         '["linkedin"]','["MarketingStrategy","SocialMediaMarketing","ContentStrategy"]',ARRAY[]::text[],FALSE,
         NULL,NULL,0,0,v_now,v_now),

        -- SCHEDULED
        (gen_random_uuid(), v_ws, v_uid,
         'Monday Morning Motivation',
         E'Start your week with a clear content strategy. Our 5-step framework that helped 500+ brands increase engagement by 3x:\n\n\u2705 Define your ICP\n\u2705 Map content to buyer journey\n\u2705 Schedule 3x per day\n\u2705 Analyse weekly\n\u2705 Double down on winners',
         'text','scheduled',
         '["twitter","linkedin"]','["MondayMotivation","ContentMarketing","MarketingTips"]',ARRAY[]::text[],FALSE,
         v_now + INTERVAL '2 hours',NULL,0,0,v_now,v_now),

        (gen_random_uuid(), v_ws, v_uid,
         'AI-Generated Image Showcase',
         E'We generated this stunning visual in under 30 seconds using our AI Image tool. Zero design skills needed. \u2728\n\nTry it free at chiselpost.com',
         'image','scheduled',
         '["instagram","twitter"]','["AIArt","DigitalMarketing","ContentCreation"]',
         ARRAY['https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=1080&q=80']::text[],TRUE,
         v_now + INTERVAL '6 hours',NULL,0,0,v_now,v_now),

        (gen_random_uuid(), v_ws, v_uid,
         'Mid-Week Engagement Tips',
         E'3 ways to increase your Instagram engagement this week:\n\n1. Use carousel posts (3x more reach)\n2. Post at 8am and 6pm local time\n3. Reply to every comment in the first hour\n\nSave this post \U0001f4cc',
         'carousel','scheduled',
         '["instagram"]','["InstagramTips","SocialMediaTips","EngagementHacks"]',
         ARRAY['https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=1080&q=80']::text[],FALSE,
         v_now + INTERVAL '26 hours',NULL,0,0,v_now,v_now),

        (gen_random_uuid(), v_ws, v_uid,
         'LinkedIn Thought Leadership Post',
         E'The biggest mistake brands make on LinkedIn:\n\nThey treat it like Twitter.\n\nLinkedIn rewards long-form value. Here''s what actually works:\n\u2192 Share specific data and results\n\u2192 Tell personal stories with business lessons\n\u2192 Engage with comments for 60 minutes after posting\n\u2192 Avoid link posts (they kill reach)',
         'text','scheduled',
         '["linkedin"]','["LinkedIn","B2BMarketing","ThoughtLeadership"]',ARRAY[]::text[],FALSE,
         v_now + INTERVAL '50 hours',NULL,0,0,v_now,v_now),

        (gen_random_uuid(), v_ws, v_uid,
         'Platform Feature: Auto-Scheduling',
         E'Did you know ChiselPost''s auto-scheduler picks the BEST time to post based on your audience''s activity patterns?\n\nNo more guessing. Just results. \U0001f4c5\n\nSet it up in 2 minutes at chiselpost.com',
         'text','scheduled',
         '["twitter","instagram","linkedin"]','["SocialMediaScheduling","MarketingAutomation","ContentPlanning"]',ARRAY[]::text[],FALSE,
         v_now + INTERVAL '72 hours',NULL,0,0,v_now,v_now),

        -- PUBLISHED
        (gen_random_uuid(), v_ws, v_uid,
         'Feature Spotlight: AI Caption Generator',
         E'Generate platform-perfect captions in one click. Our AI knows the difference between a LinkedIn thought piece and an Instagram carousel caption.\n\nTest it free \u2014 no credit card needed. \U0001f680',
         'text','published',
         '["twitter","linkedin"]','["AI","SocialMediaTools","ContentCreation"]',ARRAY[]::text[],TRUE,
         v_now - INTERVAL '3 days',v_now - INTERVAL '3 days' + INTERVAL '30 seconds',0,0,v_now,v_now),

        (gen_random_uuid(), v_ws, v_uid,
         'Customer Success Story',
         E'How @acmebrand grew their Instagram following by 47% in 90 days using ChiselPost.\n\nKey tactics:\n\u2022 Posted 2x daily consistently\n\u2022 Used AI captions for every post\n\u2022 A/B tested 3 caption styles per week\n\nFull case study in bio \U0001f4ca',
         'image','published',
         '["instagram","twitter"]','["CaseStudy","SocialMediaGrowth","CustomerSuccess"]',
         ARRAY['https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1080&q=80']::text[],FALSE,
         v_now - INTERVAL '5 days',v_now - INTERVAL '5 days' + INTERVAL '45 seconds',0,0,v_now,v_now),

        (gen_random_uuid(), v_ws, v_uid,
         'Weekend Engagement Post',
         E'What''s one piece of content you created this week that you''re proud of? Share below \U0001f447\n\nThe best posts get featured in our weekly newsletter \U0001f4e7',
         'text','published',
         '["twitter","instagram","linkedin"]','["ContentCreators","CommunityPost","ShareYourWork"]',ARRAY[]::text[],FALSE,
         v_now - INTERVAL '8 days',v_now - INTERVAL '8 days' + INTERVAL '1 minute',0,0,v_now,v_now),

        (gen_random_uuid(), v_ws, v_uid,
         'Platform Update: Bluesky Support',
         E'We''ve added Bluesky to ChiselPost! \U0001f98b\n\nYou can now schedule and publish to all major platforms from one dashboard.\n\nConnect your accounts at chiselpost.com/accounts',
         'text','published',
         '["twitter","linkedin","bluesky"]','["Bluesky","SocialMedia","ProductUpdate","ChiselPost"]',ARRAY[]::text[],FALSE,
         v_now - INTERVAL '12 days',v_now - INTERVAL '12 days' + INTERVAL '20 seconds',0,0,v_now,v_now),

        (gen_random_uuid(), v_ws, v_uid,
         'The Content Calendar System',
         E'After working with 500+ brands, here''s the content calendar system that consistently outperforms:\n\n\U0001f4c5 Monday: Educational\n\U0001f525 Wednesday: Engagement\n\U0001f4e3 Friday: Promotional\n\U0001f31f Sunday: Behind-the-scenes\n\nSave & try it this week!',
         'image','published',
         '["instagram","linkedin"]','["ContentCalendar","SocialMediaStrategy","MarketingPlanning"]',
         ARRAY['https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=1080&q=80']::text[],FALSE,
         v_now - INTERVAL '15 days',v_now - INTERVAL '15 days' + INTERVAL '30 seconds',0,0,v_now,v_now),

        (gen_random_uuid(), v_ws, v_uid,
         'Viral Video Tips Thread',
         E'7 secrets to making short-form videos that actually go viral:\n\n1. Hook in first 0.5 seconds\n2. No filler intro\n3. Pattern interrupts every 3-5 seconds\n4. Add text overlays (70% watch with no sound)\n5. End with clear CTA\n6. Reply to every comment in 1st hour\n7. Post 3-5x per week minimum',
         'video','published',
         '["instagram","twitter"]','["VideoMarketing","ShortFormContent","ViralTips"]',ARRAY[]::text[],TRUE,
         v_now - INTERVAL '20 days',v_now - INTERVAL '20 days' + INTERVAL '10 seconds',0,0,v_now,v_now),

        -- FAILED
        (gen_random_uuid(), v_ws, v_uid,
         'Twitter Rate Limited Post',
         E'Exciting announcement coming very soon! Can''t share details yet but this one''s going to be big \U0001f64a',
         'text','failed',
         '["twitter"]','["ComingSoon"]',ARRAY[]::text[],FALSE,
         v_now - INTERVAL '1 day',NULL,1,1,v_now,v_now),

        (gen_random_uuid(), v_ws, v_uid,
         'Instagram Token Expired',
         E'New blog post: ''10 Strategies for Growing Your Social Following in 2026'' \u2014 link in bio! \U0001f4d6',
         'text','failed',
         '["instagram"]','["ContentMarketing"]',ARRAY[]::text[],FALSE,
         v_now - INTERVAL '2 days',NULL,1,1,v_now,v_now);

      -- Backfill post_platforms rows for published/scheduled/failed posts.
      -- We join posts to social_accounts using the JSON platforms field.
      INSERT INTO post_platforms
        (id, post_id, social_account_id, platform, status, created_at, updated_at)
      SELECT
        gen_random_uuid(), p.id, sa.id, sa.platform,
        CASE p.status
          WHEN 'published' THEN 'published'
          WHEN 'failed'    THEN 'failed'
          ELSE 'pending'
        END,
        v_now, v_now
      FROM posts p
      JOIN social_accounts sa
        ON sa.workspace_id = p.workspace_id
       AND sa.deleted_at IS NULL
       AND p.platforms::jsonb ? sa.platform
      WHERE p.workspace_id = v_ws
        AND p.deleted_at IS NULL
        AND p.status IN ('published','failed','scheduled');

      RAISE NOTICE 'seed: created posts + post_platforms for workspace %', v_ws;
    ELSE
      RAISE NOTICE 'seed: posts already exist for workspace % — skipping', v_ws;
    END IF;

    -- ── 4d. AI Jobs ─────────────────────────────────────────────────────────
    -- input_data and output_data are TEXT columns (JSON stored as text) — no ::jsonb cast.
    IF (SELECT COUNT(*) FROM ai_jobs
        WHERE workspace_id = v_ws AND deleted_at IS NULL) = 0 THEN

      INSERT INTO ai_jobs
        (id, workspace_id, requested_by_id, job_type, status,
         model_used, credits_used, usd_cost,
         input_data, output_data,
         started_at, completed_at, created_at, updated_at)
      VALUES
        (gen_random_uuid(), v_ws, v_uid, 'generate_text', 'completed',
         'gpt-4o', 2, 0.003200,
         '{"platform":"twitter","topic":"AI tools for social media","tone":"professional"}',
         '{"caption":"AI is changing social media management forever. #AI #SocialMedia"}',
         v_now - INTERVAL '30 minutes', v_now - INTERVAL '30 minutes' + INTERVAL '15 seconds', v_now, v_now),

        (gen_random_uuid(), v_ws, v_uid, 'generate_text', 'completed',
         'gpt-4o', 2, 0.002800,
         '{"platform":"linkedin","topic":"B2B content strategy","tone":"thought-leader"}',
         '{"caption":"After 10 years in B2B marketing, I have learned that the brands winning on LinkedIn all prioritise education over promotion at a 4:1 ratio."}',
         v_now - INTERVAL '2 hours', v_now - INTERVAL '2 hours' + INTERVAL '15 seconds', v_now, v_now),

        (gen_random_uuid(), v_ws, v_uid, 'generate_text', 'completed',
         'gpt-4o', 2, 0.003100,
         '{"platform":"instagram","topic":"morning routine for entrepreneurs","tone":"inspirational"}',
         '{"caption":"Your 5am club is not what makes successful entrepreneurs. It is the consistency of whatever routine works for YOU. #Entrepreneur #MorningRoutine"}',
         v_now - INTERVAL '6 hours', v_now - INTERVAL '6 hours' + INTERVAL '15 seconds', v_now, v_now),

        (gen_random_uuid(), v_ws, v_uid, 'generate_text', 'completed',
         'gpt-4o', 1, 0.001500,
         '{"platform":"twitter","topic":"product launch","tone":"exciting"}',
         '{"caption":"We just shipped the feature you have been asking for. Auto-scheduling now works across ALL platforms simultaneously. Set it once, post everywhere."}',
         v_now - INTERVAL '24 hours', v_now - INTERVAL '24 hours' + INTERVAL '15 seconds', v_now, v_now),

        (gen_random_uuid(), v_ws, v_uid, 'generate_text', 'failed',
         'gpt-4o', 0, 0.000000,
         '{"platform":"bluesky","topic":"crypto","tone":"neutral"}',
         '{}',
         v_now - INTERVAL '36 hours', v_now - INTERVAL '36 hours' + INTERVAL '5 seconds', v_now, v_now),

        (gen_random_uuid(), v_ws, v_uid, 'generate_image', 'completed',
         'fal-ai/flux/schnell', 5, 0.012500,
         '{"prompt":"futuristic social media dashboard with AI elements, purple gradient","aspect_ratio":"1:1"}',
         '{"image_url":"https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=1080&q=80","seed":42}',
         v_now - INTERVAL '1 hour', v_now - INTERVAL '1 hour' + INTERVAL '15 seconds', v_now, v_now),

        (gen_random_uuid(), v_ws, v_uid, 'generate_image', 'completed',
         'fal-ai/flux/schnell', 5, 0.012500,
         '{"prompt":"professional content creator working on laptop, warm lighting, bokeh background","aspect_ratio":"4:5"}',
         '{"image_url":"https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=1080&q=80","seed":137}',
         v_now - INTERVAL '8 hours', v_now - INTERVAL '8 hours' + INTERVAL '15 seconds', v_now, v_now),

        (gen_random_uuid(), v_ws, v_uid, 'generate_image', 'processing',
         'fal-ai/flux-pro', 0, 0.000000,
         '{"prompt":"abstract data visualization, neon colors on dark background","aspect_ratio":"16:9"}',
         '{}',
         v_now - INTERVAL '5 minutes', NULL, v_now, v_now),

        (gen_random_uuid(), v_ws, v_uid, 'repurpose_content', 'completed',
         'gpt-4o', 8, 0.018000,
         '{"source_type":"url","source_url":"https://chiselpost.com/blog/ai-social-media-guide","target_platforms":["twitter","linkedin","instagram"]}',
         '{"twitter":"Just published: The definitive guide to using AI for social media in 2026. Free download.","linkedin":"I spent 3 months researching how 200+ brands use AI. Key finding: brands using AI see 31% higher engagement.","instagram":"NEW BLOG POST. The Complete AI Social Media Guide for 2026. Link in bio!"}',
         v_now - INTERVAL '12 hours', v_now - INTERVAL '12 hours' + INTERVAL '15 seconds', v_now, v_now),

        (gen_random_uuid(), v_ws, v_uid, 'repurpose_content', 'completed',
         'gpt-4o', 6, 0.015000,
         '{"source_type":"text","source_text":"10 proven strategies for growing your Instagram following organically in 2026","target_platforms":["twitter","linkedin"]}',
         '{"twitter":"10 organic Instagram growth strategies that actually work in 2026 (thread)","linkedin":"Growing on Instagram organically in 2026 is harder than ever. Here are the 10 strategies our top clients use to add 1000+ followers per month."}',
         v_now - INTERVAL '48 hours', v_now - INTERVAL '48 hours' + INTERVAL '15 seconds', v_now, v_now);

      RAISE NOTICE 'seed: created AI jobs for workspace %', v_ws;
    ELSE
      RAISE NOTICE 'seed: AI jobs already exist for workspace % — skipping', v_ws;
    END IF;

    -- ── 4e. Media Items ─────────────────────────────────────────────────────
    IF (SELECT COUNT(*) FROM media_items
        WHERE workspace_id = v_ws AND deleted_at IS NULL) = 0 THEN

      INSERT INTO media_items
        (id, workspace_id, uploaded_by_id, filename, content_type, size_bytes,
         storage_key, public_url, media_type, created_at, updated_at)
      VALUES
        (gen_random_uuid(), v_ws, v_uid, 'ai-dashboard-hero.jpg', 'image/jpeg', 245890,
         'workspaces/' || v_ws || '/media/seed-001/ai-dashboard-hero.jpg',
         'https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=1080&q=80',
         'image', v_now - INTERVAL '1 day', v_now - INTERVAL '1 day'),

        (gen_random_uuid(), v_ws, v_uid, 'content-creator-laptop.jpg', 'image/jpeg', 198340,
         'workspaces/' || v_ws || '/media/seed-002/content-creator-laptop.jpg',
         'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=1080&q=80',
         'image', v_now - INTERVAL '2 days', v_now - INTERVAL '2 days'),

        (gen_random_uuid(), v_ws, v_uid, 'analytics-growth.jpg', 'image/jpeg', 312750,
         'workspaces/' || v_ws || '/media/seed-003/analytics-growth.jpg',
         'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1080&q=80',
         'image', v_now - INTERVAL '3 days', v_now - INTERVAL '3 days'),

        (gen_random_uuid(), v_ws, v_uid, 'content-calendar.jpg', 'image/jpeg', 178920,
         'workspaces/' || v_ws || '/media/seed-004/content-calendar.jpg',
         'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=1080&q=80',
         'image', v_now - INTERVAL '4 days', v_now - INTERVAL '4 days'),

        (gen_random_uuid(), v_ws, v_uid, 'social-media-phone.jpg', 'image/jpeg', 267430,
         'workspaces/' || v_ws || '/media/seed-005/social-media-phone.jpg',
         'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=1080&q=80',
         'image', v_now - INTERVAL '5 days', v_now - INTERVAL '5 days'),

        (gen_random_uuid(), v_ws, v_uid, 'team-meeting-strategy.jpg', 'image/jpeg', 334560,
         'workspaces/' || v_ws || '/media/seed-006/team-meeting-strategy.jpg',
         'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1080&q=80',
         'image', v_now - INTERVAL '6 days', v_now - INTERVAL '6 days'),

        (gen_random_uuid(), v_ws, v_uid, 'brand-story-video.mp4', 'video/mp4', 8945000,
         'workspaces/' || v_ws || '/media/seed-007/brand-story-video.mp4',
         'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=1080&q=80',
         'video', v_now - INTERVAL '7 days', v_now - INTERVAL '7 days'),

        (gen_random_uuid(), v_ws, v_uid, 'product-demo-reel.mp4', 'video/mp4', 12340000,
         'workspaces/' || v_ws || '/media/seed-008/product-demo-reel.mp4',
         'https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=1080&q=80',
         'video', v_now - INTERVAL '8 days', v_now - INTERVAL '8 days');

      RAISE NOTICE 'seed: created media items for workspace %', v_ws;
    ELSE
      RAISE NOTICE 'seed: media items already exist for workspace % — skipping', v_ws;
    END IF;

    -- Reflect seeded AI job credits in workspace usage counter
    UPDATE workspaces
    SET ai_credits_used = (
      SELECT COALESCE(SUM(credits_used), 0)
      FROM ai_jobs
      WHERE workspace_id = v_ws AND deleted_at IS NULL
    ), updated_at = v_now
    WHERE id = v_ws;

  END LOOP;

END $$;
