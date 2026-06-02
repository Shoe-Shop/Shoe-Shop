# Shoe Shop — Architecture & Context

> **Living context document.** This is the single, accurate source of truth for
> what Shoe Shop *is*, what is *actually built* vs. planned, and the decisions
> behind it. Keep it honest and current — if the code and this file disagree,
> fix one of them. The README is the public-facing pitch; this file is the
> engineering ground truth.
>
> _Last updated: 2026-06-02 (Catalogue + Users + Cart MELT-complete — four signals
> emitted and verified correlated in the LGTM bundle; Go reference + Python and
> Node retrofits landed, §9. Cart carries a documented JS-stack exemplar caveat:
> metric↔trace exemplars come from the bundle's Tempo metrics-generator, as
> OpenTelemetry-JS does not emit them.)_

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

> **⚠️ Telemetry reality (the active gap, shrinking).** **Catalogue (Go), Users
> (Python) and Cart (Node) are MELT-complete** — Metrics + Events + Logs + Traces
> emitted and **verified correlated** in the LGTM bundle (§9). The one remaining
> real service, **BFF (TS), is still traces only** — it initializes an OTel
> `TracerProvider` and nothing else. Per ADR-0002 the golden standard is **four
> correlated signals (MELT)**, so **3 of 11 services are MELT-complete**. The
> immediate roadmap (§11) is to retrofit **BFF** against the Catalogue reference
> and validate correlation — *before* new features. Coverage is tracked in the
> matrix in §9. (Cart's metrics carry a documented JS-stack exemplar caveat — its
> metric↔trace exemplars come from the bundle's Tempo metrics-generator, not the
> OTel-JS SDK; see §9.)

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
> alone. The reference is **Catalogue (Go)**; **Users (Python)** was the first
> retrofit (Python's logs/events are the least mature SDK signals, so it surfaced
> cross-stack gaps early) — both are now MELT-complete (per-stack subsections
> below). Per-stack SDK specifics are written **after verification in Docker**
> during each retrofit — not asserted here from memory.

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
| catalogue | Go | ✅ | ✅ | ✅ | ✅ | ✅ (reference — verified correlated) |
| users | Python | ✅ | ✅ | ✅ | ✅ | ✅ (first retrofit — verified correlated) |
| cart | Node | ✅† | ✅ | ✅ | ✅ | ✅ (verified correlated — † exemplars via bundle, see note) |
| bff | TS | ⬜ | ⬜ | ⬜ | ✅ | ❌ (next) |

> ✅ emitted & validated · ⬜ not yet · update a cell only after verifying the
> signal in Grafana, not on writing the code.
>
> **† Cart Metrics — the JS-stack exemplar divergence (verified in Docker).**
> Cart emits full app-level RED (`rpc_server_requests_total` +
> `rpc_server_duration_seconds_*` by `rpc_method`/`rpc_grpc_status_code`), but
> **OpenTelemetry-JS does not attach metric exemplars** — verified by reading the
> installed SDK source: the histogram aggregator (`sdk-metrics` 2.7.1, the latest
> release) records bucket counts only and never an exemplar, and the OTLP protobuf
> serializer never writes the exemplar field. So the metric↔trace join (correlation
> contract #2, a *SHOULD*) is instead satisfied **server-side** by the LGTM
> bundle's **Tempo metrics-generator** (`send_exemplars: true`, enabled by default),
> which derives exemplar-bearing span metrics (`traces_spanmetrics_*{service="cart"}`)
> from Cart's traces — language-agnostic and pointing to the same trace_ids Cart
> stamps into its logs/events. This is the documented per-stack workaround ADR-0002
> anticipated; the trace↔log/event join (the *MUST*) is native and fully proven.

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
- **Cart (Node):** `@opentelemetry/auto-instrumentations-node` → one gRPC SERVER
  span per RPC with child ioredis CLIENT spans (`gRPC RPC → redis command`). Now
  MELT-complete (subsection below).
- **BFF (TS):** OTel auto-instrumentation; cross-service traces `bff → catalogue`
  and `bff → cart → redis` validated in Tempo. Still traces-only (next retrofit).

### Catalogue MELT implementation (reference — verified correlated 2026-06-01)

The reference four-signal bootstrap lives in
[`services/catalogue/internal/telemetry/`](services/catalogue/internal/telemetry/).
One shared `resource` feeds a tracer, a meter and a logger provider, so every
signal agrees on `service.name`/`service.namespace`/`deployment.environment`.
All SDK APIs were **verified in Docker** (compiler as ground truth) before use;
versions are recorded below for the Go stack the other retrofits diverge from.

- **Metrics (M).** A `MeterProvider` (`sdk/metric` v1.44.0) exports OTLP/gRPC via
  a periodic reader, with `exemplar.TraceBasedFilter`. A unary interceptor records
  **RED**: `rpc.server.requests` (counter, by `rpc.method` + `rpc.grpc.status_code`)
  and `rpc.server.duration` (histogram, seconds, explicit buckets). otelgrpc's
  built-in metrics are disabled (`otelgrpc.WithMeterProvider(noop)`) so the service
  owns the histogram and its **trace_id exemplars**. In Prometheus:
  `rpc_server_duration_seconds_{bucket,sum,count}` + `rpc_server_requests_total`,
  the histogram buckets carrying exemplars with `trace_id`/`span_id`.
- **Logs (L).** `slog` fans out (a small multi-handler) to stdout JSON *and* the
  OTel `otelslog` bridge (`contrib/bridges/otelslog` v0.19.0) → `sdk/log` v0.20.0
  → OTLP/gRPC → Loki. Handlers log with `slog.*Context`, so in-request records
  carry the active `trace_id`/`span_id` (Loki labels `service_name`,
  `service_namespace`, `deployment_environment`; `trace_id`/`span_id` per record).
- **Events (E).** Domain/lifecycle events use the **Logs API** with `SetEventName`
  (`catalogue.product.viewed`, `catalogue.products.listed`,
  `catalogue.search.performed`), emitted with the request context so they also
  carry `trace_id`/`span_id`. The EventName lands in the log body; events are
  identified by body + the `github.com/shoeshop/shoe-shop/services/catalogue`
  scope + their domain attributes.
- **Traces (T).** Unchanged from the existing wiring above
  (`gRPC RPC → pool.acquire → Postgres query`, + Meili HTTP on search).
- **Correlation proven (in the LGTM bundle).** A single `trace_id` joins **M → T → L**:
  an exemplar on `rpc_server_duration_seconds_bucket{rpc_method=…GetProduct}`
  resolves to a trace in Tempo (`/api/traces/<id>` → 200) whose `trace_id` selects
  that request's record in Loki (`{service_name="catalogue"} | trace_id="<id>"`).
  Events resolve the same way (`|= "catalogue.product.viewed"` → record with
  `trace_id` whose trace exists in Tempo). RED errors are visible
  (`rpc_server_requests_total{rpc_grpc_status_code="NotFound"}`).

> **Verified Go OTel module set** (compatible with `otel` v1.44.0 core):
> `otlpmetricgrpc`/`sdk/metric` v1.44.0 · `otlploggrpc`/`log`/`sdk/log` v0.20.0 ·
> `contrib/bridges/otelslog` v0.19.0 · `otelgrpc` v0.69.0. Each later stack
> (Node → Python → TS) re-verifies its own SDK APIs in Docker — logs/events
> maturity differs by language.

### Users MELT implementation (first retrofit — verified correlated 2026-06-01)

The Python retrofit lives in [`services/users/app/telemetry.py`](services/users/app/telemetry.py),
following the Catalogue reference: one shared `Resource` feeds tracer, meter and
logger providers; APIs verified in Docker first. Where Python diverges from Go is
documented inline — this is the cross-stack maturity ADR-0002 expected to surface.

- **Metrics (M).** `MeterProvider` with a `PeriodicExportingMetricReader` +
  `OTLPMetricExporter`, `exemplar_filter=TraceBasedExemplarFilter()`, and a `View`
  giving `rpc.server.duration` second-scale buckets. Python's gRPC
  instrumentation emits **spans only** (no server metrics), so a small
  `grpc.aio.ServerInterceptor` records the same **RED** as Go —
  `rpc.server.requests` (counter) + `rpc.server.duration` (histogram) by
  `rpc.method`/`rpc.grpc.status_code` — with trace_id exemplars (tracing
  interceptor ordered first so its span is active when metrics record).
- **Logs (L).** The stdlib-logging bridge (`LoggingHandler` on the root logger,
  alongside the existing stdout JSON handler) exports to OTLP→Loki and **captures
  the active trace_id/span_id automatically**; handler-level `log.info(..., extra=…)`
  becomes log attributes.
- **Events (E).** The dedicated Events API is **deprecated since 1.39.0**; the
  forward path used here is a **log record with the `event_name` field set**
  (`opentelemetry.sdk._logs._internal.LogRecord`) emitted via the Logs API logger
  — the Python equivalent of Go's `Record.SetEventName`
  (`users.user.created/viewed`, `users.users.listed`). In Loki, events are told
  apart from logs by `scope_name="shoeshop/users"` + body.
- **Traces (T).** Unchanged (`gRPC RPC → asyncpg SELECT`).
- **Correlation proven.** One `trace_id` joins **M → T → L/E**: an exemplar on
  `rpc_server_duration_seconds_bucket{rpc_method=…GetUser}` resolves in Tempo and
  selects that request's event/log in Loki. RED errors visible
  (`rpc_server_requests_total{rpc_grpc_status_code="NOT_FOUND"|"ALREADY_EXISTS"}`).

> **Verified Python OTel set:** `opentelemetry-sdk` 1.42.1 +
> `opentelemetry-exporter-otlp-proto-grpc` 1.42.1 (traces+metrics+logs SDKs and
> exporters all ship here — **no new packages** beyond the existing pins);
> instrumentation `grpc`/`asyncpg`/`fastapi` 0.63b1. Metrics + logs + events
> wired by hand in `app/telemetry.py`.

### Cart MELT implementation (Node retrofit — verified correlated 2026-06-02)

The Node retrofit lives in [`services/cart/src/telemetry.ts`](services/cart/src/telemetry.ts),
following the Catalogue reference: **one `NodeSDK`** wires tracer + meter + logger
providers off NodeSDK's auto-detected resource, so every signal agrees on
`service.name`/`service.namespace`/`deployment.environment` (from the `OTEL_*`
compose env). All SDK APIs were **verified in Docker** against the installed
versions before use. Where Node diverges from Go/Python is documented inline — the
exemplar gap is the cross-stack maturity ADR-0002 expected.

- **Metrics (M).** The gRPC auto-instrumentation emits **spans only** (no server
  metrics), so — like the Go/Python interceptor — a grpc-js **server interceptor**
  (`ServerInterceptingCall` + `ResponderBuilder.withSendStatus`) records **RED**:
  `rpc.server.requests` (counter) + `rpc.server.duration` (histogram, seconds) by
  `rpc.method`/`rpc.grpc.status_code`. Second-scale buckets via a `View` using the
  sdk-metrics 2.x data-style aggregation (`{ type: EXPLICIT_BUCKET_HISTOGRAM,
  options: { boundaries } }`). In Prometheus: `rpc_server_duration_seconds_*` +
  `rpc_server_requests_total` (RED errors visible as
  `rpc_grpc_status_code="INVALID_ARGUMENT"`).
  **Exemplar divergence (verified):** OpenTelemetry-JS (sdk-metrics 2.7.1, latest)
  does **not** attach metric exemplars — the histogram aggregator records bucket
  counts only and the OTLP serializer never writes the exemplar field (read from
  the installed SDK source; `query_exemplars` on `rpc_server_duration_seconds_bucket`
  returns empty, live). The metric↔trace link is instead provided by the LGTM
  bundle's **Tempo metrics-generator** (`send_exemplars: true`), whose
  `traces_spanmetrics_latency_bucket{service="cart"}` carries `traceID` exemplars
  derived from Cart's traces. This is the JS-stack workaround; see the §9 matrix
  note.
- **Logs (L).** A small `log` helper fans out to **stdout JSON** (so
  `task logs -- cart` still works) **and** the Logs API → OTLP → Loki. In-request
  records carry the active `trace_id`/`span_id` (captured automatically by the Logs
  API from the active context). Loki labels: `service_name`, `service_namespace`,
  `deployment_environment`, `scope_name="shoeshop/cart"`; `trace_id`/`span_id` per
  record.
- **Events (E).** Domain events use the **Logs API with the `eventName` field set**
  (`logger.emit({ eventName, body, attributes })`) — the JS equivalent of Go's
  `Record.SetEventName` (`cart.viewed`, `cart.item.added`, `cart.item.removed`,
  `cart.cleared`). Emitted inside the request span so they carry `trace_id`/
  `span_id`. As with Go/Python, the event name lands in the log **body** (Loki does
  not promote `event_name` to a label); events are told apart from logs by
  `scope_name="shoeshop/cart"` + body.
- **Traces (T).** Unchanged (`gRPC RPC → redis command`).
- **Correlation proven (in the LGTM bundle).** One `trace_id` joins **M → T → L/E**:
  an exemplar on `traces_spanmetrics_latency_bucket{service="cart",
  span_name="grpc.cart.v1.CartService/GetCart", status_code="STATUS_CODE_ERROR"}`
  (trace_id `9a872000…`) resolves in Tempo (200) and selects that request's record
  in Loki (`{service_name="cart"} | trace_id="9a872000…"` → the
  `"rejected cart request"` warn log); an AddItem exemplar (`ecc0c4be…`) resolves
  the same way to its `cart.item.added` **event**.

> **Verified Node OTel set** (all already present transitively — declared as direct
> deps): `@opentelemetry/sdk-node` `0.218.0` · `sdk-metrics` `2.7.1` ·
> `sdk-logs`/`api-logs`/`exporter-metrics-otlp-grpc`/`exporter-logs-otlp-grpc`
> `0.218.0` · `api` `1.9.1` · `@grpc/grpc-js` `1.14.4` (server interceptor).
> **No metric exemplars in OTel-JS** — the metric↔trace join is delegated to the
> bundle's Tempo metrics-generator (see above).

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
     coverage matrix, bounded `docs/dataset/` track;
  2. ✅ shared four-signal **telemetry bootstrap** on the reference stack (Go) —
     SDK APIs verified in Docker (`services/catalogue/internal/telemetry/`);
  3. **retrofit** — ✅ Catalogue (reference) · ✅ Users (Python, verified
     correlated) · ✅ Cart (Node, verified correlated — JS exemplars via the
     bundle's Tempo metrics-generator, §9); **next:** BFF (TS);
  4. ✅ for Catalogue + Users + Cart: all four signals validated correlated in
     Grafana/Tempo/Loki/Prometheus (matrix cells flipped); repeat per retrofit;
  5. move **Users → `core`** so the four validate together on the default profile
     (still pending — Users remains in the `full` profile for now).
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
