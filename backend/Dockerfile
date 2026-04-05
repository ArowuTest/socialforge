# =============================================================================
# Stage 1: builder
# =============================================================================
FROM golang:1.22-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /build

# Download dependencies first (leverages layer caching)
COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the source
COPY . .

# Build the binary — static, no CGO for minimal alpine image
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build \
    -ldflags="-w -s -X main.version=$(git describe --tags --always --dirty 2>/dev/null || echo dev)" \
    -o socialforge-api \
    ./cmd/api

# =============================================================================
# Stage 2: runner
# =============================================================================
FROM alpine:3.19 AS runner

# Security: keep CA certs and timezone data
RUN apk add --no-cache ca-certificates tzdata && \
    update-ca-certificates

# Non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser  -u 1001 -S appuser -G appgroup

WORKDIR /app

# Copy only the compiled binary from the builder
COPY --from=builder /build/socialforge-api .

# Copy migrations so the binary can run them at startup if desired
COPY --from=builder /build/migrations ./migrations

# Own everything as the non-root user
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 8080

ENTRYPOINT ["./socialforge-api"]
