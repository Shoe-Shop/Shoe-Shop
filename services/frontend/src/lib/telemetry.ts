// Server-only OTel helpers for the Frontend service.
//
// Import from RSC page handlers and API route handlers only — never from
// 'use client' components (the OTel Logs API is not available in the browser).
// By the time any server module loads, Next.js has already called register()
// in instrumentation.ts, so the global LoggerProvider is live and
// logs.getLogger() returns the real implementation (not a no-op).
//
// Pattern mirrors BFF/Cart: log() fans out to stdout JSON + OTel Logs API;
// event() emits a Logs API record with eventName set — the "E" in MELT.
// Both helpers call getLogger() lazily (at emission time) so there is no
// module-load-time dependency on the SDK initialisation order.

import { logs, SeverityNumber, type Attributes } from '@opentelemetry/api-logs';

const SCOPE = 'shoeshop/frontend';

function getLogger() {
  return logs.getLogger(SCOPE);
}

function emit(
  severityNumber: SeverityNumber,
  level: string,
  msg: string,
  attributes?: Attributes,
): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ level, msg, ...attributes }));
  getLogger().emit({
    severityNumber,
    severityText: level.toUpperCase(),
    body: msg,
    attributes,
  });
}

export const log = {
  info: (msg: string, attributes?: Attributes) =>
    emit(SeverityNumber.INFO, 'info', msg, attributes),
  warn: (msg: string, attributes?: Attributes) =>
    emit(SeverityNumber.WARN, 'warn', msg, attributes),
  error: (msg: string, attributes?: Attributes) =>
    emit(SeverityNumber.ERROR, 'error', msg, attributes),
};

/**
 * Emit a domain/lifecycle event. The Logs API stamps the active trace_id and
 * span_id from the current RSC span, so every event is correlated to its
 * trace — the "E" in the four-signal MELT standard (ARCHITECTURE.md §9).
 * The eventName lands in the Loki log body; events are told apart from plain
 * logs by scope_name="shoeshop/frontend" + the eventName body field.
 */
export function event(name: string, attributes?: Attributes): void {
  getLogger().emit({
    eventName: name,
    severityNumber: SeverityNumber.INFO,
    body: name,
    attributes,
  });
}
