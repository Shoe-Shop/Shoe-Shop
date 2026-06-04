import { NextResponse } from 'next/server';

// Minimal liveness probe used by the compose healthcheck. Intentionally thin —
// no downstream calls. The /api/healthz path is excluded from OTel traces and
// the RED metric in instrumentation.ts so it does not pollute the signal.
export function GET() {
  return NextResponse.json({ ok: true });
}
