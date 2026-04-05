.PHONY: dev build test migrate lint docker-up docker-down seed \
        backend-build frontend-build backend-test frontend-test \
        backend-lint frontend-lint tidy clean help

# Default target
.DEFAULT_GOAL := help

# ─── Docker ──────────────────────────────────────────────────────────────────

## Start full stack in development mode (with hot reload, pgAdmin, Redis Commander)
dev:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

## Start full stack in production mode (detached)
docker-up:
	docker-compose up -d

## Stop and remove all containers (keeps volumes)
docker-down:
	docker-compose down

## Stop containers AND remove all volumes (destructive!)
docker-clean:
	docker-compose down -v

## Rebuild all images without cache
docker-rebuild:
	docker-compose build --no-cache

# ─── Build ───────────────────────────────────────────────────────────────────

## Build both backend and frontend
build: backend-build frontend-build

## Build the Go binary
backend-build:
	cd backend && go build -o bin/socialforge-api ./cmd/api

## Build the Next.js app
frontend-build:
	cd frontend && npm run build

# ─── Test ────────────────────────────────────────────────────────────────────

## Run all tests
test: backend-test frontend-test

## Run Go tests with race detector and coverage
backend-test:
	cd backend && go test -race -coverprofile=coverage.out ./...
	cd backend && go tool cover -func=coverage.out

## Run Next.js / Jest tests
frontend-test:
	cd frontend && npm test -- --passWithNoTests

# ─── Lint ────────────────────────────────────────────────────────────────────

## Lint both backend and frontend
lint: backend-lint frontend-lint

## Run golangci-lint on the backend
backend-lint:
	cd backend && golangci-lint run ./...

## Run ESLint + TypeScript compiler checks on the frontend
frontend-lint:
	cd frontend && npm run lint
	cd frontend && npx tsc --noEmit

# ─── Database ────────────────────────────────────────────────────────────────

## Run pending SQL migrations
migrate:
	cd backend && go run ./cmd/migrate

## Seed the database with dev data
seed:
	cd backend && go run ./cmd/seed

# ─── Dependency management ───────────────────────────────────────────────────

## Tidy Go modules
tidy:
	cd backend && go mod tidy

## Install frontend dependencies
install:
	cd frontend && npm ci

# ─── Cleanup ─────────────────────────────────────────────────────────────────

## Remove build artifacts
clean:
	rm -rf backend/bin
	rm -rf frontend/.next

# ─── Help ────────────────────────────────────────────────────────────────────

## Show this help message
help:
	@echo ""
	@echo "SocialForge — available make targets:"
	@echo ""
	@grep -E '^## ' Makefile | sed 's/^## /  /' | paste - <(grep -E '^[a-zA-Z_-]+:' Makefile | sed 's/:.*//' | head -n $$(grep -c '^## ' Makefile))
	@echo ""
