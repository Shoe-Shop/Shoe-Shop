# Correlation contract (the telemetry Definition of Done)

> **This is the spec the four-signal retrofit must satisfy.** A service is not
> MELT-complete until its signals can be **joined**. Uncorrelated signals are
> four disconnected streams, not a dataset — and an AI SRE cannot learn from
> them. Query snippets below are **illustrative**, not authoritative syntax;
> the retrofit verifies exact queries against the running LGTM bundle.

## The four join keys

1. **`trace_id` / `span_id` in logs.** Every structured log record emitted during
   a request MUST carry the active `trace_id` and `span_id`. This is the primary
   trace ↔ log join (Loki labels/fields → Tempo). README §"Logs" already promises
   this ("always carrying `trace_id` and `span_id`").

2. **Metric exemplars → traces.** Histograms (latency, etc.) SHOULD attach
   **exemplars** carrying a `trace_id`, so a spike on a metric links to a
   representative trace. This is the metric ↔ trace join.

3. **Aligned timestamps.** All signals share one clock
   (`deployment.environment=local`). A labeled `time_window` slices all four
   consistently. This is the coarse, always-available join.

4. **Consistent resource attributes.** Every signal from a service carries the
   same resource attributes — at minimum:
   - `service.namespace=shoeshop`
   - `service.name=<service>` (e.g. `catalogue`)
   - `deployment.environment=local`

   These already flow from `OTEL_RESOURCE_ATTRIBUTES` / `OTEL_SERVICE_NAME` in
   every Compose service. They are the metric ↔ log ↔ trace join when no
   `trace_id` is present (e.g. background metrics).

## Definition of Done (per service)

A service ships MELT-complete only when **all** hold, verified in Grafana:

- [ ] **Traces** — OTLP spans in Tempo (already true for the 4 real services).
- [ ] **Metrics** — a `MeterProvider` exports OTLP metrics to Prometheus; RED
      signals (rate/errors/duration) present; latency histogram carries
      **exemplars** with `trace_id`.
- [ ] **Logs** — structured logs exported (or bridged) to Loki, **each record
      carrying `trace_id` + `span_id`** for in-request logs.
- [ ] **Events** — domain/lifecycle events emitted (OTel Events API where the SDK
      supports it; span-events or structured log-events as the documented
      fallback). Rich domain events arrive with the v0.3 NATS write path.
- [ ] **Correlation proven** — from one trace in Tempo you can pivot to its logs
      in Loki (`trace_id`) and its latency metric/exemplar in Prometheus, and all
      three agree on `service.name` and timestamp.

## How a labeled window resolves to data

Given an incident record's `correlation` block:

- `trace_ids[]` → fetch exact traces in Tempo; pivot to their logs by `trace_id`.
- `resource_selector` (e.g. `service.namespace=shoeshop, deployment.environment=local`)
  + `time_window` → slice metrics (PromQL) and logs (LogQL) for the blast radius.
- `exemplar_metric` → the histogram whose exemplars link the magnitude (metric)
  back to representative traces.

Illustrative pivots (syntax verified later against the bundle):

```
# logs for a trace (LogQL-style)
{service_name="cart"} | json | trace_id="<trace_id>"

# error rate over the window (PromQL-style)
sum(rate(rpc_server_duration_count{service_name="cart",status_code="ERROR"}[1m]))

# trace by id (TraceQL-style)
{ trace:id = "<trace_id>" }
```

The point: a labeled `(time_window, root_cause)` plus these keys reconstructs the
full correlated MELT slice for that incident — the training example for project 2.
