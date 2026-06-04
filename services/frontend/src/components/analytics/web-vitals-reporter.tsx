'use client';

import { useReportWebVitals } from 'next/navigation';

// Captures Core Web Vitals (LCP, CLS, INP, FCP, TTFB) as they are measured
// by the browser and forwards each payload to the /api/vitals server route,
// which records them as OTel histograms. This is the "M" bridge for client-
// side performance metrics — the metrics themselves live server-side so they
// share the same MeterProvider as the rest of the frontend MELT signals.
//
// keepalive: true ensures the request completes even if the user navigates
// away immediately after a vital fires (common for LCP and CLS).
export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    fetch('/api/vitals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(metric),
      keepalive: true,
    }).catch(() => {
      // Swallow silently — telemetry must never break the page.
    });
  });

  return null;
}
