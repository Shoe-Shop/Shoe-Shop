-- Demo catalogue. Single INSERT (one round-trip). Upserts on conflict so a
-- restart re-applies edits to name/price/imagery without a volume wipe; product
-- IDs are stable (inventory stock + carts reference them) — only presentation
-- changes. The catalogue re-indexes Postgres → Meilisearch on every boot.
INSERT INTO products (id, name, description, brand, price_cents, currency, image_url, tags) VALUES
  ('sku-aurora-runner',   'Solaris V1',      'Max-cushioned daily trainer with a sculpted air sole and a breathable engineered upper.',   'Stride', 13900, 'USD', '/img/solaris-max.png',   'running,road,max'),
  ('sku-trail-breaker',   'Pulse Trail',      'All-terrain trail runner with an exposed propulsion plate and aggressive multi-surface grip.', 'Aether', 16500, 'USD', '/img/terra-trail.png',   'trail,outdoor,grip'),
  ('sku-court-classic',   'Apex',       'High-top hoops shoe with locked-in ankle support and explosive court-ready cushioning.',    'Apex',   14900, 'USD', '/img/court-apex.png',    'basketball,court,high-top'),
  ('sku-cloud-walker',    'Veloce',       'Sock-fit knit runner wrapped in plush foam for all-day comfort and a second-skin feel.',     'Stride', 11900, 'USD', '/img/ember-knit.png',    'running,knit,daily'),
  ('sku-tempo-racer',     'Pulse',      'Carbon-plated racing flat with a high-energy foam stack, built for personal bests.',         'Stride', 22000, 'USD', '/img/tempo-racer.png',   'running,racing,carbon'),
  ('sku-summit-hiker',    'Pulse Shadow',    'Stealth daily runner with a sculpted blade midsole for a smooth, propulsive ride.',          'Summit', 15900, 'USD', '/img/shadow-runner.png', 'running,road,stealth'),
  ('sku-studio-flex',     'ION-Z',       'Mid-cut tech trainer with a layered shell and a luminous orange rail — gym to street.',       'Apex',   13900, 'USD', '/img/vortex-mid.png',    'training,mid,street'),
  ('sku-metro-slide',     'Vampire Noir',     'Stealth all-black vampire high-top with a strapped collar and a phantom-grey sole unit.',    'Apex',   12900, 'USD', '/img/onyx-high.png',     'street,vampire,high-top'),
  ('sku-pace-setter',     'Aura V1',        'Stability high-top with reactive cushioning and a luminous heel for low-light miles.',       'Stride', 16900, 'USD', '/img/flux-pace.png',     'running,stability,tech'),
  ('sku-canvas-low',      'Phantom',          'Cyber high-top with an armoured shell, reactive air heel and a future-forward silhouette.',  'Aether', 18900, 'USD', '/img/phantom.png',       'street,cyber,high-top'),
  ('sku-glacier-boot',    'ION',     'Street high-top with a glowing energy rail and a precision-locked collar.',                  'Aether', 19900, 'USD', '/img/neurovibe.png',     'street,cyber,high-top'),
  ('sku-river-sandal',    'Vampire',          'Blacked-out vampire high-top edged in bone-white, with a strap-locked midfoot and sculpted sole.', 'Apex', 17900, 'USD', '/img/vampire.png',     'street,vampire,high-top')
ON CONFLICT (id) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  brand       = EXCLUDED.brand,
  price_cents = EXCLUDED.price_cents,
  currency    = EXCLUDED.currency,
  image_url   = EXCLUDED.image_url,
  tags        = EXCLUDED.tags;
