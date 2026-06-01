// BFF HTTP API. Aggregates downstream services for the frontend. Today it
// fronts Catalogue and Cart; orders/etc. join as those services become real.
import { Hono, type Context } from 'hono';
import { catalogue, grpc } from './catalogue-client';
import { cart } from './cart-client';

export const app = new Hono();

// Map a downstream gRPC error to an HTTP status + JSON body.
function grpcError(c: Context, e: unknown) {
  const err = e as grpc.ServiceError;
  const status =
    err.code === grpc.status.INVALID_ARGUMENT
      ? 400
      : err.code === grpc.status.NOT_FOUND
        ? 404
        : 500;
  return c.json({ error: err.details || err.message }, status as 400 | 404 | 500);
}

app.get('/healthz', (c) => c.json({ status: 'ok' }));

app.get('/api/products', async (c) => {
  const page = Number(c.req.query('page') ?? '1');
  const pageSize = Number(c.req.query('pageSize') ?? '20');
  const res = await catalogue.listProducts({ page, pageSize });
  return c.json(res);
});

app.get('/api/products/:id', async (c) => {
  try {
    const res = await catalogue.getProduct({ id: c.req.param('id') });
    return c.json(res);
  } catch (e) {
    return grpcError(c, e);
  }
});

app.get('/api/search', async (c) => {
  const query = c.req.query('q') ?? '';
  const limit = Number(c.req.query('limit') ?? '20');
  const res = await catalogue.searchProducts({ query, limit });
  return c.json(res);
});

// ── Cart ─────────────────────────────────────────────────────────────
// Per-user basket fronting the Cart gRPC service (Redis-backed). Each call
// becomes a bff -> cart -> redis span chain in Tempo.

app.get('/api/cart/:userId', async (c) => {
  try {
    const res = await cart.getCart({ userId: c.req.param('userId') });
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
