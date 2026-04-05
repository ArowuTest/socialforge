// cmd/seed — Development data seeder for SocialForge.
//
// Creates a known set of fixtures useful for local development and testing:
//
//   - 1 admin user       (admin@socialforge.io / admin123)
//   - 1 workspace        "Demo Agency"
//   - Schedule slots     Instagram + LinkedIn, Mon–Fri at 09:00 / 12:00 / 17:00
//   - 10 sample posts    spread across draft, scheduled, published, failed
//
// The seeder is idempotent: running it multiple times will not create
// duplicate records (it checks for existing email / workspace slug first).
package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/joho/godotenv"
	_ "github.com/jackc/pgx/v5/stdlib"
	"golang.org/x/crypto/bcrypt"
)

// ----------------------------------------------------------------------------
// Entry point
// ----------------------------------------------------------------------------

func main() {
	_ = godotenv.Load()

	dbURL := mustEnv("DATABASE_URL")

	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		log.Fatalf("seed: open db: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("seed: ping db: %v", err)
	}

	if err := seed(db); err != nil {
		log.Fatalf("seed: %v", err)
	}

	log.Println("seed: done")
}

// ----------------------------------------------------------------------------
// Seed orchestrator
// ----------------------------------------------------------------------------

func seed(db *sql.DB) error {
	userID, err := upsertAdminUser(db)
	if err != nil {
		return fmt.Errorf("upsert admin user: %w", err)
	}

	workspaceID, err := upsertWorkspace(db, userID)
	if err != nil {
		return fmt.Errorf("upsert workspace: %w", err)
	}

	if err := upsertWorkspaceMember(db, workspaceID, userID); err != nil {
		return fmt.Errorf("upsert workspace member: %w", err)
	}

	if err := seedScheduleSlots(db, workspaceID); err != nil {
		return fmt.Errorf("seed schedule slots: %w", err)
	}

	if err := seedPosts(db, workspaceID, userID); err != nil {
		return fmt.Errorf("seed posts: %w", err)
	}

	return nil
}

// ----------------------------------------------------------------------------
// Admin user
// ----------------------------------------------------------------------------

func upsertAdminUser(db *sql.DB) (uuid.UUID, error) {
	const email = "admin@socialforge.io"
	const password = "admin123"

	// Check if already exists
	var existing uuid.UUID
	err := db.QueryRow(
		`SELECT id FROM users WHERE email = $1`, email,
	).Scan(&existing)
	if err == nil {
		log.Printf("seed: user already exists id=%s", existing)
		return existing, nil
	}
	if err != sql.ErrNoRows {
		return uuid.Nil, err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return uuid.Nil, fmt.Errorf("hash password: %w", err)
	}

	id := uuid.New()
	_, err = db.Exec(`
		INSERT INTO users (
			id, email, password_hash, full_name, plan,
			subscription_status, email_verified, created_at, updated_at
		) VALUES ($1, $2, $3, $4, 'agency', 'active', TRUE, NOW(), NOW())`,
		id, email, string(hash), "Admin User",
	)
	if err != nil {
		return uuid.Nil, err
	}

	log.Printf("seed: created user id=%s email=%s", id, email)
	return id, nil
}

// ----------------------------------------------------------------------------
// Workspace
// ----------------------------------------------------------------------------

func upsertWorkspace(db *sql.DB, ownerID uuid.UUID) (uuid.UUID, error) {
	const slug = "demo-agency"

	var existing uuid.UUID
	err := db.QueryRow(
		`SELECT id FROM workspaces WHERE slug = $1`, slug,
	).Scan(&existing)
	if err == nil {
		log.Printf("seed: workspace already exists id=%s", existing)
		return existing, nil
	}
	if err != sql.ErrNoRows {
		return uuid.Nil, err
	}

	id := uuid.New()
	_, err = db.Exec(`
		INSERT INTO workspaces (
			id, owner_id, name, slug, plan, timezone,
			ai_credits_used, ai_credits_reset_at, created_at, updated_at
		) VALUES ($1, $2, 'Demo Agency', $3, 'agency', 'America/New_York',
		          0, (NOW() + INTERVAL '1 month'), NOW(), NOW())`,
		id, ownerID, slug,
	)
	if err != nil {
		return uuid.Nil, err
	}

	log.Printf("seed: created workspace id=%s slug=%s", id, slug)
	return id, nil
}

// ----------------------------------------------------------------------------
// Workspace membership
// ----------------------------------------------------------------------------

func upsertWorkspaceMember(db *sql.DB, workspaceID, userID uuid.UUID) error {
	_, err := db.Exec(`
		INSERT INTO workspace_members (workspace_id, user_id, role, accepted_at)
		VALUES ($1, $2, 'owner', NOW())
		ON CONFLICT (workspace_id, user_id) DO NOTHING`,
		workspaceID, userID,
	)
	return err
}

// ----------------------------------------------------------------------------
// Schedule slots
// ----------------------------------------------------------------------------

type slot struct {
	platform   string
	dayOfWeek  int    // 0 = Sunday
	timeOfDay  string // HH:MM
}

func seedScheduleSlots(db *sql.DB, workspaceID uuid.UUID) error {
	// Check if slots already exist for this workspace
	var count int
	if err := db.QueryRow(
		`SELECT COUNT(*) FROM schedule_slots WHERE workspace_id = $1`, workspaceID,
	).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		log.Printf("seed: schedule slots already exist (%d rows) — skipping", count)
		return nil
	}

	platforms := []string{"instagram", "linkedin"}
	// Mon–Fri (1–5) at 09:00, 12:00, 17:00
	weekdays := []int{1, 2, 3, 4, 5}
	times := []string{"09:00", "12:00", "17:00"}

	for _, platform := range platforms {
		for _, dow := range weekdays {
			for _, t := range times {
				_, err := db.Exec(`
					INSERT INTO schedule_slots
					    (id, workspace_id, platform, day_of_week, time_of_day, is_enabled)
					VALUES ($1, $2, $3, $4, $5::time, TRUE)`,
					uuid.New(), workspaceID, platform, dow, t,
				)
				if err != nil {
					return fmt.Errorf("insert slot %s dow=%d time=%s: %w", platform, dow, t, err)
				}
			}
		}
	}

	log.Printf("seed: created %d schedule slots", len(platforms)*len(weekdays)*len(times))
	return nil
}

// ----------------------------------------------------------------------------
// Sample posts
// ----------------------------------------------------------------------------

type postSpec struct {
	title       string
	caption     string
	status      string
	scheduledAt *time.Time
	publishedAt *time.Time
}

func seedPosts(db *sql.DB, workspaceID, userID uuid.UUID) error {
	var count int
	if err := db.QueryRow(
		`SELECT COUNT(*) FROM posts WHERE workspace_id = $1`, workspaceID,
	).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		log.Printf("seed: posts already exist (%d rows) — skipping", count)
		return nil
	}

	now := time.Now().UTC()

	future := func(d time.Duration) *time.Time { t := now.Add(d); return &t }
	past := func(d time.Duration) *time.Time { t := now.Add(-d); return &t }

	posts := []postSpec{
		{
			title:   "Behind the scenes",
			caption: "Take a peek behind the scenes at how we build SocialForge! 🚀 #startup #buildinpublic",
			status:  "draft",
		},
		{
			title:   "Product launch teaser",
			caption: "Something big is coming. Stay tuned. 🔥 #launch #socialmedia",
			status:  "draft",
		},
		{
			title:   "Monday motivation",
			caption: "Start your week with a clear content strategy. Here's our 5-step framework 👇 #contentmarketing #mondaymotivation",
			status:  "scheduled",
			scheduledAt: future(2 * time.Hour),
		},
		{
			title:   "Mid-week tips",
			caption: "3 ways to increase your Instagram engagement this week. Thread 🧵",
			status:  "scheduled",
			scheduledAt: future(26 * time.Hour),
		},
		{
			title:   "AI content roundup",
			caption: "We generated 100 captions with AI last month. Here's what we learned 🤖 #AI #contentcreation",
			status:  "scheduled",
			scheduledAt: future(50 * time.Hour),
		},
		{
			title:   "Feature spotlight: Scheduling",
			caption: "Did you know you can schedule posts to 8+ platforms from one dashboard? Learn more at socialforge.io 📅",
			status:  "published",
			scheduledAt: past(3 * 24 * time.Hour),
			publishedAt: past(3*24*time.Hour - 2*time.Second),
		},
		{
			title:   "Customer story",
			caption: "How @demobrand grew their Instagram by 40% in 60 days using SocialForge 📈 #casestudy",
			status:  "published",
			scheduledAt: past(5 * 24 * time.Hour),
			publishedAt: past(5*24*time.Hour - 2*time.Second),
		},
		{
			title:   "Weekend wrap-up",
			caption: "What did you create this week? Share your best post in the comments! 💬",
			status:  "published",
			scheduledAt: past(8 * 24 * time.Hour),
			publishedAt: past(8*24*time.Hour - 2*time.Second),
		},
		{
			title:   "Platform outage post",
			caption: "Exciting news coming soon 🙊",
			status:  "failed",
			scheduledAt: past(1 * 24 * time.Hour),
		},
		{
			title:   "Evergreen tip",
			caption: "Consistency > perfection. Post regularly, optimise over time. #socialmediatips",
			status:  "draft",
		},
	}

	for _, p := range posts {
		id := uuid.New()
		var scheduledAt, publishedAt interface{}
		if p.scheduledAt != nil {
			scheduledAt = *p.scheduledAt
		}
		if p.publishedAt != nil {
			publishedAt = *p.publishedAt
		}

		_, err := db.Exec(`
			INSERT INTO posts (
				id, workspace_id, created_by, title, caption,
				status, scheduled_at, published_at,
				ai_generated, media_type, media_urls,
				created_at, updated_at
			) VALUES (
				$1, $2, $3, $4, $5,
				$6, $7, $8,
				FALSE, 'none', '{}',
				NOW(), NOW()
			)`,
			id, workspaceID, userID, p.title, p.caption,
			p.status, scheduledAt, publishedAt,
		)
		if err != nil {
			return fmt.Errorf("insert post %q: %w", p.title, err)
		}
	}

	log.Printf("seed: created %d sample posts", len(posts))
	return nil
}

// ----------------------------------------------------------------------------
// Utilities
// ----------------------------------------------------------------------------

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("seed: required environment variable %q is not set", key)
	}
	return v
}
