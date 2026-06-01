-- Demo accounts. Explicit ids + ON CONFLICT make this idempotent across
-- restarts (safe to run on every startup, like the catalogue seed).
INSERT INTO users (id, email, full_name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'ada@shoeshop.test',  'Ada Lovelace'),
  ('22222222-2222-2222-2222-222222222222', 'alan@shoeshop.test', 'Alan Turing'),
  ('33333333-3333-3333-3333-333333333333', 'grace@shoeshop.test', 'Grace Hopper')
ON CONFLICT (id) DO NOTHING;
