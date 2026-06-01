import * as http from 'node:http';
import { redis } from './redis';

// Minimal HTTP health endpoint for the container healthcheck. Reports healthy
// only when Redis responds to PING. (Kept off the trace stream via the
// ignoreIncomingRequestHook in telemetry.ts.)
export function startHealthServer(port: number): void {
  const server = http.createServer((req, res) => {
    if (req.url !== '/healthz') {
      res.writeHead(404);
      res.end();
      return;
    }
    redis
      .ping()
      .then(() => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      })
      .catch(() => {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'unhealthy' }));
      });
  });
  server.listen(port, '0.0.0.0', () => {
    console.log(JSON.stringify({ level: 'info', msg: 'cart health listening', port }));
  });
}
