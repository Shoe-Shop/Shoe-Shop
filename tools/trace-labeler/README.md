# Trace-labeler — dataset export pipeline (v0)

Turns the **labeled incident records** under
[`docs/dataset/incidents/`](../../docs/dataset/incidents/) into a **trainable
dataset**. For each record it extracts the correlated four-signal (MELT) slice
bounded by the record's `time_window` from the LGTM bundle and emits **one
self-contained training example** per incident.

```
incident record (label / ground truth)  ──►  extract MELT slice  ──►  one JSONL line
   time_window + correlation                  Tempo · Loki · Prometheus     input  = the four signals
   + root_cause / remediation (the target)                                  label  = the record
```

This is the export track the dataset README
([`docs/dataset/README.md`](../../docs/dataset/README.md)) deliberately deferred
until *real services and real incidents existed*. They do now (9/11 services
MELT-complete; incidents `0002..0006`), so the boundary is unblocked. **Why it
matters:** the LGTM bundle is ephemeral local storage — a labeled incident is
only trainable while its telemetry still lives in the bundle. This tool captures
that telemetry into a versioned, git-committed artifact so the corpus survives
the bundle.

## Usage

```bash
task up:checkout                          # the stack whose bundle holds the telemetry
task dataset:export                       # export ALL incident records
task dataset:export -- incident-0002      # export ONE record
```

Output (committed) → [`docs/dataset/exports/`](../../docs/dataset/exports/):
`dataset.jsonl` (one line per incident) + `manifest.json` (provenance) — see that
directory's README for the example schema.

> The bundle must still hold the incidents' windows. Records carry absolute
> `time_window`s; the bundle retains telemetry for a finite period, so re-export
> while the windows are live, or re-run the scenario
> (`task chaos:run -- <scenario>`) to mint a fresh window first.

## Runtime — Python-in-container

Runs **in a container** (`Dockerfile`) on the `shoeshop` Compose network with the
repo mounted at `/work`. Unlike the incident-simulator it does **not** drive
Compose — it only reads incident records and queries the bundle's backends over
HTTP, then writes the dataset into the mounted repo. So it needs Python +
`httpx`/`PyYAML` and nothing else (no Docker CLI, no host socket).

## How a slice is extracted (all APIs verified live against the bundle)

| Signal | Bundle API | How |
|--------|-----------|-----|
| **Traces** | Tempo `:3200` `/api/search` + `/api/traces/{id}` | Resolve `order.id` → trace ids (`{ span.order.id = … }`), union with explicit `trace_ids[]`, fetch full OTLP spans. Read-path incidents (no order anchor) sample the record's curated *slow-trace* selectors first (e.g. `{ catalogue && duration > 200ms }`), then top up by service. |
| **Logs** | Loki `:3100` `/loki/api/v1/query_range` | `trace_id` is a stream label here → pull the exact in-trace logs (`trace_id=~…`) + a per-service blast-radius slice. |
| **Events** | (subset of logs) | Domain events are structured logs whose body is a dotted event name (`payment.declined`, `notification.sent`) with attributes promoted to labels — surfaced as a separate `events[]` stream. |
| **Metrics** | Prometheus `:9090` `/api/v1/query_range` + `/api/v1/query_exemplars` | The `exemplar_metric` histogram (count + 5m-rate) and its exemplars, plus every `expected_symptoms[].where` PromQL executed **verbatim**. |

A nice property: the records' `expected_symptoms[].where` are already valid
TraceQL/LogQL/PromQL, so the labeler **executes the authored queries** rather than
inventing them — and records each result count, so the export doubles as a
**verification of the label's symptom pointers** against live data.

## Windowing (design decisions, recorded per-example in `query_window`)

- **Logs / events / traces are bound strictly to the labeled `time_window`** —
  the window *is* the incident. A pad past it would dilute the signature; e.g.
  `notification-down`'s defining *absence* of `notification.sent` is destroyed by
  a generous pad, which catches the post-window recovery drain (the durable
  consumer's drain is stamped with the original `trace_id` by NATS traceparent
  propagation, falsely showing the fan-out as healthy). Verified: with the strict
  window, `incident-0004` shows `orders.confirmed`×6 in-window and `notification.sent`×0.
- **Metrics use a 120s pad** because they export on a 60s interval (a window
  shorter than that holds zero points otherwise — the documented incident-simulator
  gotcha). The pad is recorded in `query_window.metrics`.

## Known characteristics (honest, not bugs)

- **Trace-id normalization.** Tempo's search API drops leading zeros from trace
  ids (`b57a…`, 28 hex); Loki stores the full zero-padded 32-hex id (`0000b57a…`).
  The labeler zero-pads (`norm_trace_id`) so the trace↔log join actually matches.
- **Per-stack exemplar gap (expected).** Go services emit native metric exemplars
  (`incident-0005` catalogue → 19; `incident-0004` notification → 1); the
  Rust/JS-SDK services do **not** (Payment, BFF → 0), per the documented per-stack
  exemplar policy (ARCHITECTURE §9). The robust trace anchor is `order.id → Tempo`,
  not exemplars.
- **Read-path trace↔log join is partial.** For write-path incidents the
  per-request join is strong (`0002` 80/85 logs joined to fetched traces). For
  saturation/throttle incidents the value is **aggregate** — RED metrics, p99,
  exemplars, the slow-trace sample, and bulk logs — and the per-request join is
  naturally lower: the newest sampled traces and the volume-capped chronological
  bulk logs do not fully overlap, and some browse requests (plain `ListProducts`)
  emit no domain-event log at all.
