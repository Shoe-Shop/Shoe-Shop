import { type NextRequest, NextResponse } from 'next/server';
import { metrics } from '@opentelemetry/api';

// Web Vitals ingestion endpoint — receives POST payloads from the browser's
// WebVitalsReporter component (useReportWebVitals) and records each vital as
// an OTel histogram. The NodeSDK LoggerProvider/MeterProvider is live by the
// time the first request arrives (register() runs before request handling).
//
// Metric names: frontend.web_vital.{lcp,cls,inp,fcp,ttfb}
// Units: CLS is dimensionless ("1"); all others are milliseconds ("ms").
// The JS metric-exemplar gap applies here too (OTel-JS sdk-metrics 2.7.1
// never writes exemplars) — metric↔trace correlation comes from the LGTM
// bundle's Tempo metrics-generator, same as BFF/Cart (ARCHITECTURE.md §9).

const SCOPE = 'shoeshop/frontend';
const meter = metrics.getMeter(SCOPE);

const UNIT: Record<string, string> = {
  CLS: '1',
  LCP: 'ms',
  INP: 'ms',
  FCP: 'ms',
  TTFB: 'ms',
};

// Histograms keyed by vital name — created once per warm Node.js instance.
const histograms = new Map<string, ReturnType<typeof meter.createHistogram>>();

function getHistogram(name: string) {
  if (!histograms.has(name)) {
    histograms.set(
      name,
      meter.createHistogram(`frontend.web_vital.${name.toLowerCase()}`, {
        description: `Core Web Vital: ${name}`,
        unit: UNIT[name] ?? 'ms',
      }),
    );
  }
  return histograms.get(name)!;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const { name, value, rating, navigationType } = body as {
    name?: string;
    value?: number;
    rating?: string;
    navigationType?: string;
  };

  if (typeof name !== 'string' || typeof value !== 'number') {
    return NextResponse.json({ error: 'missing name or value' }, { status: 400 });
  }

  getHistogram(name).record(value, {
    'web_vital.name': name,
    'web_vital.rating': rating ?? 'unknown',
    'web_vital.navigation_type': navigationType ?? 'unknown',
  });

  return NextResponse.json({ ok: true });
}
