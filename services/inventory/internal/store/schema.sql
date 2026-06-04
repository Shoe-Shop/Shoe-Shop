-- Inventory schema. Applied idempotently at startup (see migrate.go) and used by
-- sqlc for type generation. One row per product SKU.
--
-- available (sellable now) is derived as on_hand - reserved. A reservation made
-- by the checkout saga increments `reserved` (lowering availability); a release
-- (compensation) decrements it. Reservations persist past order confirmation in
-- v0.3 — converting reserved stock to shipped (decrementing on_hand) is a later
-- fulfilment milestone (Shipping), not modelled here.
CREATE TABLE IF NOT EXISTS stock (
    product_id text    PRIMARY KEY,
    on_hand    integer NOT NULL DEFAULT 0,
    reserved   integer NOT NULL DEFAULT 0,
    CONSTRAINT on_hand_nonneg  CHECK (on_hand  >= 0),
    CONSTRAINT reserved_nonneg CHECK (reserved >= 0)
);
