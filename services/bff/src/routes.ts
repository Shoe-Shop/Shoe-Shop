// BFF HTTP API. Aggregates downstream services for the frontend. Today it
// fronts Catalogue; cart/orders/etc. join as those services become real.
import { Hono } from 'hono';
import { catalogue, grpc } from './catalogue-client';

export const app = new Hono();

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
    const err = e as grpc.ServiceError;
    const status = err.code === grpc.status.NOT_FOUND ? 404 : 500;
    return c.json({ error: err.details || err.message }, status as 404 | 500);
  }
});

app.get('/api/search', async (c) => {
  const query = c.req.query('q') ?? '';
  const limit = Number(c.req.query('limit') ?? '20');
  const res = await catalogue.searchProducts({ query, limit });
  return c.json(res);
});
