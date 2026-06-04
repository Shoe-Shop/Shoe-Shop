-- Demo stock for the seeded catalogue SKUs. Single INSERT (one round-trip),
-- idempotent via ON CONFLICT. Quantities are deliberately varied: a couple of
-- scarce SKUs (tempo-racer, glacier-boot) make oversell / reservation-rejected
-- incident scenarios easy to trigger from real checkout traffic.
INSERT INTO stock (product_id, on_hand, reserved) VALUES
  ('sku-aurora-runner', 120, 0),
  ('sku-trail-breaker',  64, 0),
  ('sku-court-classic',  90, 0),
  ('sku-cloud-walker',   75, 0),
  ('sku-tempo-racer',     3, 0),
  ('sku-summit-hiker',   42, 0),
  ('sku-studio-flex',    58, 0),
  ('sku-metro-slide',   110, 0),
  ('sku-pace-setter',    47, 0),
  ('sku-canvas-low',     95, 0),
  ('sku-glacier-boot',    5, 0),
  ('sku-river-sandal',   38, 0)
ON CONFLICT (product_id) DO NOTHING;
