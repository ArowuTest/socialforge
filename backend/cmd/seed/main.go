// cmd/seed — Comprehensive development/testing data seeder for SocialForge.
//
// Creates two full test user accounts with realistic data for testing every
// platform feature: AI generation, content scheduling, analytics, media,
// social accounts, and admin panel views.
//
// Users created:
//
//	User 1 (upgraded): tester_april2026@gmail.com / TestPass123!  — Pro plan
//	User 2 (new):      agency_user@chiselpost.com / AgencyPass456! — Agency plan
//
// Run locally:
//
//	DATABASE_URL=... JWT_SECRET=... go run ./cmd/seed
//
// Run on Render (via Shell):
//
//	go run ./cmd/seed
//
// The seeder is fully idempotent — safe to run multiple times.
package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/google/uuid"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"

	"github.com/socialforge/backend/internal/crypto"
)

// ── entry point ───────────────────────────────────────────────────────────────

func main() {
	_ = godotenv.Load()

	dbURL := mustEnv("DATABASE_URL")
	jwtSecret := mustEnv("JWT_SECRET")

	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		log.Fatalf("seed: open db: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("seed: ping db: %v", err)
	}

	s := &seeder{db: db, secret: jwtSecret}

	if err := s.run(); err != nil {
		log.Fatalf("seed: %v", err)
	}

	log.Println("✅ seed: all done")
}

// ── seeder ───────────────────────────────────────────────────────────────────

type seeder struct {
	db     *sql.DB
	secret string
}

func (s *seeder) run() error {
	// ── User 1: tester_april2026@gmail.com (already registered, upgrade to Pro) ──
	user1ID, ws1ID, err := s.ensureUser1()
	if err != nil {
		return fmt.Errorf("user1: %w", err)
	}

	// ── User 2: agency_user@chiselpost.com (new, agency plan) ──────────────────
	user2ID, ws2ID, err := s.ensureUser2()
	if err != nil {
		return fmt.Errorf("user2: %w", err)
	}

	// ── Seed data for both workspaces ──────────────────────────────────────────
	for _, ws := range []struct {
		userID uuid.UUID
		wsID   uuid.UUID
		label  string
	}{
		{user1ID, ws1ID, "User1/Pro"},
		{user2ID, ws2ID, "User2/Agency"},
	} {
		log.Printf("seed: seeding workspace %s (%s)…", ws.wsID, ws.label)

		if err := s.seedSocialAccounts(ws.wsID); err != nil {
			return fmt.Errorf("social accounts [%s]: %w", ws.label, err)
		}
		if err := s.seedScheduleSlots(ws.wsID); err != nil {
			return fmt.Errorf("schedule slots [%s]: %w", ws.label, err)
		}
		if err := s.seedPosts(ws.wsID, ws.userID); err != nil {
			return fmt.Errorf("posts [%s]: %w", ws.label, err)
		}
		if err := s.seedAIJobs(ws.wsID, ws.userID); err != nil {
			return fmt.Errorf("ai jobs [%s]: %w", ws.label, err)
		}
		if err := s.seedMediaItems(ws.wsID, ws.userID); err != nil {
			return fmt.Errorf("media items [%s]: %w", ws.label, err)
		}
	}

	return nil
}

// ── User 1: upgrade existing tester account ──────────────────────────────────

func (s *seeder) ensureUser1() (uuid.UUID, uuid.UUID, error) {
	const email = "tester_april2026@gmail.com"

	var userID uuid.UUID
	err := s.db.QueryRow(`SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`, email).Scan(&userID)
	if err == sql.ErrNoRows {
		return uuid.Nil, uuid.Nil, fmt.Errorf("user1 not found (%s) — register first", email)
	}
	if err != nil {
		return uuid.Nil, uuid.Nil, err
	}

	// Upgrade to pro plan with generous credits.
	_, err = s.db.Exec(`
		UPDATE users
		SET plan = 'pro', subscription_status = 'active', name = 'Test User (Pro)',
		    updated_at = NOW()
		WHERE id = $1`, userID)
	if err != nil {
		return uuid.Nil, uuid.Nil, fmt.Errorf("upgrade user1 plan: %w", err)
	}

	// Find (or create) workspace.
	wsID, err := s.ensureWorkspace(userID, "Test Workspace Pro", "test-workspace-pro", "pro")
	if err != nil {
		return uuid.Nil, uuid.Nil, err
	}

	log.Printf("seed: user1 id=%s ws=%s", userID, wsID)
	return userID, wsID, nil
}

// ── User 2: agency user ───────────────────────────────────────────────────────

func (s *seeder) ensureUser2() (uuid.UUID, uuid.UUID, error) {
	const email = "agency_user@chiselpost.com"
	const password = "AgencyPass456!"

	var userID uuid.UUID
	err := s.db.QueryRow(`SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`, email).Scan(&userID)
	if err == sql.ErrNoRows {
		// Create user.
		hash, herr := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if herr != nil {
			return uuid.Nil, uuid.Nil, fmt.Errorf("hash pw: %w", herr)
		}
		userID = uuid.New()
		now := time.Now().UTC()
		_, ierr := s.db.Exec(`
			INSERT INTO users
			    (id, email, password_hash, name, full_name, plan,
			     subscription_status, is_super_admin, is_suspended,
			     email_verified_at, created_at, updated_at)
			VALUES ($1,$2,$3,'Agency User','Agency User','agency',
			        'active',FALSE,FALSE,$4,$5,$5)`,
			userID, email, string(hash), now, now)
		if ierr != nil {
			return uuid.Nil, uuid.Nil, fmt.Errorf("insert user2: %w", ierr)
		}
		log.Printf("seed: created user2 id=%s email=%s", userID, email)
	} else if err != nil {
		return uuid.Nil, uuid.Nil, err
	} else {
		log.Printf("seed: user2 already exists id=%s", userID)
		_, _ = s.db.Exec(`UPDATE users SET plan='agency', updated_at=NOW() WHERE id=$1`, userID)
	}

	wsID, err := s.ensureWorkspace(userID, "Digital Agency Hub", "digital-agency-hub", "agency")
	if err != nil {
		return uuid.Nil, uuid.Nil, err
	}

	log.Printf("seed: user2 id=%s ws=%s", userID, wsID)
	return userID, wsID, nil
}

// ── workspace helper ─────────────────────────────────────────────────────────

func (s *seeder) ensureWorkspace(ownerID uuid.UUID, name, slug, plan string) (uuid.UUID, error) {
	var wsID uuid.UUID
	err := s.db.QueryRow(`SELECT id FROM workspaces WHERE owner_id=$1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1`, ownerID).Scan(&wsID)
	if err == sql.ErrNoRows {
		wsID = uuid.New()
		resetAt := time.Now().UTC().AddDate(0, 1, 0)
		_, err = s.db.Exec(`
			INSERT INTO workspaces
			    (id, owner_id, name, slug, plan,
			     ai_credits_used, ai_credits_limit, ai_credits_reset_at,
			     is_whitelabel, subscription_status, created_at, updated_at)
			VALUES ($1,$2,$3,$4,$5, 0, 1000, $6, FALSE,'active', NOW(), NOW())`,
			wsID, ownerID, name, slug, plan, resetAt)
		if err != nil {
			return uuid.Nil, fmt.Errorf("insert workspace %s: %w", slug, err)
		}
		// Add owner as workspace member.
		now := time.Now().UTC()
		_, _ = s.db.Exec(`
			INSERT INTO workspace_members
			    (id, workspace_id, user_id, role, accepted_at, invited_at, created_at, updated_at)
			VALUES ($1,$2,$3,'owner',$4,$4,$4,$4)
			ON CONFLICT DO NOTHING`,
			uuid.New(), wsID, ownerID, now)
		log.Printf("seed: created workspace id=%s slug=%s", wsID, slug)
	} else if err != nil {
		return uuid.Nil, err
	} else {
		// Update existing workspace plan and credits.
		_, _ = s.db.Exec(`UPDATE workspaces SET plan=$1, ai_credits_limit=1000, updated_at=NOW() WHERE id=$2`, plan, wsID)
		log.Printf("seed: workspace already exists id=%s", wsID)
	}
	return wsID, nil
}

// ── social accounts ───────────────────────────────────────────────────────────

type socialAccountSpec struct {
	platform      string
	accountID     string
	accountName   string
	accountHandle string
	accountType   string
	followerCount int64
	// Dummy OAuth tokens — encrypted with JWT_SECRET at seed time.
	// These will show connected accounts in the UI without being able to post.
	accessToken  string
	refreshToken string
}

var socialAccountSpecs = []socialAccountSpec{
	{
		platform:      "twitter",
		accountID:     "1234567890",
		accountName:   "ChiselPost Test",
		accountHandle: "@chiselpost_test",
		accountType:   "personal",
		followerCount: 4820,
		accessToken:   "AAAAAAAAAAAAAAAAAAAAA-seed-twitter-access-token-placeholder",
		refreshToken:  "seed-twitter-refresh-token-placeholder-value",
	},
	{
		platform:      "instagram",
		accountID:     "9876543210",
		accountName:   "chiselpost.test",
		accountHandle: "@chiselpost.test",
		accountType:   "business",
		followerCount: 12340,
		accessToken:   "IGQVJWseed-instagram-access-token-placeholder-value-here",
		refreshToken:  "",
	},
	{
		platform:      "linkedin",
		accountID:     "urn:li:person:seed1234",
		accountName:   "ChiselPost Company",
		accountHandle: "chiselpost-company",
		accountType:   "business",
		followerCount: 2187,
		accessToken:   "AQXseed-linkedin-access-token-placeholder-value-here-12345",
		refreshToken:  "AQXseed-linkedin-refresh-token-placeholder-12345",
	},
	{
		platform:      "bluesky",
		accountID:     "did:plc:seed1234567890abcdef",
		accountName:   "ChiselPost",
		accountHandle: "@chiselpost.bsky.social",
		accountType:   "personal",
		followerCount: 891,
		accessToken:   "seed-bluesky-session-token-placeholder-value-here",
		refreshToken:  "seed-bluesky-refresh-token-placeholder-value",
	},
}

func (s *seeder) seedSocialAccounts(wsID uuid.UUID) error {
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM social_accounts WHERE workspace_id=$1 AND deleted_at IS NULL`, wsID).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		log.Printf("seed:   social accounts already seeded (%d) — skipping", count)
		return nil
	}

	for _, spec := range socialAccountSpecs {
		encAccess, err := crypto.Encrypt(spec.accessToken, s.secret)
		if err != nil {
			return fmt.Errorf("encrypt access token (%s): %w", spec.platform, err)
		}
		encRefresh := ""
		if spec.refreshToken != "" {
			encRefresh, err = crypto.Encrypt(spec.refreshToken, s.secret)
			if err != nil {
				return fmt.Errorf("encrypt refresh token (%s): %w", spec.platform, err)
			}
		}

		_, err = s.db.Exec(`
			INSERT INTO social_accounts
			    (id, workspace_id, platform, account_id, account_name, account_handle,
			     account_type, access_token, refresh_token, is_active, follower_count,
			     scopes, created_at, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6, $7,$8,$9, TRUE,$10, '[]', NOW(), NOW())`,
			uuid.New(), wsID, spec.platform,
			spec.accountID, spec.accountName, spec.accountHandle,
			spec.accountType, encAccess, encRefresh,
			spec.followerCount,
		)
		if err != nil {
			return fmt.Errorf("insert social account %s: %w", spec.platform, err)
		}
	}

	log.Printf("seed:   created %d social accounts", len(socialAccountSpecs))
	return nil
}

// ── schedule slots ────────────────────────────────────────────────────────────

func (s *seeder) seedScheduleSlots(wsID uuid.UUID) error {
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM schedule_slots WHERE workspace_id=$1 AND deleted_at IS NULL`, wsID).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		log.Printf("seed:   schedule slots already seeded (%d) — skipping", count)
		return nil
	}

	type slotSpec struct {
		platform  string
		dayOfWeek int
		timeOfDay string
	}

	platforms := []string{"twitter", "instagram", "linkedin"}
	weekdays := []int{1, 2, 3, 4, 5} // Mon–Fri
	times := []string{"08:00", "12:00", "17:30"}

	total := 0
	for _, platform := range platforms {
		for _, dow := range weekdays {
			for _, t := range times {
				_, err := s.db.Exec(`
					INSERT INTO schedule_slots
					    (id, workspace_id, platform, day_of_week, time_of_day,
					     timezone, is_active, is_enabled, created_at, updated_at)
					VALUES ($1,$2,$3,$4,$5::time,'UTC',TRUE,TRUE,NOW(),NOW())`,
					uuid.New(), wsID, platform, dow, t)
				if err != nil {
					return fmt.Errorf("insert slot %s dow=%d t=%s: %w", platform, dow, t, err)
				}
				total++
			}
		}
	}

	// Weekend slots for Instagram only.
	for _, dow := range []int{0, 6} { // Sun, Sat
		_, err := s.db.Exec(`
			INSERT INTO schedule_slots
			    (id, workspace_id, platform, day_of_week, time_of_day,
			     timezone, is_active, is_enabled, created_at, updated_at)
			VALUES ($1,$2,'instagram',$3,'10:00'::time,'UTC',TRUE,TRUE,NOW(),NOW())`,
			uuid.New(), wsID, dow)
		if err != nil {
			return fmt.Errorf("insert weekend slot: %w", err)
		}
		total++
	}

	log.Printf("seed:   created %d schedule slots", total)
	return nil
}

// ── posts ─────────────────────────────────────────────────────────────────────

type postSpec struct {
	title       string
	content     string
	postType    string
	status      string
	platforms   []string
	hashtags    []string
	aiGenerated bool
	scheduledAt *time.Time
	publishedAt *time.Time
	mediaURLs   []string
}

func (s *seeder) seedPosts(wsID, userID uuid.UUID) error {
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM posts WHERE workspace_id=$1 AND deleted_at IS NULL`, wsID).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		log.Printf("seed:   posts already seeded (%d) — skipping", count)
		return nil
	}

	now := time.Now().UTC()
	future := func(d time.Duration) *time.Time { t := now.Add(d); return &t }
	past := func(d time.Duration) *time.Time { t := now.Add(-d); return &t }

	h := 24 * time.Hour

	posts := []postSpec{
		// Drafts
		{
			title:     "Behind the Scenes: Our AI Content Pipeline",
			content:   "Ever wondered how we generate hundreds of captions in seconds? Here's a deep dive into our AI pipeline, from prompt engineering to post scheduling. We use GPT-4o for text generation and Flux for images. 🤖\n\nThread below 👇",
			postType:  "thread",
			status:    "draft",
			platforms: []string{"twitter"},
			hashtags:  []string{"AI", "ContentMarketing", "SocialMedia", "BuildInPublic"},
		},
		{
			title:    "Product Launch Teaser",
			content:  "Something big is coming next week. We've been working on this for 3 months and we can't wait to share it. Stay tuned! 🔥",
			postType: "text",
			status:   "draft",
			platforms: []string{"twitter", "linkedin", "instagram"},
			hashtags:  []string{"ProductLaunch", "ComingSoon", "Startup"},
		},
		{
			title:    "Why Most Social Media Strategies Fail",
			content:  "After auditing 200+ brand accounts, we found 3 patterns that consistently kill social media ROI:\n\n1. Posting without a content calendar\n2. Ignoring platform-native formats\n3. No A/B testing on captions\n\nHere's how to fix each one 👇",
			postType: "text",
			status:   "draft",
			platforms: []string{"linkedin"},
			hashtags:  []string{"MarketingStrategy", "SocialMediaMarketing", "ContentStrategy"},
		},
		// Scheduled
		{
			title:       "Monday Morning Motivation",
			content:     "Start your week with a clear content strategy. Here's our 5-step framework that helped 500+ brands increase their engagement by 3x:\n\n✅ Define your ICP\n✅ Map content to buyer journey\n✅ Schedule 3x per day\n✅ Analyse weekly\n✅ Double down on winners",
			postType:    "text",
			status:      "scheduled",
			platforms:   []string{"twitter", "linkedin"},
			hashtags:    []string{"MondayMotivation", "ContentMarketing", "MarketingTips"},
			scheduledAt: future(2 * h),
		},
		{
			title:       "AI-Generated Image Showcase",
			content:     "We generated this stunning visual in under 30 seconds using our AI Image tool. Zero design skills needed. ✨\n\nTry it free at chiselpost.com",
			postType:    "image",
			status:      "scheduled",
			platforms:   []string{"instagram", "twitter"},
			hashtags:    []string{"AIArt", "DigitalMarketing", "ContentCreation"},
			aiGenerated: true,
			scheduledAt: future(6 * h),
			mediaURLs:   []string{"https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=1080&q=80"},
		},
		{
			title:       "Mid-Week Engagement Tips",
			content:     "3 ways to increase your Instagram engagement this week:\n\n1. Use carousel posts (3x more reach than single images)\n2. Post at 8am and 6pm local time\n3. Reply to every comment in the first hour\n\nSave this post 📌",
			postType:    "carousel",
			status:      "scheduled",
			platforms:   []string{"instagram"},
			hashtags:    []string{"InstagramTips", "SocialMediaTips", "EngagementHacks"},
			scheduledAt: future(26 * h),
			mediaURLs: []string{
				"https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=1080&q=80",
				"https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=1080&q=80",
				"https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=1080&q=80",
			},
		},
		{
			title:       "LinkedIn Thought Leadership Post",
			content:     "The biggest mistake brands make on LinkedIn:\n\nThey treat it like Twitter.\n\nLinkedIn rewards long-form value. Here's what actually works:\n→ Share specific data and results\n→ Tell personal stories with business lessons\n→ Engage with comments for 60 minutes after posting\n→ Avoid link posts (they kill reach)\n\nWhat's your LinkedIn strategy? Share below 👇",
			postType:    "text",
			status:      "scheduled",
			platforms:   []string{"linkedin"},
			hashtags:    []string{"LinkedIn", "B2BMarketing", "ThoughtLeadership"},
			scheduledAt: future(50 * h),
		},
		{
			title:       "Platform Feature: Auto-Scheduling",
			content:     "Did you know ChiselPost's auto-scheduler picks the BEST time to post based on your audience's activity patterns?\n\nNo more guessing. Just results. 📅\n\nSet it up in 2 minutes at chiselpost.com",
			postType:    "text",
			status:      "scheduled",
			platforms:   []string{"twitter", "instagram", "linkedin"},
			hashtags:    []string{"SocialMediaScheduling", "MarketingAutomation", "ContentPlanning"},
			scheduledAt: future(72 * h),
		},
		// Published (with past dates for analytics)
		{
			title:       "Feature Spotlight: AI Caption Generator",
			content:     "Generate platform-perfect captions in one click. Our AI knows the difference between a LinkedIn thought piece and an Instagram carousel caption.\n\nTest it free — no credit card needed. 🚀",
			postType:    "text",
			status:      "published",
			platforms:   []string{"twitter", "linkedin"},
			hashtags:    []string{"AI", "SocialMediaTools", "ContentCreation"},
			aiGenerated: true,
			scheduledAt: past(3 * h * 24),
			publishedAt: past(3*h*24 - 30*time.Second),
		},
		{
			title:       "Customer Success Story",
			content:     "How @acmebrand grew their Instagram following by 47% in 90 days using ChiselPost's scheduling and AI tools.\n\nKey tactics:\n• Posted 2x daily consistently\n• Used AI captions for every post\n• A/B tested 3 caption styles per week\n\nFull case study in bio 📊",
			postType:    "image",
			status:      "published",
			platforms:   []string{"instagram", "twitter"},
			hashtags:    []string{"CaseStudy", "SocialMediaGrowth", "CustomerSuccess"},
			scheduledAt: past(5 * h * 24),
			publishedAt: past(5*h*24 - 45*time.Second),
			mediaURLs:   []string{"https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1080&q=80"},
		},
		{
			title:       "Weekend Engagement Post",
			content:     "What's one piece of content you created this week that you're proud of? Share below 👇\n\nThe best posts get featured in our weekly newsletter 📧",
			postType:    "text",
			status:      "published",
			platforms:   []string{"twitter", "instagram", "linkedin"},
			hashtags:    []string{"ContentCreators", "CommunityPost", "ShareYourWork"},
			scheduledAt: past(8 * h * 24),
			publishedAt: past(8*h*24 - 1*time.Minute),
		},
		{
			title:       "Platform Update: Bluesky Support",
			content:     "We've added Bluesky to ChiselPost! 🦋\n\nYou can now schedule and publish to all 9 major platforms from one dashboard:\n\n• Twitter/X\n• Instagram\n• LinkedIn\n• Facebook\n• TikTok\n• YouTube\n• Pinterest\n• Threads\n• Bluesky ← NEW!\n\nConnect your accounts at chiselpost.com/accounts",
			postType:    "text",
			status:      "published",
			platforms:   []string{"twitter", "linkedin", "bluesky"},
			hashtags:    []string{"Bluesky", "SocialMedia", "ProductUpdate", "ChiselPost"},
			scheduledAt: past(12 * h * 24),
			publishedAt: past(12*h*24 - 20*time.Second),
		},
		{
			title:       "The Content Calendar System",
			content:     "After working with 500+ brands, here's the content calendar system that consistently outperforms:\n\n📅 Monday: Educational (how-to, tips)\n🔥 Wednesday: Engagement (questions, polls)\n📣 Friday: Promotional (product, CTA)\n🌟 Sunday: Behind-the-scenes\n\nSave & try it this week!",
			postType:    "image",
			status:      "published",
			platforms:   []string{"instagram", "linkedin"},
			hashtags:    []string{"ContentCalendar", "SocialMediaStrategy", "MarketingPlanning"},
			scheduledAt: past(15 * h * 24),
			publishedAt: past(15*h*24 - 30*time.Second),
			mediaURLs:   []string{"https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=1080&q=80"},
		},
		{
			title:       "Viral Video Tips Thread",
			content:     "7 secrets to making short-form videos that actually go viral:\n\n1. Hook in first 0.5 seconds\n2. No filler intro\n3. Pattern interrupts every 3-5 seconds\n4. Add text overlays (70% watch with no sound)\n5. End with clear CTA\n6. Reply to every comment in 1st hour\n7. Post 3-5x per week minimum",
			postType:    "video",
			status:      "published",
			platforms:   []string{"instagram", "twitter"},
			hashtags:    []string{"VideoMarketing", "ShortFormContent", "ViralTips", "TikTok"},
			aiGenerated: true,
			scheduledAt: past(20 * h * 24),
			publishedAt: past(20*h*24 - 10*time.Second),
		},
		// Failed
		{
			title:       "Twitter Rate Limited Post",
			content:     "Exciting announcement coming very soon! Can't share details yet but this one's going to be big 🙊",
			postType:    "text",
			status:      "failed",
			platforms:   []string{"twitter"},
			hashtags:    []string{"ComingSoon"},
			scheduledAt: past(1 * h * 24),
		},
		{
			title:       "Instagram Token Expired",
			content:     "New blog post: '10 Strategies for Growing Your Social Following in 2026' — link in bio! 📖",
			postType:    "text",
			status:      "failed",
			platforms:   []string{"instagram"},
			hashtags:    []string{"ContentMarketing"},
			scheduledAt: past(2 * h * 24),
		},
	}

	for _, p := range posts {
		id := uuid.New()
		platformsJSON, _ := json.Marshal(p.platforms)
		hashtagsJSON, _ := json.Marshal(p.hashtags)
		mediaURLsJSON, _ := json.Marshal(p.mediaURLs)

		var scheduledAt, publishedAt interface{}
		if p.scheduledAt != nil {
			scheduledAt = *p.scheduledAt
		}
		if p.publishedAt != nil {
			publishedAt = *p.publishedAt
		}

		_, err := s.db.Exec(`
			INSERT INTO posts (
				id, workspace_id, author_id, title, content, type, status,
				platforms, hashtags, media_urls,
				ai_generated, scheduled_at, published_at,
				retry_count, attempts,
				created_at, updated_at
			) VALUES (
				$1,$2,$3,$4,$5,$6,$7,
				$8,$9,$10,
				$11,$12,$13,
				0,0,
				NOW(),NOW()
			)`,
			id, wsID, userID, p.title, p.content, p.postType, p.status,
			string(platformsJSON), string(hashtagsJSON), string(mediaURLsJSON),
			p.aiGenerated, scheduledAt, publishedAt,
		)
		if err != nil {
			return fmt.Errorf("insert post %q: %w", p.title, err)
		}
	}

	log.Printf("seed:   created %d posts", len(posts))
	return nil
}

// ── AI jobs ───────────────────────────────────────────────────────────────────

type aiJobSpec struct {
	jobType     string
	status      string
	modelUsed   string
	creditsUsed int
	usdCost     float64
	inputData   map[string]interface{}
	outputData  map[string]interface{}
	hoursAgo    float64
}

func (s *seeder) seedAIJobs(wsID, userID uuid.UUID) error {
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM ai_jobs WHERE workspace_id=$1 AND deleted_at IS NULL`, wsID).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		log.Printf("seed:   AI jobs already seeded (%d) — skipping", count)
		return nil
	}

	now := time.Now().UTC()

	jobs := []aiJobSpec{
		// generate_text jobs
		{
			jobType:     "generate_text",
			status:      "completed",
			modelUsed:   "gpt-4o",
			creditsUsed: 2,
			usdCost:     0.003200,
			inputData:   map[string]interface{}{"platform": "twitter", "topic": "AI tools for social media", "tone": "professional"},
			outputData:  map[string]interface{}{"caption": "AI is changing social media management forever. Here's what the top 1% of brands are doing differently with AI-powered content creation. 🤖 #AI #SocialMedia #MarketingTools"},
			hoursAgo:    0.5,
		},
		{
			jobType:     "generate_text",
			status:      "completed",
			modelUsed:   "gpt-4o",
			creditsUsed: 2,
			usdCost:     0.002800,
			inputData:   map[string]interface{}{"platform": "linkedin", "topic": "B2B content strategy", "tone": "thought-leader"},
			outputData:  map[string]interface{}{"caption": "After 10 years in B2B marketing, I've learned that the brands winning on LinkedIn all share one trait: they prioritise education over promotion at a 4:1 ratio. Here's the framework that's generated $2M in pipeline for our clients. 📊"},
			hoursAgo:    2,
		},
		{
			jobType:     "generate_text",
			status:      "completed",
			modelUsed:   "gpt-4o",
			creditsUsed: 2,
			usdCost:     0.003100,
			inputData:   map[string]interface{}{"platform": "instagram", "topic": "morning routine for entrepreneurs", "tone": "inspirational"},
			outputData:  map[string]interface{}{"caption": "Your 5am club is not what makes successful entrepreneurs. It's the consistency of whatever routine works for YOU. Here's mine 👇 #Entrepreneur #MorningRoutine #Productivity"},
			hoursAgo:    6,
		},
		{
			jobType:     "generate_text",
			status:      "completed",
			modelUsed:   "gpt-4o",
			creditsUsed: 1,
			usdCost:     0.001500,
			inputData:   map[string]interface{}{"platform": "twitter", "topic": "product launch", "tone": "exciting"},
			outputData:  map[string]interface{}{"caption": "We just shipped the feature you've been asking for. Auto-scheduling now works across ALL 9 platforms simultaneously. Set it once, post everywhere. 🚀 Try it now at chiselpost.com"},
			hoursAgo:    24,
		},
		{
			jobType:     "generate_text",
			status:      "failed",
			modelUsed:   "gpt-4o",
			creditsUsed: 0,
			usdCost:     0.000000,
			inputData:   map[string]interface{}{"platform": "bluesky", "topic": "crypto", "tone": "neutral"},
			outputData:  nil,
			hoursAgo:    36,
		},
		// generate_image jobs
		{
			jobType:     "generate_image",
			status:      "completed",
			modelUsed:   "fal-ai/flux/schnell",
			creditsUsed: 5,
			usdCost:     0.012500,
			inputData:   map[string]interface{}{"prompt": "futuristic social media dashboard with AI elements, purple gradient, minimal design, 4k", "aspect_ratio": "1:1"},
			outputData:  map[string]interface{}{"image_url": "https://fal.media/files/placeholder-generated-image-1.jpg", "seed": 42},
			hoursAgo:    1,
		},
		{
			jobType:     "generate_image",
			status:      "completed",
			modelUsed:   "fal-ai/flux/schnell",
			creditsUsed: 5,
			usdCost:     0.012500,
			inputData:   map[string]interface{}{"prompt": "professional content creator working on laptop, warm lighting, bokeh background", "aspect_ratio": "4:5"},
			outputData:  map[string]interface{}{"image_url": "https://fal.media/files/placeholder-generated-image-2.jpg", "seed": 137},
			hoursAgo:    8,
		},
		{
			jobType:     "generate_image",
			status:      "processing",
			modelUsed:   "fal-ai/flux-pro",
			creditsUsed: 0,
			usdCost:     0.000000,
			inputData:   map[string]interface{}{"prompt": "abstract data visualization, neon colors on dark background", "aspect_ratio": "16:9"},
			outputData:  nil,
			hoursAgo:    0.1,
		},
		// repurpose jobs
		{
			jobType:     "repurpose_content",
			status:      "completed",
			modelUsed:   "gpt-4o",
			creditsUsed: 8,
			usdCost:     0.018000,
			inputData:   map[string]interface{}{"source_type": "url", "source_url": "https://chiselpost.com/blog/ai-social-media-guide", "target_platforms": []string{"twitter", "linkedin", "instagram"}},
			outputData: map[string]interface{}{
				"twitter":   "Just published: The definitive guide to using AI for social media in 2026. 47 pages of strategies, templates, and real examples from 200+ brands. Free download 👇 chiselpost.com/blog/ai-guide",
				"linkedin":  "I spent 3 months researching how 200+ brands use AI for social media content. The results surprised me. Key finding: brands using AI for caption generation see 31% higher engagement on average. Here's what separates the top performers...",
				"instagram": "NEW BLOG POST ✨ 'The Complete AI Social Media Guide for 2026' — everything you need to know about using AI tools to create, schedule, and analyse your content. Link in bio! 📖 #ContentMarketing #AI #SocialMedia",
			},
			hoursAgo: 12,
		},
		{
			jobType:     "repurpose_content",
			status:      "completed",
			modelUsed:   "gpt-4o",
			creditsUsed: 6,
			usdCost:     0.015000,
			inputData:   map[string]interface{}{"source_type": "text", "source_text": "10 proven strategies for growing your Instagram following organically in 2026...", "target_platforms": []string{"twitter", "linkedin"}},
			outputData: map[string]interface{}{
				"twitter":  "10 organic Instagram growth strategies that actually work in 2026 (thread) 🧵",
				"linkedin": "Growing on Instagram organically in 2026 is harder than ever — but not impossible. Here are the 10 strategies our top clients are using right now to add 1000+ followers per month...",
			},
			hoursAgo: 48,
		},
	}

	for _, j := range jobs {
		id := uuid.New()
		startedAt := now.Add(-time.Duration(j.hoursAgo * float64(time.Hour)))
		completedAt := startedAt.Add(15 * time.Second)

		inputJSON := "{}"
		if j.inputData != nil {
			b, _ := json.Marshal(j.inputData)
			inputJSON = string(b)
		}
		outputJSON := "{}"
		if j.outputData != nil {
			b, _ := json.Marshal(j.outputData)
			outputJSON = string(b)
		}

		var startedAtPtr, completedAtPtr interface{}
		if j.status == "completed" || j.status == "failed" || j.status == "processing" {
			startedAtPtr = startedAt
		}
		if j.status == "completed" || j.status == "failed" {
			completedAtPtr = completedAt
		}

		_, err := s.db.Exec(`
			INSERT INTO ai_jobs
			    (id, workspace_id, requested_by_id, job_type, status,
			     model_used, credits_used, usd_cost,
			     input_data, output_data,
			     started_at, completed_at,
			     created_at, updated_at)
			VALUES ($1,$2,$3,$4,$5, $6,$7,$8, $9,$10, $11,$12, $13,$13)`,
			id, wsID, userID, j.jobType, j.status,
			j.modelUsed, j.creditsUsed, j.usdCost,
			inputJSON, outputJSON,
			startedAtPtr, completedAtPtr,
			startedAt,
		)
		if err != nil {
			return fmt.Errorf("insert ai job %s: %w", j.jobType, err)
		}
	}

	// Update workspace credits used based on actual AI job spend.
	_, _ = s.db.Exec(`
		UPDATE workspaces
		SET ai_credits_used = (
			SELECT COALESCE(SUM(credits_used), 0)
			FROM ai_jobs
			WHERE workspace_id = $1 AND deleted_at IS NULL
		), updated_at = NOW()
		WHERE id = $1`, wsID)

	log.Printf("seed:   created %d AI jobs", len(jobs))
	return nil
}

// ── media items ───────────────────────────────────────────────────────────────

func (s *seeder) seedMediaItems(wsID, userID uuid.UUID) error {
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM media_items WHERE workspace_id=$1`, wsID).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		log.Printf("seed:   media items already seeded (%d) — skipping", count)
		return nil
	}

	type mediaSpec struct {
		filename    string
		contentType string
		sizeBytes   int64
		mediaType   string
		publicURL   string
	}

	items := []mediaSpec{
		{
			filename:    "hero-banner-q1-2026.jpg",
			contentType: "image/jpeg",
			sizeBytes:   284720,
			mediaType:   "image",
			publicURL:   "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=1080&q=80",
		},
		{
			filename:    "product-screenshot-dashboard.png",
			contentType: "image/png",
			sizeBytes:   512000,
			mediaType:   "image",
			publicURL:   "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1080&q=80",
		},
		{
			filename:    "team-photo-2026.jpg",
			contentType: "image/jpeg",
			sizeBytes:   198400,
			mediaType:   "image",
			publicURL:   "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1080&q=80",
		},
		{
			filename:    "ai-generated-visual-1.jpg",
			contentType: "image/jpeg",
			sizeBytes:   156800,
			mediaType:   "image",
			publicURL:   "https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=1080&q=80",
		},
		{
			filename:    "content-calendar-infographic.png",
			contentType: "image/png",
			sizeBytes:   384000,
			mediaType:   "image",
			publicURL:   "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=1080&q=80",
		},
		{
			filename:    "case-study-results-chart.jpg",
			contentType: "image/jpeg",
			sizeBytes:   228352,
			mediaType:   "image",
			publicURL:   "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1080&q=80",
		},
		{
			filename:    "product-demo-short.mp4",
			contentType: "video/mp4",
			sizeBytes:   8388608,
			mediaType:   "video",
			publicURL:   "https://www.w3schools.com/html/mov_bbb.mp4",
		},
		{
			filename:    "brand-logo-white.png",
			contentType: "image/png",
			sizeBytes:   24576,
			mediaType:   "image",
			publicURL:   "https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=400&q=80",
		},
	}

	for i, item := range items {
		storageKey := fmt.Sprintf("workspaces/%s/media/seed-%d/%s", wsID, i+1, item.filename)
		_, err := s.db.Exec(`
			INSERT INTO media_items
			    (id, workspace_id, uploaded_by_id,
			     filename, content_type, size_bytes,
			     storage_key, public_url, media_type,
			     created_at, updated_at)
			VALUES ($1,$2,$3, $4,$5,$6, $7,$8,$9, NOW(),NOW())`,
			uuid.New(), wsID, userID,
			item.filename, item.contentType, item.sizeBytes,
			storageKey, item.publicURL, item.mediaType,
		)
		if err != nil {
			return fmt.Errorf("insert media item %s: %w", item.filename, err)
		}
	}

	log.Printf("seed:   created %d media items", len(items))
	return nil
}

// ── utilities ─────────────────────────────────────────────────────────────────

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("seed: required env var %q not set", key)
	}
	return v
}
