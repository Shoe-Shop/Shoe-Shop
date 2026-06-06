-- Payment service schema (ADR-0003 §6). Idempotent: safe to run on every startup
-- (mirrors the inventory/orders convention — CREATE TABLE IF NOT EXISTS). One row
-- per saga decision; UNIQUE(order_id) is the idempotency guard so a redelivered
-- payment.authorize re-publishes the prior decision instead of charging twice.
CREATE TABLE IF NOT EXISTS payments (
    authorization_id UUID PRIMARY KEY,
    order_id         UUID        NOT NULL UNIQUE,
    amount_cents     BIGINT      NOT NULL,
    currency         TEXT        NOT NULL,
    -- AUTHORIZED | DECLINED | VOIDED
    status           TEXT        NOT NULL,
    -- decline/void reason; NULL when AUTHORIZED
    reason           TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
