-- Catalogue schema. Applied idempotently at startup (see migrate.go) and used
-- by sqlc for type generation. Keep this a single CREATE statement so it can be
-- executed in one round-trip via pgx's extended protocol.
CREATE TABLE IF NOT EXISTS products (
    id          text   PRIMARY KEY,
    name        text   NOT NULL,
    description text   NOT NULL DEFAULT '',
    brand       text   NOT NULL DEFAULT '',
    price_cents bigint NOT NULL,
    currency    text   NOT NULL DEFAULT 'USD',
    image_url   text   NOT NULL DEFAULT '',
    tags        text   NOT NULL DEFAULT ''
);
