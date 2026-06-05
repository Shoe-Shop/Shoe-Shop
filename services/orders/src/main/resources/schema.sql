-- Orders schema. Applied idempotently on every startup by Spring Boot SQL init
-- (spring.sql.init.mode=always), mirroring the Go services' startup migrate.
-- An order is the system of record for a checkout; its `status` is the saga state
-- machine (ADR-0003 §2). Order lines are immutable once placed.
CREATE TABLE IF NOT EXISTS orders (
    id          uuid        PRIMARY KEY,
    user_id     text        NOT NULL,
    status      text        NOT NULL,
    total_cents bigint      NOT NULL,
    currency    text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
    order_id         uuid    NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id       text    NOT NULL,
    quantity         integer NOT NULL,
    unit_price_cents bigint  NOT NULL,
    PRIMARY KEY (order_id, product_id)
);
