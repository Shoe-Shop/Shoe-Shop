-- Demo catalogue. Single INSERT (one round-trip) and idempotent via ON CONFLICT.
INSERT INTO products (id, name, description, brand, price_cents, currency, image_url, tags) VALUES
  ('sku-aurora-runner',   'Aurora Runner',        'Lightweight daily trainer with a responsive foam midsole.',          'Hballo',     12900, 'USD', '/img/aurora-runner.png',   'running,road,neutral'),
  ('sku-trail-breaker',   'Trail Breaker GTX',    'Waterproof trail shoe with aggressive lugs for wet terrain.',        'Hballo',     16500, 'USD', '/img/trail-breaker.png',   'trail,waterproof,grip'),
  ('sku-court-classic',   'Court Classic',        'Heritage leather sneaker that pairs with anything.',                 'Vellum',      9900, 'USD', '/img/court-classic.png',   'lifestyle,leather,casual'),
  ('sku-cloud-walker',    'Cloud Walker',         'Slip-on knit shoe engineered for all-day comfort.',                  'Vellum',     10900, 'USD', '/img/cloud-walker.png',    'lifestyle,knit,slip-on'),
  ('sku-tempo-racer',     'Tempo Racer Carbon',   'Carbon-plated racing flat built for personal bests.',                'Stride',     22000, 'USD', '/img/tempo-racer.png',     'running,racing,carbon'),
  ('sku-summit-hiker',    'Summit Hiker Mid',     'Supportive mid-cut hiker with a cushioned collar.',                  'Stride',     17900, 'USD', '/img/summit-hiker.png',    'hiking,support,outdoor'),
  ('sku-studio-flex',     'Studio Flex',          'Flexible cross-training shoe for gym and studio work.',              'Kettle',     11900, 'USD', '/img/studio-flex.png',     'training,gym,flexible'),
  ('sku-metro-slide',     'Metro Slide',          'Minimalist recovery slide with a contoured footbed.',                'Kettle',      5900, 'USD', '/img/metro-slide.png',     'recovery,slide,casual'),
  ('sku-pace-setter',     'Pace Setter 2',        'Balanced stability trainer for higher-mileage weeks.',               'Hballo',     13900, 'USD', '/img/pace-setter.png',     'running,stability,road'),
  ('sku-canvas-low',      'Canvas Low',           'Everyday canvas sneaker in a low-profile silhouette.',               'Vellum',      6900, 'USD', '/img/canvas-low.png',      'lifestyle,canvas,casual'),
  ('sku-glacier-boot',    'Glacier Boot',         'Insulated winter boot rated for sub-zero commutes.',                 'Summit',     19900, 'USD', '/img/glacier-boot.png',    'boot,winter,insulated'),
  ('sku-river-sandal',    'River Sandal',         'Quick-dry adventure sandal with secure webbing straps.',             'Summit',      7900, 'USD', '/img/river-sandal.png',    'sandal,water,outdoor')
ON CONFLICT (id) DO NOTHING;
