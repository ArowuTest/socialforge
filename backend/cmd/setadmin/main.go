// cmd/setadmin — One-shot tool to make any existing user a super admin OR
// to (re)set the super-admin account's password.
//
// Usage:
//
//	# Promote an existing user (does NOT change password)
//	go run ./cmd/setadmin -email some.user@example.com -promote
//
//	# Reset password and ensure super-admin (creates account if it doesn't exist)
//	go run ./cmd/setadmin -email admin@chiselpost.com -password "NewSecurePass123!" -reset
//
// Run on Render:
//
//	go run ./cmd/setadmin -email admin@chiselpost.com -password 'AdminPass789!' -reset
package main

import (
	"database/sql"
	"flag"
	"log"
	"os"
	"time"

	"github.com/google/uuid"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	_ = godotenv.Load()

	var (
		email    = flag.String("email", "", "user email (required)")
		password = flag.String("password", "", "new password (required with -reset)")
		promote  = flag.Bool("promote", false, "promote existing user to super_admin without changing password")
		reset    = flag.Bool("reset", false, "create or reset the user with password and super_admin=true")
	)
	flag.Parse()

	if *email == "" {
		log.Fatal("setadmin: -email is required")
	}
	if !*promote && !*reset {
		log.Fatal("setadmin: pass either -promote or -reset")
	}
	if *reset && *password == "" {
		log.Fatal("setadmin: -reset requires -password")
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("setadmin: DATABASE_URL env var not set")
	}

	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		log.Fatalf("setadmin: open db: %v", err)
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		log.Fatalf("setadmin: ping db: %v", err)
	}

	var userID uuid.UUID
	err = db.QueryRow(`SELECT id FROM users WHERE email=$1 AND deleted_at IS NULL`, *email).Scan(&userID)

	if *promote {
		if err == sql.ErrNoRows {
			log.Fatalf("setadmin: user with email %q not found", *email)
		}
		if err != nil {
			log.Fatalf("setadmin: lookup user: %v", err)
		}
		_, err = db.Exec(`UPDATE users SET is_super_admin=TRUE, updated_at=NOW() WHERE id=$1`, userID)
		if err != nil {
			log.Fatalf("setadmin: promote: %v", err)
		}
		log.Printf("✅ promoted user %s (id=%s) to super_admin", *email, userID)
		return
	}

	// -reset path: create or overwrite password
	hash, herr := bcrypt.GenerateFromPassword([]byte(*password), bcrypt.DefaultCost)
	if herr != nil {
		log.Fatalf("setadmin: hash pw: %v", herr)
	}

	if err == sql.ErrNoRows {
		userID = uuid.New()
		now := time.Now().UTC()
		_, err = db.Exec(`
			INSERT INTO users
			    (id, email, password_hash, name, full_name, plan,
			     subscription_status, is_super_admin, is_suspended,
			     email_verified_at, created_at, updated_at)
			VALUES ($1,$2,$3,'Platform Admin','Platform Admin','agency',
			        'active',TRUE,FALSE,$4,$5,$5)`,
			userID, *email, string(hash), now, now)
		if err != nil {
			log.Fatalf("setadmin: create user: %v", err)
		}
		log.Printf("✅ created super admin id=%s email=%s", userID, *email)
		return
	}
	if err != nil {
		log.Fatalf("setadmin: lookup user: %v", err)
	}

	// User exists — reset password and ensure super_admin=true
	_, err = db.Exec(`
		UPDATE users
		SET password_hash=$1, is_super_admin=TRUE, is_suspended=FALSE,
		    subscription_status='active', updated_at=NOW()
		WHERE id=$2`, string(hash), userID)
	if err != nil {
		log.Fatalf("setadmin: reset password: %v", err)
	}
	log.Printf("✅ reset password and ensured super_admin for %s (id=%s)", *email, userID)
}
