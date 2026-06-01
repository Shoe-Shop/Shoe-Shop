import { serve } from '@hono/node-server';
import { app } from './routes';

const port = Number(process.env.PORT ?? '8080');

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(
    JSON.stringify({ level: 'info', msg: 'bff listening', port: info.port }),
  );
});
