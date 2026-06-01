package store

import (
	"context"
	_ "embed"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed schema.sql
var schemaSQL string

//go:embed seed.sql
var seedSQL string

// Migrate creates the catalogue schema and loads demo data. It is idempotent:
// the schema uses CREATE TABLE IF NOT EXISTS and the seed uses ON CONFLICT DO
// NOTHING, so it is safe to run on every startup.
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	if _, err := pool.Exec(ctx, schemaSQL); err != nil {
		return err
	}
	if _, err := pool.Exec(ctx, seedSQL); err != nil {
		return err
	}
	return nil
}
