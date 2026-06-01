# Shoe Shop — Architecture & Context

> **Living context document.** This is the single, accurate source of truth for
> what Shoe Shop *is*, what is *actually built* vs. planned, and the decisions
> behind it. Keep it honest and current — if the code and this file disagree,
> fix one of them. The README is the public-facing pitch; this file is the
> engineering ground truth.
>
> _Last updated: 2026-06-01_

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
| **BFF** (Hono/TS, gRPC client → Catalogue, OTel auto-instr) | ✅ **Done & validated** (v0.2) — first cross-service trace `bff → catalogue` |
| frontend, cart, orders, payment | 🟡 **Stubs** (`traefik/whoami`) — real ports/limits/deps, no logic |
| users, shipping, inventory, recommendation, notification | 🟡 **Stubs** (full profile) |
| Zitadel auth | 🟡 Wired in `full` profile, not yet integrated |
| Incident / chaos framework | 🔴 **Planned** (see §11) |
| k3d / Helm / Argo CD / Istio paths | 🔴 **Planned / documented only** |

**Rule of thumb:** only Catalogue, the BFF, + the 5 infra containers contain
real behaviour today. Everything else is a runnable placeholder.

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
| 4 | cart | Node · Fastify | gRPC | Redis | stub |
| 5 | orders | Java 21 · Spring Boot | gRPC | Postgres + NATS | stub |
| 6 | payment | Rust · Axum | gRPC | Postgres | stub |
| 7 | users | Python 3.12 · FastAPI | gRPC | Postgres | stub |
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
  ├── catalogue/v1/catalogue.proto
  └── gen/go/                 # COMMITTED generated stubs (linguist-generated)
services/catalogue/           # first real service (Go)
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

## 9. Observability instrumentation (catalogue, as the reference)

- Tracer provider exports OTLP/gRPC, endpoint from `OTEL_EXPORTER_OTLP_ENDPOINT`.
- `otelgrpc` server handler → one SERVER span per RPC.
- `otelpgx` → child spans for `pool.acquire` and each SQL query.
- `otelhttp` transport on the Meilisearch client → child CLIENT span per search.
- Net effect: a single trace shows `gRPC RPC → {Postgres query, Meili HTTP}`.
  This is the pattern every future service should follow.

---

## 10. Incidents & reliability (direction)

Failure is a **first-class feature**, not an afterthought. The plan: a curated
catalogue of realistic, **labeled, reproducible** incidents — each with a known
root cause, a real propagation path, and observable symptoms — so the running
storefront genuinely degrades and the failure can be studied end-to-end in
traces/metrics/logs. (Design inspired by the author's earlier `Sock-Shop-New`
incident set, upgraded to lean on OpenTelemetry distributed traces and
Compose-native injection.) See §11 for sequencing.

---

## 11. Roadmap / next steps

- **v0.2 (in progress):** read path. ✅ Catalogue, ✅ BFF (cross-service trace
  `bff → catalogue` validated). Next: **Cart** (Redis) / **Users** (Postgres),
  then a real **Frontend** consuming the BFF.
- **v0.3+:** orders/payment/checkout write path with NATS events.
- **Chaos:** Toxiproxy + (k3d) Chaos Mesh + the first incident scenarios.
- **Incident framework:** `tools/incident-simulator/` orchestrating labeled
  scenarios; `(time_window, root_cause)` annotations in Grafana.

**Recommended sequencing:** build a couple more real services *before* the
incident framework — incidents are only meaningful once there's a real
multi-service request path to break.

---

## 12. Using this file with a new AI session

This repo is developed with Claude Code, which **auto-loads `CLAUDE.md`** at the
start of every session — so the fastest bootstrap is already automatic.
`CLAUDE.md` points here. If you're pasting context into a fresh chat manually,
paste **this file first**: it captures status, decisions, and conventions with
enough fidelity to continue work accurately.
