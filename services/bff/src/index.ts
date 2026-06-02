import { serve } from '@hono/node-server';
import { app } from './routes';
import { log } from './telemetry';

const port = Number(process.env.PORT ?? '8080');

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  log.info('bff listening', { port: info.port });
});
