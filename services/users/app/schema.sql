-- Users schema. Applied idempotently at startup (see db.py). Kept simple so it
-- runs in a single round-trip. gen_random_uuid() is built into PostgreSQL 13+
-- core, so no extension is required.
CREATE TABLE IF NOT EXISTS users (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    email      text        NOT NULL UNIQUE,
    full_name  text        NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);
