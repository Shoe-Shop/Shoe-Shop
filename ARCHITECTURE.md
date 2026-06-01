# Shoe Shop — Architecture & Context

> **Living context document.** This is the single, accurate source of truth for
> what Shoe Shop *is*, what is *actually built* vs. planned, and the decisions
> behind it. Keep it honest and current — if the code and this file disagree,
> fix one of them. The README is the public-facing pitch; this file is the
> engineering ground truth.
>
> _Last updated: 2026-06-01 (MELT direction set — see ADR-0002; telemetry
> standard redefined from traces-only to four correlated signals)_

---

## 1. What this is

Shoe Shop is a polyglot, cloud-native **e-commerce platform** built as a
hands-on learning playground for distributed-systems operations: deep
observability (logs, metrics, traces, profiles), realistic failure/incident
scenarios, and production-shaped patterns — all runnable on a laptop.

The product is a real storefront (browse, search, cart, checkout) implemented
as ~11 microservices across 6 languages. The point is not the shopping; it's
that the system is **real enough to break in interesting ways and observable
enough to understand why.**

### The deeper purpose (the real product)

Sharpened as of ADR-0002: Shoe Shop is an **observability data generator**. Its
output is **correlated four-signal telemetry — MELT: Metrics, Events, Logs,
Traces — plus a labeled, reproducible incident corpus.** That corpus is the
training / eval dataset for a future AI SRE ("**project 2**").

This is why **full, correlated MELT is a hard requirement**, not a nice-to-have:
an SRE (human or model) trained on traces alone is blind — it sees the *request
path* but not the *magnitude* (metrics), the *error cause* (logs), or the
*trigger* (events). The signals are only useful **joined**: `trace_id`/`span_id`
in logs, metric exemplars to traces, aligned timestamps, consistent resource
attributes. See §9 for the standard and [ADR-0002](docs/adr/ADR-0002-melt-four-signal-telemetry-as-product.md)
for the decision; the dataset shape is designed (not yet built) in
[`docs/dataset/`](docs/dataset/).

---

## 2. Current status (what is REAL vs STUB vs PLANNED)

This is the most important section — do not assume more is built than is listed.

| Area | Status |
|------|--------|
| Root + orchestration (Taskfile, Compose profiles, mem limits) | ✅ **Done** (v0.1) |
| Governance (LICENSE, CONTRIBUTING, CoC, SECURITY) + tooling config | ✅ **Done** (v0.1) |
| Platform backbone: Postgres, Redis, Meilisearch, NATS, `otel-lgtm` | ✅ **Done & validated** (live smoke test passed) |
| **Catalogue** service (Go, gRPC, Postgres+sqlc, Meilisearch, OTel) | ✅ **Done & validated** (v0.2) — real traces in Tempo |
| proto/ contracts + committed Go stubs (buf) | ✅ **Done** (catalogue/v1) |
| **BFF** (Hono/TS, gRPC client → Catalogue + Cart, OTel auto-instr) | ✅ **Done & validated** (v0.2) — cross-service traces `bff → catalogue` and `bff → cart → redis` |
| **Cart** (Node/TS, gRPC, Redis, OTel auto-instr) | ✅ **Done & validated** (v0.2) — gRPC → Redis (ioredis) spans in Tempo |
| **Users** (Python 3.12, FastAPI + gRPC, Postgres, OTel) | ✅ **Done & validated** (v0.2) — multi-span `gRPC RPC → Postgres query` traces in Tempo |
| frontend, orders, payment | 🟡 **Stubs** (`traefik/whoami`) — real ports/limits/deps, no logic |
| shipping, inventory, recommendation, notification | 🟡 **Stubs** (full profile) |
| Zitadel auth | 🟡 Wired in `full` profile, not yet integrated |
| Incident / chaos framework | 🔴 **Planned** (see §11) |
| k3d / Helm / Argo CD / Istio paths | 🔴 **Planned / documented only** |

**Rule of thumb:** only Catalogue, the BFF, Cart, Users, + the 5 infra
containers contain real behaviour today. Everything else is a runnable
placeholder. (Users lives in the `full` profile, so bring it up with
`task up:full` — or, for validation, just `postgres`, `otel-lgtm`, `users`.)

> **⚠️ Telemetry reality (the active gap).** All four real services currently
> emit **traces only** — each initializes an OTel `TracerProvider` and nothing
> else. Per ADR-0002 the golden standard is now **four correlated signals
> (MELT)**, so **0 of 11 services are MELT-complete**. The immediate roadmap
> (§11) is to set the four-signal standard on Catalogue, retrofit the other
> three, and validate correlation — *before* new features. Coverage is tracked
> in the matrix in §9.

---

## 3. Architecture overview

**Request path (target):** Envoy Gateway → Next.js frontend → Hono BFF
(trace root) → domain services. Sync calls are **gRPC**; async/event flows use
**NATS JetStream**. Every hop propagates W3C `traceparent` and exports OTLP.

**Data:** PostgreSQL 16 with **database-per-service** (one instance, many DBs),
Redis for cart/rate-limiting, Meilisearch for catalogue search.

**Observability (local):** the whole LGTM stack is collapsed into the single
`grafana/otel-lgtm` image (Grafana + Prometheus + Loki + Tempo + an embedded
OTel Collector) on port 3000 / OTLP 4317-4318. Pyroscope is an opt-in sidecar.

---

## 4. Services matrix (language · transport · datastore)

| # | Service | Lang / Stack | Sync | Store | Status |
|---|---------|--------------|------|-------|--------|
| 1 | frontend | TypeScript · Next.js 15 | — | — | stub |
| 2 | **bff** | TypeScript · Hono | gRPC client | — | **real** |
| 3 | **catalogue** | **Go 1.25 · gRPC + sqlc** | gRPC | Postgres + Meilisearch | **real** |
| 4 | **cart** | Node.js · gRPC | gRPC | Redis | **real** |
| 5 | orders | Java 21 · Spring Boot | gRPC | Postgres + NATS | stub |
| 6 | payment | Rust · Axum | gRPC | Postgres | stub |
| 7 | **users** | **Python 3.12 · FastAPI + gRPC** | gRPC | Postgres | **real** |
| 8 | shipping | Kotlin · Ktor | gRPC | Postgres + NATS | stub |
| 9 | inventory | Go · gRPC-first | gRPC | Postgres | stub |
| 10 | recommendation | Python · FastAPI + ONNX | gRPC | Postgres (replica) | stub |
| 11 | notification | Go · NATS subscriber | async | — | stub |
| — | zitadel | OIDC auth | — | Postgres | full profile |

---

## 5. Repository layout (key paths)

```
Taskfile.yml                  # dual-path task runner (go-task)
ARCHITECTURE.md               # this file
README.md                     # public pitch / blueprint
deploy/compose/               # compose.yaml (backbone) + profile overlays
  ├── compose.core.yaml       # 6 core services (catalogue is REAL)
  ├── compose.full.yaml       # +5 services +zitadel
  ├── compose.lean-jvm.yaml   # JVM heap caps
  ├── compose.pyroscope.yaml  # opt-in profiling
  ├── .env.example            # tags/creds/ports (committed); .env is gitignored
  └── initdb/                 # creates per-service databases
proto/                        # gRPC contracts (single source of truth)
  ├── buf.yaml / buf.gen.yaml
  ├── catalogue/v1 · cart/v1 · users/v1   # service contracts
  ├── gen/go/                 # COMMITTED Go stubs (linguist-generated)
  └── gen/python/             # COMMITTED Python stubs (linguist-generated)
services/catalogue/           # first real service (Go)
services/bff/                 # Hono BFF (TS)
services/cart/                # Cart (Node/TS)
services/users/               # Users (Python · FastAPI + gRPC)
```

---

## 6. Local dev workflow

- **Prereqs:** Docker Desktop (WSL2). The `task` CLI. Nothing else is required —
  all language/codegen toolchains run in containers.
- **Profiles (RAM dial):** `core` (6 svc, default), `full` (11 + Zitadel),
  `lean-jvm` (capped JVM heaps).
- **Dual path:** `task dev` (Hybrid — infra in Docker, edited service native)
  vs `task up:core` / `up:full` (everything containerized).
- **Common:** `task up:core`, `task ps`, `task logs -- <svc>`, `task down`,
  `task nuke` (also deletes volumes), `task obs` (prints endpoints).

Measured footprint: `core` profile idles around **~0.8 GB** total (otel-lgtm is
~90% of it); well within an 8 GB WSL2 budget.

---

## 7. Key decisions (the "why")

1. **Docker Compose is the default**, not Kubernetes — fits a 16 GB / 8 GB-WSL2
   laptop. k3d is the documented opt-in cluster path.
2. **`core` profile + Hybrid dev** is the daily default (lowest RAM, full
   checkout trace still possible).
3. **Bundled `grafana/otel-lgtm`** locally (one container) instead of running
   Loki/Tempo/Mimir/Grafana separately. Pyroscope is opt-in.
4. **Zitadel** for OIDC auth (lighter than Keycloak for this RAM budget).
5. **NATS JetStream** for async (not Kafka/RabbitMQ) — lighter, JetStream gives
   durable streams. Redpanda is the documented heavier swap.
6. **PostgreSQL, database-per-service** (one instance) — avoids the shared-DB
   anti-pattern without N database containers.
7. **Per-container hard `mem_limit`** — an OOM becomes a clean, observable
   restart instead of freezing the WSL2 VM.
8. **Generated proto Go stubs are committed** (`proto/gen/go`, marked
   linguist-generated). They carry a hand-maintained `go.mod` consumed via a
   `replace` directive, so the monorepo builds on a fresh clone with no codegen
   step. Regenerate per `proto/README.md`.
9. **Go 1.25** for Go services — current `google.golang.org/grpc` requires
   Go ≥ 1.25.
10. **Healthchecks use `127.0.0.1`, not `localhost`** — busybox `wget` resolves
    `localhost` to IPv6 `::1` first, but these services bind IPv4 only.
11. **Catalogue talks Meilisearch over plain HTTP** (otelhttp-instrumented)
    rather than a vendored SDK — small dependency surface, automatic spans.
12. **Go module path:** `github.com/shoeshop/shoe-shop` (gen module
    `.../proto/gen/go`, services `.../services/<name>`).

---

## 8. Conventions

- **Commits:** Conventional Commits (`type(scope): summary`) + DCO sign-off
  (`git commit -s`). **Author name only — do NOT add `Co-Authored-By` trailers.**
- **Architectural changes:** ADR-first under `docs/adr/` (planned dir).
- **Codegen:** `buf` (proto → Go) and `sqlc` (SQL → Go) run via Docker images;
  no local toolchains. Commit regenerated output.
- **Git remote:** `git@github.com:Shoe-Shop/Shoe-Shop.git`, branch `main`.

---

## 9. Observability instrumentation — the four-signal (MELT) standard

> **Golden pattern, redefined (ADR-0002).** A service ships only when it emits
> **four correlated signals — Metrics, Events, Logs, Traces** — not traces
> alone. The reference is **Catalogue (Go)**; **Users (Python)** is the first
> retrofit (Python's logs/events are the least mature SDK signals, so it surfaces
> cross-stack gaps early). Per-stack SDK specifics are written **after
> verification in Docker** during the retrofit — not asserted here from memory.

### Definition of Done (a service is not "done" until all hold, verified in Grafana)

- [ ] **Traces** — OTLP spans in Tempo. *(Already true for all 4 real services.)*
- [ ] **Metrics** — a `MeterProvider` exports OTLP metrics to Prometheus; RED
      (rate/errors/duration) present; the latency histogram carries **exemplars**
      stamped with `trace_id`.
- [ ] **Logs** — structured logs exported (or bridged) to Loki, **each in-request
      record carrying `trace_id` + `span_id`**.
- [ ] **Events** — domain/lifecycle events (OTel Events API where the SDK
      supports it; span-events or structured log-events as the documented
      fallback). Rich domain events arrive with the v0.3 NATS write path.
- [ ] **Correlation proven** — from one Tempo trace you can pivot to its Loki logs
      (by `trace_id`) and its Prometheus latency/exemplar, all agreeing on
      `service.name` and timestamp.

The join keys (the same four every signal must share) are specified in
[`docs/dataset/correlation-contract.md`](docs/dataset/correlation-contract.md):
`trace_id`/`span_id` in logs, metric exemplars → traces, aligned timestamps, and
consistent resource attributes (`service.namespace=shoeshop`, `service.name`,
`deployment.environment=local` — already flowing from `OTEL_RESOURCE_ATTRIBUTES`
in every Compose service).

### Telemetry coverage matrix

Tracks each real service against the four signals. `M` Metrics · `E` Events ·
`L` Logs · `T` Traces. (Stubs omitted — they emit nothing real.)

| Service | Stack | M | E | L | T | MELT-complete |
|---------|-------|---|---|---|---|---------------|
| catalogue | Go | ⬜ | ⬜ | ⬜ | ✅ | ❌ (reference — retrofit first) |
| users | Python | ⬜ | ⬜ | ⬜ | ✅ | ❌ (first retrofit) |
| cart | Node | ⬜ | ⬜ | ⬜ | ✅ | ❌ |
| bff | TS | ⬜ | ⬜ | ⬜ | ✅ | ❌ |

> ✅ emitted & validated · ⬜ not yet · update a cell only after verifying the
> signal in Grafana, not on writing the code.

### Current Traces implementation (the ✅ column above)

The trace wiring that exists today — the foundation the other three signals are
added *alongside*, not replacing:

- **Catalogue (Go):** TracerProvider exports OTLP/gRPC (endpoint from
  `OTEL_EXPORTER_OTLP_ENDPOINT`); `otelgrpc` server handler → one SERVER span per
  RPC; `otelpgx` → child spans for `pool.acquire` and each SQL query; `otelhttp`
  transport on the Meilisearch client → child CLIENT span per search. Net effect:
  one trace shows `gRPC RPC → {Postgres query, Meili HTTP}`.
- **Users (Python):** the `opentelemetry-instrumentation-grpc` aio server
  interceptor produces one SERVER span per RPC, `opentelemetry-instrumentation-asyncpg`
  adds child spans per query, FastAPI (health surface) is instrumented with health
  paths excluded. Validated: `GetUser`/`CreateUser` show `gRPC RPC → Postgres
  query` in Tempo. Users runs gRPC (:9090, the inter-service contract) and a
  FastAPI liveness/readiness surface (:8080, used by the healthcheck) in one
  asyncio loop.
- **Cart (Node) / BFF (TS):** OTel auto-instrumentation; cross-service traces
  `bff → catalogue` and `bff → cart → redis` validated in Tempo.

---

## 10. Incidents & reliability (direction)

Failure is a **first-class feature**, not an afterthought. The plan: a curated
catalogue of realistic, **labeled, reproducible** incidents — each with a known
root cause, a real propagation path, and observable symptoms — so the running
storefront genuinely degrades and the failure can be studied end-to-end across
**all four MELT signals**. (Design inspired by the author's earlier
`Sock-Shop-New` incident set, upgraded to lean on OpenTelemetry and
Compose-native injection.) See §11 for sequencing.

Each incident is the **supervised target** of the project-2 dataset: a labeled
`(time_window, root_cause, …)` record over a window of correlated MELT. The label
**schema**, the **correlation contract** (the join keys the telemetry retrofit
must satisfy), and a worked **example** are designed now — build deferred — in
[`docs/dataset/`](docs/dataset/). This is *design-first on purpose*: the LGTM
bundle is ephemeral, so incidents run before the schema exists would produce
unlabeled, unrecoverable telemetry.

---

## 11. Roadmap / next steps

- **v0.2 (done — read path):** ✅ Catalogue, ✅ BFF, ✅ Cart (Redis),
  ✅ **BFF → Cart wired** (`bff → cart → redis` trace validated; BFF exposes
  `/api/cart/:userId` GET/POST-items/DELETE-item/DELETE), ✅ **Users** (Python ·
  FastAPI + gRPC · Postgres; `gRPC RPC → Postgres query` traces validated). All
  **traces-only** (see §9 / the §2 telemetry note).
- **v0.2-MELT (active — the direction correction, ADR-0002):** make the four real
  services **MELT-complete** before any new feature. Sequence:
  1. ✅ docs-first persist — ADR-0002, §9 standard + Definition of Done +
     coverage matrix, bounded `docs/dataset/` track *(this change)*;
  2. shared four-signal **telemetry bootstrap** per stack (Go → Node → Python →
     TS) — **SDK APIs verified in Docker**, logs/events maturity differs by
     language;
  3. **retrofit** Catalogue (reference), then Users, Cart, BFF;
  4. **validate** all four signals correlated end-to-end in
     Grafana/Tempo/Loki/Prometheus (flip the §9 matrix cells on verification);
  5. move **Users → `core`** so the four validate together on the default profile.
- **Then resume features (each born MELT-complete):** wire **BFF → Users**
  (account endpoints), a real **Frontend** consuming the BFF.
- **v0.3+:** orders/payment/checkout **write path** with NATS events — where
  domain **Events** get rich.
- **Chaos / incident framework:** `tools/incident-simulator/` orchestrating
  labeled scenarios; `(time_window, root_cause)` records per the
  [`docs/dataset/`](docs/dataset/) schema; annotations in Grafana.

**Recommended sequencing:** finish the MELT retrofit on the existing 4 services
*before* adding more — telemetry debt is cheapest to pay now (4 services, no
drift), and every later service then inherits the standard by construction.
Incidents come *after* enough real, MELT-complete services exist to break.

---

## 12. Using this file with a new AI session

This repo is developed with Claude Code, which **auto-loads `CLAUDE.md`** at the
start of every session — so the fastest bootstrap is already automatic.
`CLAUDE.md` points here. If you're pasting context into a fresh chat manually,
paste **this file first**: it captures status, decisions, and conventions with
enough fidelity to continue work accurately.
