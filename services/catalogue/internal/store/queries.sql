-- name: ListAllProducts :many
SELECT id, name, description, brand, price_cents, currency, image_url, tags
FROM products
ORDER BY name;

-- name: GetProduct :one
SELECT id, name, description, brand, price_cents, currency, image_url, tags
FROM products
WHERE id = $1;
