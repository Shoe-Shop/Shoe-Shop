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
window in Grafana / Tempo / Loki / Mimir using **absolute** time bounds.

## Scenarios

A manifest (`scenarios/<name>.yaml`) declares the `fault` to inject, the `load`
to drive, and the static `label` fields (root cause, expected symptoms,
remediation). The simulator fills the runtime fields (window, order ids). Shipped:

| Scenario | Fault | Sock Shop analog |
|----------|-------|------------------|
| `payment-hard-decline` | `PAYMENT_FAILURE_RATE=1.0` → every order declined → CANCELLED | Incident 3 — Payment Transaction Failure |
| `payment-latency-spike` | `PAYMENT_LATENCY_MS=1500` → slow authorizations inflate the saga | Incident 6 — Payment Gateway Timeout |

## Injection methods

See the `injection_method` enum in
[`incident-schema.md`](../../docs/dataset/incident-schema.md). v0 implements
**`env-knob`** (set an env var + recreate the container). `compose-stop`,
`resource-limit`, and `load`-saturation are designed and slot into the same
dispatch as more scenario classes land (mapping to Sock Shop incidents 5, 8, and
1/2/4 respectively).

## Why a recreate, not a restart

The Payment simulator reads its decision knobs once at startup
(`decision::Config::from_env`). A plain `restart` keeps the old env, so the
simulator **recreates** the target container with an ephemeral Compose override
(`compose.incident.gen.yaml`, gitignored) carrying the knob, and drops the
override on recovery.
