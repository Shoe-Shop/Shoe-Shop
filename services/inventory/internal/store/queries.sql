-- name: GetStock :one
SELECT product_id, on_hand, reserved
FROM stock
WHERE product_id = sqlc.arg(product_id);

-- name: ListStockByIDs :many
SELECT product_id, on_hand, reserved
FROM stock
WHERE product_id = ANY(sqlc.arg(product_ids)::text[]);

-- ReserveStock atomically holds `quantity` units: it succeeds (returns the row)
-- only when enough is sellable (on_hand - reserved >= quantity), otherwise it
-- matches no row and returns pgx.ErrNoRows — the saga's "insufficient stock"
-- signal. Callers run all of an order's items in one transaction so a partial
-- order never half-reserves.
-- name: ReserveStock :one
UPDATE stock
SET reserved = reserved + sqlc.arg(quantity)
WHERE product_id = sqlc.arg(product_id)
  AND on_hand - reserved >= sqlc.arg(quantity)
RETURNING product_id, on_hand, reserved;

-- ReleaseStock undoes a hold (compensation). GREATEST clamps at zero so a
-- duplicate/late release can never drive reserved negative (idempotent-safe).
-- name: ReleaseStock :one
UPDATE stock
SET reserved = GREATEST(reserved - sqlc.arg(quantity), 0)
WHERE product_id = sqlc.arg(product_id)
RETURNING product_id, on_hand, reserved;
