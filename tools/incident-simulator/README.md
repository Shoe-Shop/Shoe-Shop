# Incident simulator (v0)

Runs **labeled, reproducible reliability scenarios** against the running Shoe Shop
checkout stack and writes a schema-v0 incident record — the supervised target for
the future AI-SRE corpus (ADR-0002, [`docs/dataset/`](../../docs/dataset/)).

```
manifest  ->  inject  ->  load  ->  recover  ->  label record
```

For one bounded window it: injects a known fault, drives real storefront load so
the fault manifests across all four MELT signals, recovers, and records *what
broke, where, why, what it looked like, and how it was fixed* —
[`docs/dataset/incidents/`](../../docs/dataset/incidents/).

## Runtime — Python-in-container

The simulator runs **in a container** (`Dockerfile`) with the host Docker socket
and the repo mounted at `/work`. It drives the real Compose stack the way a human
would (`docker compose ... up -d --force-recreate payment` — "docker-out-of-docker")
and the real storefront path through the BFF. No bespoke control plane; nothing to
install on the host beyond Docker.

## Usage

```bash
task up:checkout                          # the stack the simulator drives
task chaos:list                           # available scenarios
task chaos:run -- payment-hard-decline    # inject -> load -> recover -> label
task chaos:run -- payment-latency-spike
```

Each run mints the next `incident-NNNN-<scenario>.yaml` under
`docs/dataset/incidents/` with the real `time_window` + `order_ids`. Verify the
window in Grafana / Tempo / Loki / Prometheus using **absolute** time bounds.

## Scenarios

A manifest (`scenarios/<name>.yaml`) declares the `fault` to inject, the `load`
to drive, and the static `label` fields (root cause, expected symptoms,
remediation). The simulator fills the runtime fields (window, order ids, load
stats). Shipped:

| Scenario | Method | Fault | Incident class |
|----------|--------|-------|----------------|
| `payment-hard-decline` | env-knob | `PAYMENT_FAILURE_RATE=1.0` → every order declined → CANCELLED | Payment transaction failure |
| `payment-latency-spike` | env-knob | `PAYMENT_LATENCY_MS=1500` → slow authorizations inflate the saga | Payment gateway timeout |
| `notification-down` | compose-stop | stop the Notification worker → orders confirm but no notice is sent (silent fan-out failure) | Async processing failure |
| `catalogue-db-throttle` | resource-limit | cap Postgres to 0.1 CPU under browse load → product-listing latency climbs | Database performance degradation |
| `checkout-load-spike` | load | concurrent browse/search burst → read-path latency climbs (no fault injected) | Pure application latency |

## Injection methods

All four `injection_method` enum values
([`incident-schema.md`](../../docs/dataset/incident-schema.md)) are wired:

- **`env-knob`** — ephemeral override + `--force-recreate` (knobs read at startup).
- **`compose-stop`** — `docker compose stop` / `start` (the stopped container is
  kept, so a durable NATS consumer drains its backlog on recovery).
- **`resource-limit`** — pin a legacy `cpus` cap via override + recreate (the
  legacy form, not `deploy.resources`, because the base services set `mem_limit`
  and compose refuses to mix the two; recreating without the override clears it).
- **`load`** — no container change; the concurrent (read-only) load driver is the
  fault.

### Load modes

- **sequential** (`orders` / `settle_s`): one checkout at a time — the write-path
  payment / notification scenarios.
- **concurrent** (`workers` / `duration_s` / `flow`): read-only `browse`/`search`/
  `mixed` load for a fixed duration — saturation and DB-throttle scenarios. Read
  flows only: the per-user cart makes concurrent checkout race on one shopper.

> **Observer export interval.** For `resource-limit` / `load`, the *observed*
> service (catalogue, bff) exports metrics on the default 60s interval, so a ~80s
> window holds only ~1–2 points — query its histograms with a **wide rate window**
> (`[5m]`), not `[1m]`. (The `env-knob` scenarios sidestep this by injecting a
> short `OTEL_METRIC_EXPORT_INTERVAL` onto the faulted container itself.)

## Grafana annotations

Each run posts a region annotation (tags: `incident-simulator`, `<scenario_id>`,
`<incident_id>`) over its window to the bundle's Grafana, so incidents show as
shaded bands on the dashboards. Best-effort — a failed annotation never fails the
run. Configure via `GRAFANA_URL` / `GRAFANA_AUTH` (default `admin:admin`).

## Why a recreate, not a restart

The Payment simulator reads its decision knobs once at startup
(`decision::Config::from_env`). A plain `restart` keeps the old env, so the
simulator **recreates** the target container with an ephemeral Compose override
(`compose.incident.gen.yaml`, gitignored) carrying the knob, and drops the
override on recovery.
