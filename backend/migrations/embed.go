// Package migrations embeds all SQL migration files for use by the embedded
// migration runner in internal/database. The embedded FS is included at compile
// time so the binary is self-contained and does not require the migrations
// directory to exist at runtime.
package migrations

import "embed"

// FS contains all *.sql migration files embedded at build time.
//
//go:embed *.sql
var FS embed.FS
