// BFF HTTP API. Aggregates downstream services for the frontend. Today it
// fronts Catalogue and Cart; orders/etc. join as those services become real.
import { Hono, type Context } from 'hono';
import { catalogue, grpc } from './catalogue-client';
import { cart } from './cart-client';
import { users } from './users-client';
import { log, event } from './telemetry';

export const app = new Hono();

// Map a downstream gRPC error to an HTTP status + JSON body. Emitted inside the
// request span, so the warn log carries the active trace_id/span_id (joins to the
// trace in Tempo and to the http.server RED error in Prometheus).
function grpcError(c: Context, e: unknown) {
  const err = e as grpc.ServiceError;
  const status =
    err.code === grpc.status.INVALID_ARGUMENT
      ? 400
      : err.code === grpc.status.NOT_FOUND
        ? 404
        : 500;
  log.warn('downstream gRPC error', {
    'http.route': c.req.routePath,
    'rpc.grpc.status_code': grpc.status[err.code] ?? String(err.code),
    'http.response.status_code': status,
  });
  return c.json({ error: err.details || err.message }, status as 400 | 404 | 500);
}

app.get('/healthz', (c) => c.json({ status: 'ok' }));

app.get('/api/products', async (c) => {
  const page = Number(c.req.query('page') ?? '1');
  const pageSize = Number(c.req.query('pageSize') ?? '20');
  const res = await catalogue.listProducts({ page, pageSize });
  event('bff.products.listed', { page, 'page.size': pageSize, count: res.products?.length ?? 0 });
  return c.json(res);
});

app.get('/api/products/:id', async (c) => {
  try {
    const res = await catalogue.getProduct({ id: c.req.param('id') });
    event('bff.product.viewed', { 'product.id': c.req.param('id') });
    return c.json(res);
  } catch (e) {
    return grpcError(c, e);
  }
});

app.get('/api/search', async (c) => {
  const query = c.req.query('q') ?? '';
  const limit = Number(c.req.query('limit') ?? '20');
  const res = await catalogue.searchProducts({ query, limit });
  event('bff.search.performed', { 'search.query': query, limit, count: res.products?.length ?? 0 });
  return c.json(res);
});

// ── Cart ─────────────────────────────────────────────────────────────
// Per-user basket fronting the Cart gRPC service (Redis-backed). Each call
// becomes a bff -> cart -> redis span chain in Tempo.

app.get('/api/cart/:userId', async (c) => {
  try {
    const res = await cart.getCart({ userId: c.req.param('userId') });
    event('bff.cart.viewed', {
      'user.id': c.req.param('userId'),
      count: res.cart?.items?.length ?? 0,
    });
    return c.json(res);
  } catch (e) {
    return grpcError(c, e);
  }
});

app.post('/api/cart/:userId/items', async (c) => {
  try {
    const body = await c.req.json<{ productId?: string; quantity?: number }>();
    const res = await cart.addItem({
      userId: c.req.param('userId'),
      productId: body.productId ?? '',
      quantity: Number(body.quantity ?? 1),
    });
    return c.json(res);
  } catch (e) {
    return grpcError(c, e);
  }
});

app.delete('/api/cart/:userId/items/:productId', async (c) => {
  try {
    const res = await cart.removeItem({
      userId: c.req.param('userId'),
      productId: c.req.param('productId'),
    });
    return c.json(res);
  } catch (e) {
    return grpcError(c, e);
  }
});

app.delete('/api/cart/:userId', async (c) => {
  try {
    const res = await cart.clearCart({ userId: c.req.param('userId') });
    return c.json(res);
  } catch (e) {
    return grpcError(c, e);
  }
});

// ── Users / account ──────────────────────────────────────────────────
// Account profile fronting the Users gRPC service (Postgres-backed). Each
// call becomes a bff -> users -> postgres span chain in Tempo. The frontend
// account page resolves the signed-in shopper by email (by-email) until auth
// lands; lookup by id is also exposed for Orders and future callers.

app.get('/api/users/by-email/:email', async (c) => {
  try {
    const email = c.req.param('email');
    const res = await users.getUserByEmail({ email });
    event('bff.user.viewed', { 'user.id': res.user?.id, lookup: 'email' });
    return c.json(res);
  } catch (e) {
    return grpcError(c, e);
  }
});

app.get('/api/users/:id', async (c) => {
  try {
    const res = await users.getUser({ id: c.req.param('id') });
    event('bff.user.viewed', { 'user.id': c.req.param('id'), lookup: 'id' });
    return c.json(res);
  } catch (e) {
    return grpcError(c, e);
  }
});
