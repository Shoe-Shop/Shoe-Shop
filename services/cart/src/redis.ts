import Redis from 'ioredis';

// Single shared connection. ioredis is auto-instrumented by OpenTelemetry, so
// each command becomes a span parented to the active gRPC request.
const url = process.env.REDIS_URL ?? 'redis://redis:6379';

export const redis = new Redis(url, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});
