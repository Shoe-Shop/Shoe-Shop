# Shoe Shop — Architecture & Context

> **Living context document.** This is the single, accurate source of truth for
> what Shoe Shop *is*, what is *actually built* vs. planned, and the decisions
> behind it. Keep it honest and current — if the code and this file disagree,
> fix one of them. The README is the public-facing pitch; this file is the
> engineering ground truth.
>
> _Last updated: 2026-06-08 (**Storefront UX hardening + live account/orders (on top of the
> v0.3 write path).** Three shopper-facing capabilities landed, each verified live in the
> browser: (1) **BFF CORS** — the Next.js storefront calls the BFF **directly from the
> browser** (origin `:9000` → `:9001`), so every client-side cart/checkout call silently
> failed CORS preflight until `hono/cors` was added on `/api/*` (server-rendered pages had
> masked the gap — "works in SSR, dead in the browser"). This was the real cause of the
> always-empty bag. (2) **Account-gated checkout + real order history** — checkout now
> verifies the shopper exists via `Users.GetUser` before creating an order (`401` otherwise),
> and a new **`OrdersService.ListOrders(user_id)`** RPC (proto + Java `OrderRepository.findByUser`/
> `OrdersGrpcService` + BFF `GET /api/users/:id/orders`) backs a live order-history list on the
> account page. The storefront identity was unified onto the **seeded shopper id**
> (`11111111-…`, Ada) — it previously used a throwaway `u-demo` that never joined the account,
> so the account looked empty. (3) **Checkout feel** — a **required (mock, localStorage)
> shipping address** gating Place-order and shown on the order page; product **imagery fixed**
> in the bag/cart/order summary (ProductMedia needed `h-full w-full` to size the `fill` image);
> a customer-narrative **order timeline** (Authorizing payment → Order confirmed → **Shipped**,
> ending green with a tick + confetti); a **cart qty stepper fix** (`-`/`+` adjust quantity via
> the cart's `hincrby`, removing only at 0, instead of `RemoveItem` deleting the whole line);
> filled size-selector; and removed a light-theme hero scrim that washed out dark product
> imagery. Auth remains the single demo identity (Zitadel deferred). The 9-of-11 MELT status
> and the v0.3 write path are unchanged — this is storefront/BFF UX, not a new service.
> Previously: **Notification (Go) shipped MELT-complete — the last v0.3
> write-path service; 9 of 11 services MELT-complete, v0.3 write path COMPLETE (4/4)**.
> Notification is a **pure NATS JetStream subscriber** (ADR-0003 §3/§7): a durable consumer
> on the `ORDERS` stream filtered to the terminal lifecycle events `orders.confirmed`/
> `orders.cancelled`, which "sends" a customer notice — modeled as a `notification.sent`
> domain Event + a structured log — demonstrating fan-out off the saga. **No new transport,
> no datastore** (no gRPC/proto, no Postgres): it publishes nothing back. It reuses the
> Catalogue/Inventory Go telemetry package verbatim (scope `shoeshop/notification`) and the
> **consume side** of Inventory's NATS+OTel `traceparent`-in-headers spine, so each notice
> joins the one checkout trace. RED is over **consumed messages** (no RPC):
> `notification_messages_total` + `notification_process_duration_seconds_*` keyed by
> `subject`/`result`, with **native Go trace_id exemplars** (no JS/Rust gap). **Verified
> live:** a real checkout is **one trace** including Notification's `consume orders.confirmed`
> CONSUMER span (scope `shoeshop/notification`); the same saga `trace_id` (and the consume
> `span_id`) stamped the `notification.sent` event + log in Loki, and a
> `notification_process_duration_seconds_bucket` exemplar carried that exact trace_id
> (M→T→L/E on one id). A forced-decline run (`PAYMENT_FAILURE_RATE=1.0`) produced the
> symmetric `consume orders.cancelled` span and a `notification.sent` event with
> `cancel.reason=payment_do_not_honor`. Health is a tiny `/healthz` HTTP surface probed by
> the binary's own `healthcheck` subcommand (distroless, mirrors Payment). With this the
> **v0.3 NATS JetStream write path is complete (4/4)** — next is the incident/chaos framework
> (§10–11). See §9 "Notification MELT implementation".
> Previously: **Payment (Rust/Axum) shipped MELT-complete — the
> deterministic payment simulator; 8 of 11 services MELT-complete**, 3 of 4 write-path
> services done). Payment is a **NATS-only** saga participant (ADR-0003 §6): it consumes
> `payment.authorize` on the `PAYMENT` stream, decides authorize/decline by deterministic,
> env-tunable rules (amount band / hash-of-`order_id` failure rate / injected latency —
> default authorize-all, so the happy path works out of the box and incidents are opt-in),
> persists each decision to Postgres (idempotent, `UNIQUE(order_id)`), and publishes
> `payment.authorized`/`payment.declined` back for the Orders orchestrator. It is the first
> **Rust** stack and mirrors the NATS+OTel **`traceparent`-in-headers** spine in Rust
> (`services/payment/src/natstrace.rs`, the Go/Java reference). Born MELT-complete via
> `tracing` + `opentelemetry-otlp` (OTLP/gRPC); the consume/DB/publish spans join the
> single saga trace. **Verified live:** a real checkout is **one trace** `bff → orders →
> (NATS) → inventory → (NATS) → orders → (NATS) → payment → (NATS) → orders → CONFIRMED`
> (one Tempo trace spanning bff·cart·catalogue·inventory·orders·**payment**; the frontend
> span prepends when driven via the UI); the saga `trace_id` stamps payment's logs +
> events (`payment.authorized`/`payment.declined`, scope `shoeshop/payment`) in Loki, and
> RED (`payment_requests_total`/`payment_duration_seconds_*{service_name="payment"}`)
> carries correct resource labels. A forced-decline run (`PAYMENT_FAILURE_RATE=1.0`)
> reached **CANCELLED** via compensation (`inventory.release`). **Per-stack exemplar
> finding (verified in Docker by reading the SDK source):** `opentelemetry_sdk` 0.32 does
> **not** populate metric exemplars (the data model carries the field but there is no
> reservoir/filter pipeline and no `OTEL_METRICS_EXEMPLAR_FILTER`), so Payment has the
> **same exemplar gap as the JS/TS services** — the metric↔trace join is served by the
> bundle's Tempo metrics-generator (`traces_spanmetrics_*{service="payment"}`, verified
> with exemplars), not the app SDK. The async-correctness detail that matters in Rust: the
> handler runs inside `FutureExt::with_context(cx)` so the OTel context survives `.await`
> thread-hops and every log/event is correlated. See §9 "Payment MELT implementation".
> Previously: **Orders (Java/Spring) shipped MELT-complete — the v0.3
> checkout saga is live; 7 of 11 services MELT-complete**, 2 of 4 write-path services
> done. Orders is the **saga orchestrator** (ADR-0003): a sync gRPC front door
> (`CreateOrder`/`GetOrder`; persists PENDING, returns immediately) that drives the
> fulfilment saga asynchronously over NATS JetStream — owns the `ORDERS` stream,
> publishes `inventory.reserve`/`payment.authorize`, consumes the
> `inventory.reserved/rejected` + `payment.authorized/declined` replies, and runs an
> explicit state machine PENDING→RESERVING→AUTHORIZING→CONFIRMED with compensation to
> CANCELLED (conditional `UPDATE … WHERE status` as the atomic dedup guard). It is the
> first **Java** stack and the first instrumented by the **OpenTelemetry Java agent**
> (`-javaagent` 2.28.1, the idiomatic Java path) rather than a hand-wired SDK — only
> NATS trace propagation is hand-wired, mirroring Inventory's Go spine. **Verified
> live:** a real checkout (BFF `POST /api/checkout/:userId` → `Orders.CreateOrder`)
> produced **one 33-span Tempo trace** `frontend/bff → orders → (NATS) → inventory →
> (NATS) → orders` (the saga is ONE correlated trace across both async hops); the
> agent emits RED `rpc_server_duration_milliseconds_*{service_name="orders"}` with
> **native Java trace_id exemplars** (no JS gap), and the same saga trace_id stamps
> the orders logs + events (`orders.placed/reserved`, scope `shoeshop/orders`) in
> Loki — M→T→L/E all on one id. The happy path reached CONFIRMED (payment simulated
> via `nats-box`), an oversell reached CANCELLED via `inventory.rejected`. **Profile
> decision resolved:** the JVM-heavy write path is an opt-in `checkout` overlay
> (`task up:checkout`, real Orders + Inventory) so `core` stays lean; `full`/`lean-jvm`
> fold it in. See ADR-0003 + §9 "Orders MELT implementation". All Java versions/APIs
> were verified by building in Docker. Build/verify caveat: Docker Desktop crashed
> once mid-verification (WSL2 memory) and was restarted — no code impact.
> Previously: **Inventory (Go) shipped MELT-complete** — the first v0.3 write-path
> service: a sync gRPC stock-availability read path (GetStock/BatchGetStock,
> Postgres+sqlc) AND the inventory side of the checkout saga over NATS JetStream
> (consumes `inventory.reserve`/`inventory.release`, publishes
> `inventory.reserved`/`inventory.rejected`). It established the **W3C `traceparent`
> in NATS message headers** propagation pattern (CONSUMER span child of the remote
> producer; otelpgx tx spans; native Go trace_id exemplars) that Orders mirrors.
> Previously: **Frontend MELT-complete — verified correlated live in
> Grafana; 5 of 11 services MELT-complete**. Two build bugs in the wired
> instrumentation were fixed first: `useReportWebVitals` is imported from
> `next/web-vitals` (not `next/navigation`), and the Logs API type is `LogAttributes`
> (not `Attributes`) — the shipped image had never compiled. After rebuild: RED
> (`http_server_request_duration_seconds`), all 5 Web Vitals histograms, trace_id/
> span_id on every log/event, `frontend → bff → catalogue` traces, and
> `traces_spanmetrics{service="frontend"}` exemplars whose `traceID`s match the
> Loki event `trace_id`s — exemplar→trace→log proven. §2 / §9 matrix updated.
> Previously: Frontend MELT instrumentation wired — `src/instrumentation.ts`
> bootstraps NodeSDK; `src/lib/telemetry.ts` log/event helpers; Web Vitals →
> `/api/vitals` → OTel histograms; domain events from RSC page handlers;
> compose.core.yaml stub → real build. Previously: NEXUS frontend read path
> shipped — Next.js 15 App Router storefront with live BFF calls is now real; §2 / §4 /
> §11 updated.
> Previously: BFF MELT-complete — **all 4 real services are four-signal
> MELT-complete**, verified correlated in the LGTM bundle; Go reference + Python,
> Node and TS retrofits landed, §9. The retrofit phase is done. Both JS/TS services
> (Cart + BFF) carry the documented JS-stack exemplar caveat: metric↔trace exemplars
> come from the bundle's Tempo metrics-generator, as OpenTelemetry-JS does not emit
> them. BFF's RED is HTTP-server-side from instrumentation-http, not a hand-rolled
> interceptor. **Consistency/hygiene polish:** unified each service's own scope to
> `shoeshop/<svc>` (events told apart by `eventName`, not scope; stdlib-bridge logs
> keep their native scope — §9); pinned Cart/BFF to `OTEL_NODE_RESOURCE_DETECTORS=env`
> for resource parity (no `host.*`/`process.*` labels); excluded gRPC health probes
> from Catalogue's RED + traces — all re-verified live.)_

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
| **Frontend** (Next.js 15 App Router, NEXUS storefront) | ✅ **Done & MELT-complete** (v0.2-MELT) — home · shop (search + filter + sort) · PDP · cart · **checkout** (Place order → live `/order/[id]` status page polling the saga PENDING→CONFIRMED/CANCELLED) · account; live BFF calls; four signals **verified correlated** in Grafana (RED + Web Vitals histograms, trace_id-stamped logs/events, frontend→bff→catalogue traces, spanmetrics exemplars) |
| **Inventory** (Go, gRPC + NATS JetStream, Postgres+sqlc, OTel) | ✅ **Done & MELT-complete** (v0.3) — sync stock read path + async checkout-saga reserve/release; four signals **verified correlated**, incl. trace propagated across NATS |
| **Orders** (Java 21 · Spring Boot · gRPC + NATS JetStream, Postgres) | ✅ **Done & MELT-complete** (v0.3) — sync CreateOrder/GetOrder + the checkout-saga orchestrator (reserve → authorize → confirm, with compensation); four signals **verified correlated**, saga is one trace across NATS |
| **Payment** (Rust · Axum · NATS JetStream, Postgres) | ✅ **Done & MELT-complete** (v0.3) — the deterministic payment simulator (ADR-0003 §6); NATS-only saga participant (`payment.authorize` → `payment.authorized`/`payment.declined`); four signals **verified correlated**, joins the one saga trace across NATS |
| **Notification** (Go · NATS JetStream subscriber) | ✅ **Done & MELT-complete** (v0.3) — pure subscriber on the terminal saga events (`orders.confirmed`/`orders.cancelled`); "sends" a notice (`notification.sent` event); no datastore/transport; four signals **verified correlated**, `consume` span joins the one saga trace across NATS. **v0.3 write path complete (4/4).** |
| shipping, recommendation | 🟡 **Stubs** (full profile) |
| Zitadel auth | 🟡 Wired in `full` profile, not yet integrated |
| Incident / chaos framework | 🔴 **Planned** (see §11) |
| k3d / Helm / Argo CD / Istio paths | 🔴 **Planned / documented only** |

**Rule of thumb:** Catalogue, the BFF, Cart, Users, the **Frontend**, **Inventory**,
**Orders**, **Payment**, **Notification**, + the 5 infra containers contain real behaviour.
The **Frontend** (NEXUS, Next.js 15) calls the BFF live for catalogue, search, cart and
checkout. **Inventory** (Go), **Orders** (Java), **Payment** (Rust) and **Notification** (Go)
are the v0.3 write-path services: Orders is the checkout-saga orchestrator (sync
`CreateOrder`/`GetOrder` over gRPC, then the async saga over NATS JetStream), Inventory runs
the inventory side of that saga, Payment is the deterministic authorize/decline simulator,
and Notification is the pure subscriber that fans out off the saga's terminal events.
shipping and recommendation remain `traefik/whoami` placeholders. The five read-path real
services live in the **`core` profile** (`task up:core`); the v0.3 **write path (Orders +
Inventory + Payment + Notification) is the opt-in `checkout` overlay** — `task up:checkout`
brings up the read path + the real write path for end-to-end checkout traces, keeping `core`
lean (ADR-0003 profile decision). `full`/`lean-jvm` fold in the checkout overlay.

> **✅ Telemetry reality (retrofit complete; v0.3 write path COMPLETE — all born MELT-complete).**
> **Nine real services — Catalogue (Go), Users (Python), Cart (Node), BFF (TS), the
> Frontend (Next.js 15), Inventory (Go), Orders (Java/Spring), Payment (Rust) and now
> Notification (Go) — are MELT-complete:** Metrics + Events + Logs + Traces emitted and
> **verified correlated** in the LGTM bundle (§9). Per ADR-0002 the golden standard is
> **four correlated signals (MELT)**, so **9 of 11 services are MELT-complete** (the other
> 2 — shipping, recommendation — are `traefik/whoami` stubs that emit nothing real). The
> v0.2-MELT retrofit is done and the five read-path services come up together on the
> default `core` profile; the v0.3 write path — **Inventory (Go), Orders (Java), Payment
> (Rust), Notification (Go)** — is now **complete (4/4)**: the checkout saga is one
> correlated trace from the storefront click through reserve → authorize → confirm →
> notify, proving the NATS+OTel trace-propagation pattern across four stacks. Coverage is
> tracked in the matrix in §9. (The JS/TS services — Cart, BFF, Frontend — **and
> Rust/Payment** carry the documented exemplar caveat: their metric↔trace exemplars come
> from the bundle's Tempo metrics-generator, not the app SDK. The **three Go services** and
> Java/Orders emit metric exemplars natively — see the §9 Per-stack exemplar policy.)

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
| 1 | **frontend** | **TypeScript · Next.js 15 App Router** | — | — | **real** (MELT-complete) |
| 2 | **bff** | TypeScript · Hono | gRPC client → catalogue · cart · users | — | **real** (MELT-complete) |
| 3 | **catalogue** | **Go 1.25 · gRPC + sqlc** | gRPC | Postgres + Meilisearch | **real** |
| 4 | **cart** | Node.js · gRPC | gRPC | Redis | **real** |
| 5 | **orders** | **Java 21 · Spring Boot** | gRPC | Postgres + NATS | **real** (MELT-complete) |
| 6 | **payment** | **Rust · Axum + NATS** | — (NATS-only) | Postgres + NATS | **real** (MELT-complete) |
| 7 | **users** | **Python 3.12 · FastAPI + gRPC** | gRPC | Postgres | **real** |
| 8 | shipping | Kotlin · Ktor | gRPC | Postgres + NATS | stub |
| 9 | **inventory** | **Go · gRPC + NATS** | gRPC | Postgres + NATS | **real** (MELT-complete) |
| 10 | recommendation | Python · FastAPI + ONNX | gRPC | Postgres (replica) | stub |
| 11 | **notification** | **Go · NATS subscriber** | — (NATS-only) | — | **real** (MELT-complete) |
| — | zitadel | OIDC auth | — | Postgres | full profile |

---

## 5. Repository layout (key paths)

```
Taskfile.yml                  # dual-path task runner (go-task)
ARCHITECTURE.md               # this file
README.md                     # public pitch / blueprint
deploy/compose/               # compose.yaml (backbone) + profile overlays
  ├── compose.core.yaml       # read-path services (all REAL)
  ├── compose.checkout.yaml   # v0.3 write path: REAL orders (Java) + inventory (Go) + payment (Rust)
  ├── compose.full.yaml       # +remaining stubs +zitadel
  ├── compose.lean-jvm.yaml   # JVM heap caps
  ├── compose.pyroscope.yaml  # opt-in profiling
  ├── .env.example            # tags/creds/ports (committed); .env is gitignored
  └── initdb/                 # creates per-service databases
proto/                        # gRPC contracts (single source of truth)
  ├── buf.yaml / buf.gen.yaml
  ├── catalogue/v1 · cart/v1 · users/v1 · inventory/v1   # service contracts
  ├── gen/go/                 # COMMITTED Go stubs (catalogue + inventory)
  └── gen/python/             # COMMITTED Python stubs (linguist-generated)
docs/adr/                     # ADR-0001 (dev/RAM) · ADR-0002 (MELT) · ADR-0003 (write path)
services/catalogue/           # first real service (Go)
services/bff/                 # Hono BFF (TS)
services/cart/                # Cart (Node/TS)
services/users/               # Users (Python · FastAPI + gRPC)
services/frontend/            # NEXUS storefront (Next.js 15)
services/inventory/           # Inventory (Go · gRPC read + NATS saga) — v0.3
services/orders/              # Orders (Java · Spring Boot · gRPC + NATS saga) — v0.3
services/payment/             # Payment (Rust · Axum + NATS saga · deterministic simulator) — v0.3
```

---

## 6. Local dev workflow

- **Prereqs:** Docker Desktop (WSL2). The `task` CLI. Nothing else is required —
  all language/codegen toolchains run in containers.
- **Profiles (RAM dial):** `core` (7 svc, default — incl. all 4 real services),
  `full` (11 + Zitadel), `lean-jvm` (capped JVM heaps).
- **Dual path:** `task dev` (Hybrid — infra in Docker, edited service native)
  vs `task up:core` / `up:full` (everything containerized).
- **Common:** `task up:core`, `task ps`, `task logs -- <svc>`, `task down`,
  `task nuke` (also deletes volumes), `task obs` (prints endpoints).
- **Driving the gRPC services with `grpcurl`:** **catalogue** and **users**
  register gRPC server reflection, so `grpcurl -plaintext <svc>:9090 list` works
  with no proto. **cart** does not — pass the proto explicitly
  (`grpcurl -plaintext -import-path proto -proto cart/v1/cart.proto …`). The BFF is
  HTTP — drive it with `curl bff:8080/api/*`. Query the LGTM backends from a
  container on the `shoeshop` network (`otel-lgtm:9090` Prometheus, `:3100` Loki,
  `:3200` Tempo — none are host-published). **Use absolute time windows** in
  Loki/Prometheus queries: the WSL2 host clock can jump, so `now()-N` windows can
  silently miss recently-written data.

Measured footprint: `core` profile idles around **~0.9 GB** total (measured
~0.92 GB with all 7 services up — Users adds ~60 MiB; otel-lgtm is still ~70% of
the total); well within an 8 GB WSL2 budget.

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
      stamped with `trace_id` **where the stack's OTel SDK supports them** (Go,
      Python). For stacks that cannot emit metric exemplars (JS/TS — verified, see
      the **Per-stack exemplar policy** below), this clause is satisfied by the
      bundle's Tempo metrics-generator instead; app-level RED is still required.
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

### Instrumentation scope & the event-vs-log rule (standard for all services)

A service's **own** meter, logger and events use the instrumentation scope
**`shoeshop/<svc>`** (e.g. `shoeshop/catalogue`, `shoeshop/users`,
`shoeshop/cart`, `shoeshop/bff`). **Events are distinguished from logs by the OTel
`eventName` field — the name lands in the Loki *body* — not by scope.** Do not
encode "this is an event" in the scope name; the same `shoeshop/<svc>` scope
carries both the structured logs and the domain events of a service.

One documented exception: **bridged stdlib/runtime logs keep their native logger
scope.** Python's stdlib-logging→OTel bridge (Users) scopes each record by the
**Python logger name** (`users.service`, `users`, …), because that is how the
bridge works; only the hand-emitted Users *events* carry `shoeshop/users`. This is
fine — events are still told apart by `eventName`, and the resource attributes
(`service.name` etc.) still join every record. The rule above governs each
service's *own* instrumentation; it does not fight a language's logging bridge.

**Resource parity across stacks.** Every signal must carry the same minimal
resource: `service.name`, `service.namespace=shoeshop`, `deployment.environment=local`,
`telemetry.sdk.*` — and *only* that, so the dataset's label set is uniform. Go and
Python emit exactly this from `OTEL_RESOURCE_ATTRIBUTES`/`OTEL_SERVICE_NAME` + the
SDK. Node's `NodeSDK` would otherwise auto-detect `host.*`/`process.*` (rotating,
high-cardinality labels), so Cart and BFF pin **`OTEL_NODE_RESOURCE_DETECTORS=env`**
in Compose to match — verified live (no `host_*`/`process_*` labels in Loki or
Prometheus for cart/bff).

### Per-stack exemplar policy (the JS/TS exemplar gap — verified, durable)

**The finding (do not re-investigate from scratch — it is settled):**
**OpenTelemetry-JS does not emit metric exemplars.** Verified at the SDK source
(`@opentelemetry/sdk-metrics` **2.7.1**, the latest release, 2026-06): the
histogram aggregator (`HistogramAccumulation.record`) stores only bucket counts and
discards the trace context, `toMetricData()` emits **no** `exemplars` field, and the
OTLP protobuf serializer (`metrics-serializer.js`) never writes the exemplar wire
field (it is commented but unimplemented). The exemplar filter/reservoir classes
ship in the package but are imported by **nothing** in the metric-storage pipeline;
there is no `MeterProvider` option and no env var. An end-to-end test (record under
a sampled span) and a live `query_exemplars` both return **zero exemplars**. Go and
Python emit exemplars natively; **JS/TS (Cart, BFF) cannot.**

> **Rust shares this gap (verified in Docker, 2026-06).** `opentelemetry_sdk` **0.32**
> likewise does **not** populate metric exemplars: the metrics data model carries an
> `Exemplar<T>` type and `.exemplars()` accessors (for OTLP wire-compat), but every
> datapoint is constructed `exemplars: vec![]` and there is **no** `ExemplarFilter`/
> `ExemplarReservoir`/`with_exemplar` API and **no** `OTEL_METRICS_EXEMPLAR_FILTER`
> support — nothing fills the field. A live `query_exemplars` on
> `payment_duration_seconds_bucket` returned **zero**, while the bundle's
> `traces_spanmetrics_latency_bucket{service="payment"}` carried `traceID` exemplars.
> So **Payment (Rust)** follows the same policy below as the JS/TS services. (Go, Python
> and Java/agent remain the native-exemplar stacks.)

**The policy (applies to every stack whose SDK can't emit exemplars — JS/TS Cart, BFF,
Frontend, and Rust Payment):**
1. The service still emits **app-level RED** (counter + latency histogram by
   method/status, correct resource attrs) over OTLP. This is required and works.
2. The **metric↔trace exemplar** join (correlation-contract #2, a *SHOULD*) is
   delegated to the LGTM bundle's **Tempo metrics-generator**, which is enabled by
   default (`metrics_generator_processors: [service-graphs, local-blocks,
   span-metrics]`, `remote_write … send_exemplars: true` — baked into the
   `grafana/otel-lgtm` image's `tempo-config.yaml`). It derives
   `traces_spanmetrics_*{service="<svc>"}` with `traceID` exemplars from the
   service's **own traces**, pointing to the same `trace_id`s the service stamps
   into its logs/events. Grafana's datasources are pre-provisioned for the
   exemplar → Tempo → Loki pivot. This is language-agnostic and needs **no app code
   and no bundle changes**.
3. The **trace↔log/event** join (the *MUST*, correlation-contract #1) is native and
   unaffected — JS captures `trace_id`/`span_id` on log/event records from the
   active context.

This is the documented per-stack workaround ADR-0002 anticipated ("some signals may
need workarounds … logs and especially exemplars mature at different rates across
Go / Node / Python"). It is **not** a defect to fix in our code — it is upstream SDK
reality; revisit only if OTel-JS later wires exemplars.

### Telemetry coverage matrix

Tracks each real service against the four signals. `M` Metrics · `E` Events ·
`L` Logs · `T` Traces. (Stubs omitted — they emit nothing real.)

| Service | Stack | M | E | L | T | MELT-complete |
|---------|-------|---|---|---|---|---------------|
| catalogue | Go | ✅ | ✅ | ✅ | ✅ | ✅ (reference — verified correlated) |
| users | Python | ✅ | ✅ | ✅ | ✅ | ✅ (first retrofit — verified correlated) |
| cart | Node | ✅† | ✅ | ✅ | ✅ | ✅ (verified correlated — † exemplars via bundle, see note) |
| bff | TS | ✅† | ✅ | ✅ | ✅ | ✅ (verified correlated — † exemplars via bundle, same JS gap as Cart) |
| frontend | TS · Next.js 15 | ✅† | ✅ | ✅ | ✅ | ✅ (verified correlated — † exemplars via bundle, same JS gap as Cart/BFF) |
| inventory | Go | ✅ | ✅ | ✅ | ✅ | ✅ (v0.3 write-path — verified correlated; **native** Go exemplars, no JS gap; trace propagated across NATS) |
| orders | Java · Spring Boot | ✅‡ | ✅ | ✅ | ✅ | ✅ (v0.3 saga orchestrator — verified correlated; **native** Java exemplars via the OTel agent, no JS gap; saga is ONE trace across NATS) |
| payment | Rust · Axum | ✅† | ✅ | ✅ | ✅ | ✅ (v0.3 payment simulator — verified correlated; **exemplar gap like JS** (opentelemetry_sdk 0.32, †) → Tempo metrics-generator; joins the ONE saga trace across NATS) |
| notification | Go | ✅ | ✅ | ✅ | ✅ | ✅ (v0.3 fan-out subscriber — verified correlated; **native** Go exemplars, no JS/Rust gap; `consume orders.confirmed`/`orders.cancelled` joins the ONE saga trace across NATS) |

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
>
> **† BFF Metrics — same JS-stack exemplar gap (verified in Docker).** BFF is the
> same OpenTelemetry-JS family as Cart, so the exemplar finding is identical and not
> re-litigated. BFF's RED is **HTTP-server-side**, emitted by
> `@opentelemetry/instrumentation-http` (0.218) directly (verified in Docker — no
> hand-rolled interceptor): with `OTEL_SEMCONV_STABILITY_OPT_IN=http` it emits the
> stable `http_server_request_duration_seconds_*{service_name="bff"}` (rate via
> `_count`, errors via `http_response_status_code`, e.g. `404`). Like Cart, OTel-JS
> attaches **no metric exemplars** (`query_exemplars` on the app histogram returned
> empty, live), so the metric↔trace join is provided by the bundle's Tempo
> metrics-generator (`traces_spanmetrics_latency_bucket{service="bff"}` with
> `traceID` exemplars). The trace↔log/event join is native and fully proven.
>
> **† Frontend Metrics — same JS-stack exemplar gap (verified in Docker).** The
> Frontend (Next.js 15, OTel-JS family) emits app-level RED HTTP-server-side from
> `@opentelemetry/instrumentation-http` with `OTEL_SEMCONV_STABILITY_OPT_IN=http`
> (`http_server_request_duration_seconds_*{service_name="frontend"}`, seconds-scale
> like BFF) **plus** client-side Core Web Vitals as histograms
> (`frontend_web_vital_{lcp,cls,inp,fcp,ttfb}_*`, captured by `useReportWebVitals`
> from `next/web-vitals` → `POST /api/vitals` → server-side `MeterProvider`). As
> with Cart/BFF, OTel-JS attaches **no metric exemplars**, so the metric↔trace join
> comes from the bundle's Tempo metrics-generator
> (`traces_spanmetrics_latency_bucket{service="frontend"}` with `traceID`
> exemplars). **Verified correlated live:** a `GET /shop?q=runner` spanmetrics
> exemplar's `traceID` matched both a Tempo `frontend → bff → catalogue` trace and
> the `frontend.search.performed` event's `trace_id` in Loki — exemplar → trace →
> log/event all on one id. Outgoing server-side `fetch → bff` calls emit CLIENT
> spans that propagate `traceparent`, so Frontend trace roots are cross-service.
>
> **‡ Orders Metrics — the OTel Java agent emits RED natively (verified in Docker).**
> Unlike the hand-wired Go/Python interceptors, Orders' RED comes from the
> OpenTelemetry Java **agent's** gRPC instrumentation as
> `rpc_server_duration_milliseconds_*{service_name="orders"}` (rate via `_count`,
> errors via `rpc_grpc_status_code`, keyed by `rpc_method` ∈ {CreateOrder, GetOrder}).
> Two documented divergences from the Go services, both inherent to the agent and
> harmless to the dataset: the histogram unit is **milliseconds** (not seconds) and
> `rpc_grpc_status_code` is the **numeric** code (`0` = OK). Crucially, **the OTel
> Java SDK attaches metric exemplars natively** (verified live: a
> `rpc_server_duration_milliseconds_bucket` exemplar carried the saga `trace_id`) —
> so Orders, like the two Go services, has **no JS exemplar gap** and needs no
> Tempo-metrics-generator workaround. The agent also emits rich `jvm_*`,
> `db_client_*` (Hikari/JDBC) and `otlp_exporter_*` metrics for free.

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
  and `bff → cart → redis` validated in Tempo. Now MELT-complete (subsection below).

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
  the histogram buckets carrying exemplars with `trace_id`/`span_id`. **gRPC
  health-probe RPCs (`/grpc.health.v1.Health/*`) are excluded** from RED (and from
  traces, via `otelgrpc.WithFilter`) so the rate/error series reflect real product
  traffic only — parity with cart/bff/users (whose health surface is HTTP).
- **Logs (L).** `slog` fans out (a small multi-handler) to stdout JSON *and* the
  OTel `otelslog` bridge (`contrib/bridges/otelslog` v0.19.0) → `sdk/log` v0.20.0
  → OTLP/gRPC → Loki. Handlers log with `slog.*Context`, so in-request records
  carry the active `trace_id`/`span_id` (Loki labels `service_name`,
  `service_namespace`, `deployment_environment`, `scope_name="shoeshop/catalogue"`;
  `trace_id`/`span_id` per record).
- **Events (E).** Domain/lifecycle events use the **Logs API** with `SetEventName`
  (`catalogue.product.viewed`, `catalogue.products.listed`,
  `catalogue.search.performed`), emitted with the request context so they also
  carry `trace_id`/`span_id`. The EventName lands in the log body; events are
  identified by that `eventName` body (not by scope — meter, logger and events all
  share the service scope `shoeshop/catalogue`) plus their domain attributes.
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
  becomes log attributes. Per the §9 scope rule's documented exception, bridged logs
  carry `scope_name` = the **Python logger name** (`users.service`, `users`), not
  `shoeshop/users` — that is how the stdlib bridge scopes. Only the hand-emitted
  events (below) use `shoeshop/users`; every record still joins on `service.name`
  etc.
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
providers off NodeSDK's resource, so every signal agrees on
`service.name`/`service.namespace`/`deployment.environment` (from the `OTEL_*`
compose env). The resource detectors are pinned to **`OTEL_NODE_RESOURCE_DETECTORS=env`**
in Compose so the emitted resource matches the Go/Python services exactly (no
`host.*`/`process.*` labels — see §9 "Resource parity"). All SDK APIs were
**verified in Docker** against the installed versions before use. Where Node
diverges from Go/Python is documented inline — the exemplar gap is the cross-stack
maturity ADR-0002 expected.

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
  not promote `event_name` to a label); events are told apart from logs by their
  `eventName` body — both logs and events share `scope_name="shoeshop/cart"`.
- **Traces (T).** Unchanged (`gRPC RPC → redis command`).
- **Correlation proven (in the LGTM bundle).** One `trace_id` joins **M → T → L/E**:
  an exemplar on `traces_spanmetrics_latency_bucket{service="cart",
  span_name="grpc.cart.v1.CartService/GetCart", status_code="STATUS_CODE_ERROR"}`
  resolves in Tempo (`/api/traces/<id>` → 200) and selects that request's record
  in Loki (`{service_name="cart"} | trace_id="<id>"` → the `"rejected cart request"`
  warn log); an `AddItem` exemplar resolves the same way to its `cart.item.added`
  **event**. *(Query shapes are authoritative; specific trace_ids are illustrative —
  the LGTM bundle is ephemeral, so the IDs differ on every run.)*

> **Verified Node OTel set** (all already present transitively — declared as direct
> deps): `@opentelemetry/sdk-node` `0.218.0` · `sdk-metrics` `2.7.1` ·
> `sdk-logs`/`api-logs`/`exporter-metrics-otlp-grpc`/`exporter-logs-otlp-grpc`
> `0.218.0` · `api` `1.9.1` · `@grpc/grpc-js` `1.14.4` (server interceptor).
> **No metric exemplars in OTel-JS** — the metric↔trace join is delegated to the
> bundle's Tempo metrics-generator (see above).

### BFF MELT implementation (TS retrofit — verified correlated 2026-06-02)

The TS retrofit lives in [`services/bff/src/telemetry.ts`](services/bff/src/telemetry.ts),
following the Cart (Node) retrofit — **same OTel-JS family**, so it reuses Cart's
**one `NodeSDK`** wiring (tracer + meter + logger off its resource, detectors pinned
to `OTEL_NODE_RESOURCE_DETECTORS=env` for parity — see §9 "Resource parity") and
its `log` / `event` fan-out helpers verbatim. APIs were **verified in Docker** before
use. BFF is the **last** real traces-only service; finishing it makes **4 of 4 real
services MELT-complete**. Where BFF diverges from Cart is the **RED surface**: BFF is
a Hono HTTP server (`@hono/node-server`) + a gRPC **client** to catalogue/cart, not a
gRPC server — so RED is **HTTP-server-side**, not gRPC.

- **Metrics (M).** Verified in Docker: `@opentelemetry/instrumentation-http` (0.218)
  **already emits an HTTP server duration histogram**, so — unlike the Go/Python/Cart
  gRPC interceptor — RED needs **no hand-rolled recorder**. `telemetry.ts` opts into
  the **stable** HTTP semconv (`OTEL_SEMCONV_STABILITY_OPT_IN=http`, set in code
  before the instrumentation constructs) so it emits the seconds-scale
  `http.server.request.duration` (stable attrs `http.request.method`,
  `http.response.status_code`) rather than the legacy ms metric; a `View` aligns its
  buckets with the cross-stack reference. In Prometheus:
  `http_server_request_duration_seconds_*{service_name="bff"}` — rate via `_count`,
  RED errors visible as `http_response_status_code="404"`. (`http.route` is absent
  because Hono is fetch-based and the http instrumentation never sees the matched
  route — verified; RED is keyed by method + status.) **Exemplar divergence
  (verified):** identical to Cart — OTel-JS attaches no metric exemplars
  (`query_exemplars` on `http_server_request_duration_seconds_bucket` returned empty,
  live), so the metric↔trace link is provided by the bundle's Tempo metrics-generator
  (`traces_spanmetrics_latency_bucket{service="bff"}` with `traceID` exemplars). See
  the §9 matrix note and Per-stack exemplar policy.
- **Logs (L).** The same `log` fan-out helper as Cart — stdout JSON (so
  `task logs -- bff` works) **and** the Logs API → OTLP → Loki. **Verified in Docker:
  the http SERVER span is active inside the Hono fetch handler** (Hono is fetch-based,
  so this was the key check), so in-request records carry the active
  `trace_id`/`span_id`. Loki labels: `service_name`, `service_namespace`,
  `deployment_environment`; `scope_name="shoeshop/bff"` + `trace_id`/`span_id` per
  record (the latter two are structured metadata, not stream labels).
- **Events (E).** Logs API with the `eventName` field set, emitted inside the request
  span — modest, read-path domain events: `bff.products.listed`, `bff.product.viewed`,
  `bff.search.performed`, `bff.cart.viewed`. The name lands in the Loki **body**;
  events are told apart from logs by their `eventName` body — both logs and events
  share `scope_name="shoeshop/bff"`. Richer domain events arrive with the v0.3 NATS
  write path.
- **Traces (T).** Unchanged (`bff → catalogue` and `bff → cart → redis`).
- **Correlation proven (in the LGTM bundle).** One `trace_id` joins
  **M → T → L/E**: a `traces_spanmetrics_latency_bucket{service="bff",
  span_name="grpc.catalogue.v1.CatalogueService/GetProduct",
  status_code="STATUS_CODE_ERROR"}` exemplar resolves in Tempo (`/api/traces/<id>`
  → 200) and selects that request's `"downstream gRPC error"` warn log in Loki
  (`http_route="/api/products/:id"`, `rpc_grpc_status_code="NOT_FOUND"`,
  `http_response_status_code="404"`); a `SearchProducts` exemplar resolves the same
  way to its `bff.search.performed` **event** (`search.query=…`). App RED errors are
  visible (`http_server_request_duration_seconds_count{…status_code="404"}`).
  *(Query shapes are authoritative; specific trace_ids are illustrative — the LGTM
  bundle is ephemeral, so the IDs differ on every run.)*

> **Verified TS OTel set** (same as Cart — all present transitively, declared as
> direct deps): `@opentelemetry/sdk-node` `0.218.0` · `auto-instrumentations-node`
> `0.76.0` (incl. `instrumentation-http` `0.218.0`) · `sdk-metrics` `2.7.1` ·
> `sdk-logs`/`api-logs`/`exporter-metrics-otlp-grpc`/`exporter-logs-otlp-grpc`
> `0.218.0` · `api` `1.9.1`. **No metric exemplars in OTel-JS** — the metric↔trace
> join is delegated to the bundle's Tempo metrics-generator (see above). RED is the
> http instrumentation's own metric (no interceptor).

### Frontend MELT implementation (Next.js 15 — wired 2026-06-04, verify in Grafana)

The frontend MELT bootstrap follows the same OTel-JS family as BFF/Cart. Key files:
[`services/frontend/src/instrumentation.ts`](services/frontend/src/instrumentation.ts) —
the Next.js `register()` hook (called once at startup, before any request);
[`services/frontend/src/lib/telemetry.ts`](services/frontend/src/lib/telemetry.ts) —
server-side `log` / `event` helpers for RSC page handlers.

**Where Frontend diverges from BFF:**
- OTel is initialised via **`register()` in `instrumentation.ts`** (Next.js's
  instrumentation hook, stable in Next.js 15), not via `node -r ...` at startup.
  All OTel imports inside `register()` are **dynamic** (`await import(...)`) to
  prevent Next.js's bundler from trying to bundle gRPC native modules (gRPC packages
  are also listed in `serverExternalPackages` in `next.config.ts`).
- **Traces (T):** Next.js instruments RSC page renders and server-side `fetch` calls
  internally via `@opentelemetry/api`; those spans flow to the registered
  TracerProvider automatically. `instrumentation-http` adds CLIENT spans for
  outgoing server-side fetch → BFF calls. `/_next/*` and `/api/healthz` are
  excluded from traces and the RED metric (not user traffic).
- **Metrics (M):** `instrumentation-http` (stable semconv,
  `OTEL_SEMCONV_STABILITY_OPT_IN=http`) emits `http.server.request.duration`
  (seconds-scale, same View buckets as BFF) for server-side RED.
  **Web Vitals** (LCP, CLS, INP, FCP, TTFB) are captured client-side by
  `<WebVitalsReporter />` (`useReportWebVitals` → `fetch POST /api/vitals`) and
  recorded in the `/api/vitals` route handler as `frontend.web_vital.{lcp,cls,...}`
  OTel histograms — the only client-side metric bridge. JS metric-exemplar gap
  applies here too (§9 Per-stack exemplar policy); Tempo metrics-generator handles
  the metric↔trace join.
- **Logs (L):** `telemetry.ts` `log()` fans out to stdout JSON (so
  `task logs -- frontend` works) and the Logs API → OTLP → Loki. In-request records
  carry `trace_id`/`span_id` from the active RSC page span. Scope:
  `shoeshop/frontend`.
- **Events (E):** Domain events emitted from RSC page handlers inside the active
  RSC span — `frontend.page.viewed` (home, shop), `frontend.product.viewed` (PDP),
  `frontend.search.performed` (shop with query). Each carries domain attributes
  (`page.name`, `product.id`, `search.query`, counts). Events carry `trace_id`/
  `span_id` automatically (Logs API reads the active context).
- **Correlation:** `trace_id` from the RSC span joins logs + events in Loki to the
  same render trace in Tempo. Exemplar → trace pivot uses the bundle's Tempo
  metrics-generator (`traces_spanmetrics_*{service="frontend"}`).

> **Matrix cells stay ⬜ until verified live in Grafana** — update them after
> confirming in the LGTM bundle that all four signals arrive and the `trace_id`
> join works end-to-end.

> **OTel package set** (same verified versions as BFF/Cart):
> `@opentelemetry/sdk-node` `0.218.0` · `auto-instrumentations-node` `0.76.0` ·
> `sdk-metrics` `2.7.1` · `sdk-logs`/`api-logs`/OTLP exporters `0.218.0` ·
> `api` `1.9.1`. `serverExternalPackages` in `next.config.ts` exempts gRPC +
> auto-instrumentations from webpack bundling.

### Inventory MELT implementation (Go · v0.3 write path — verified correlated 2026-06-04)

Inventory is the **first v0.3 write-path service** and the first to span both the
sync and async transports. It reuses the Catalogue Go reference telemetry package
verbatim (`services/inventory/internal/telemetry/` — same module set, same RED
interceptor, same slog fan-out and Logs-API events, scope `shoeshop/inventory`),
and adds **one new, reusable piece**: trace-context propagation over NATS.

- **Two surfaces.** A gRPC server (`GetStock`, `BatchGetStock`) is the sync stock
  **read** path (Postgres+sqlc, `otelpgx` query spans, RED via the shared unary
  interceptor with **native Go trace_id exemplars**). The async **write** path is
  the inventory side of the checkout saga: a JetStream durable consumer
  (`inventory-worker`, `FilterSubjects: [inventory.reserve, inventory.release]`,
  AckExplicit, `MaxDeliver: 5`) on the `INVENTORY` stream (`inventory.>`).
- **Saga logic.** `inventory.reserve` reserves every order line in **one Postgres
  transaction** (`ReserveStock` is a conditional `UPDATE … WHERE on_hand - reserved
  >= qty`; a no-row result = insufficient stock → roll back → publish
  `inventory.rejected`); success publishes `inventory.reserved`.
  `inventory.release` (compensation) restocks, clamped at zero (idempotent). Replies
  go back on the `INVENTORY` stream for the Orders orchestrator to consume.
- **NATS+OTel propagation (the new spine, ADR-0003 §5).**
  `telemetry/nats.go` adapts `nats.Header` to an OTel `TextMapCarrier`:
  **`InjectTrace`** writes the active `traceparent` into outgoing message headers;
  **`StartConsumeSpan`** extracts it and opens a `SPAN_KIND_CONSUMER` span as the
  producer's child; **`StartPublishSpan`** opens a `SPAN_KIND_PRODUCER` span for
  replies. So one saga step is **one trace** spanning the async hop. This Go helper
  is the reference Orders / Payment / Notification will mirror in their stacks.
- **Correlation proven (live).** Publishing `inventory.reserve` with a
  `traceparent` header (`00-aa…aa-1111111111111111-01`) produced a single Tempo
  trace under trace_id `aa…aa`: `consume inventory.reserve` (CONSUMER, parent =
  the remote header span `1111…`) → otelpgx `pool.acquire / BEGIN / ReserveStock×2
  / COMMIT` → `publish inventory.reserved` (PRODUCER) — all `service.name=inventory`.
  The same trace_id stamps the in-request Loki logs + the `inventory.reserved`
  event; RED (`rpc_server_requests_total{service_name="inventory",
  rpc_grpc_status_code="OK"|"NotFound"}`) and the latency histogram carry **native**
  `trace_id` exemplars (Go emits these — unlike the JS/TS services). A reserve
  exceeding the scarce SKU's stock produced `inventory.rejected`.
  *(Query shapes are authoritative; specific trace_ids are illustrative — the LGTM
  bundle is ephemeral.)*

> **NATS+OTel trace propagation — the v0.3 cross-cutting pattern.** Async signals
> only join the corpus if trace context crosses the broker. The settled approach
> (verified in Docker on the Go stack with `nats.go` v1.52.0 `jetstream`): the
> producer injects W3C `traceparent` into NATS **message headers**; the consumer
> extracts it and starts a CONSUMER-kind span parented to the producer span, so the
> handler's logs/events/metrics carry the saga trace_id. Headers, not the JSON body
> (which stays the human-readable ADR-0003 envelope). Every later async service
> reuses this; only the per-stack carrier code differs.

> **Verified Go OTel + NATS set** (Catalogue's set + NATS): `nats.go` v1.52.0
> (`jetstream` package), `google/uuid` v1.6.0; OTel core `v1.44.0` / log+sdk/log
> `v0.20.0` / otelslog `v0.19.0` / otelgrpc `v0.69.0` (unchanged from Catalogue).

### Orders MELT implementation (Java · Spring Boot · v0.3 saga orchestrator — verified correlated 2026-06-05)

Orders is the **checkout-saga orchestrator** (ADR-0003) and the project's first
**Java** stack. Unlike every other service (which hand-wires the OTel SDK), Orders
is instrumented by the **OpenTelemetry Java agent** (`-javaagent`, v2.28.1) — the
idiomatic Java path, decided with the user. The agent auto-instruments Spring,
grpc-netty and JDBC; only the **NATS trace propagation is hand-wired**, mirroring
Inventory's Go `telemetry/nats.go`. Code:
[`services/orders/`](services/orders/) (Maven; `OrdersGrpcService`, `SagaOrchestrator`,
`SagaConsumer`, `telemetry/NatsTracing` + `telemetry/Events`). All versions/APIs
were **verified by building in Docker** (compiler as ground truth) — Spring Boot
`3.4.1`, grpc-java `1.68.1`, protobuf `4.28.2`, `io.nats:jnats` `2.20.4`,
opentelemetry-api `1.45.0`.

- **Two surfaces.** A gRPC server (`CreateOrder`, `GetOrder`) is the **sync front
  door**: CreateOrder persists a PENDING order (Postgres via Spring `JdbcClient`,
  agent-instrumented JDBC spans) and returns immediately; the async **saga** runs
  over JetStream — Orders owns the `ORDERS` stream and runs durable consumers on the
  `INVENTORY`/`PAYMENT` reply streams.
- **Saga state machine (the only saga authority).** PENDING → RESERVING →
  AUTHORIZING → CONFIRMED, compensating to CANCELLED. Each step is a **conditional**
  `UPDATE … WHERE status = :from` used as an atomic dedup guard, so duplicate/late
  JetStream replies are safe no-ops (idempotency keyed on `order_id`). CreateOrder
  publishes `orders.placed` + `inventory.reserve`; on `inventory.reserved` →
  `payment.authorize`; on `payment.authorized` → CONFIRMED + `orders.confirmed`;
  `inventory.rejected` short-circuits to CANCELLED (no payment), `payment.declined`
  publishes `inventory.release` then CANCELLED. **Verified live:** the happy path
  reached CONFIRMED and an oversell (scarce SKU) reached CANCELLED via
  `inventory.rejected`.
- **Metrics (M).** Agent-native RED + native exemplars — see the §9 matrix **‡**
  note (`rpc_server_duration_milliseconds_*`, ms unit, numeric status; native
  `trace_id` exemplars; plus `jvm_*`/`db_client_*`). **No JS exemplar gap** (Java,
  like Go, emits them). Resource parity (§9) is kept by disabling the agent's
  host/process/os/container resource providers via
  `OTEL_JAVA_DISABLED_RESOURCE_PROVIDERS`.
- **Logs (L).** SLF4J/Logback → the agent's OpenTelemetry appender → OTLP → Loki,
  with `trace_id`/`span_id` injected from the active span. App logs keep their
  **logger-class scope** (`com.shoeshop.orders.…`) — the §9 documented exception for
  bridged logs (parallel to Python's logger-name scope).
- **Events (E).** Domain events via the **stable** OTel Logs API
  (`telemetry/Events`): the event name is the record **body** + an `event.name`
  attribute, scope **`shoeshop/orders`** — the same observable join as the other
  services (`orders.placed`, `orders.reserved`, `orders.confirmed`, `orders.cancelled`).
  *Per-stack note:* OTel-Java's formal OTLP `EventName` field is incubator-only
  (verified absent from the stable `ExtendedLogRecordBuilder` in 1.45), so Java uses
  body+attribute — identical join behaviour, no unstable API.
- **NATS+OTel propagation (mirrors Inventory).** `telemetry/NatsTracing` adapts
  `io.nats.client.impl.Headers` to an OTel `TextMap` carrier: inject the active
  context on publish (PRODUCER span `publish <subject>`), extract + open a CONSUMER
  span (`consume <subject>`) on receive — scope `shoeshop/orders`, matching the Go
  reference. The agent *also* ships a jnats instrumentation
  (`io.opentelemetry.nats-2.17`); it is **disabled** (`OTEL_INSTRUMENTATION_NATS_ENABLED=false`)
  so the saga's NATS spans are exactly this hand-wired spine (no duplicate
  `<subject> process` spans). Propagation is agent-independent (pure OTel-API).
- **Correlation proven (live, in the LGTM bundle).** A single checkout produced
  **one 33-span Tempo trace** `frontend/bff → bff→cart, bff→catalogue→postgres →
  orders CreateOrder → (INSERT/UPDATE JDBC) → publish inventory.reserve →
  **inventory** consume inventory.reserve → ReserveStock tx → publish
  inventory.reserved → **orders** consume inventory.reserved → publish
  payment.authorize`. The same saga `trace_id` was carried by the orders RED
  exemplar **and** by the orders logs/events in Loki (`orders.placed`,
  `orders.reserved` at scope `shoeshop/orders`) — M → T → L/E all on one id, across
  two async NATS hops. (At the time of that run Payment was simulated via `nats-box`;
  it is now the **real Rust service** — see the Payment subsection below, where the
  whole saga including the payment hop is one trace.)

> **Verified Java OTel + saga set** (built in Docker): OpenTelemetry Java **agent**
> `2.28.1` (pinned) + opentelemetry-api `1.45.0`; Spring Boot `3.4.1` (Java 21);
> grpc-java `1.68.1` (grpc-netty-shaded + protobuf `4.28.2`, xolstice
> protobuf-maven-plugin `0.6.1`); `io.nats:jnats` `2.20.4`. The agent emits all four
> signals over OTLP/gRPC from `OTEL_*` env alone; only `NatsTracing`/`Events` are
> app code.

### Payment MELT implementation (Rust · Axum + NATS · v0.3 simulator — verified correlated 2026-06-06)

Payment is the **deterministic payment simulator** (ADR-0003 §6) and the project's first
**Rust** stack. Unlike Orders (OTel Java agent), Rust has no agent — all four signals are
hand-wired with the `tracing` + OpenTelemetry crates, and the NATS+OTel propagation
mirrors Inventory's Go `telemetry/nats.go`. It is a **NATS-only** saga participant (no
gRPC/proto): a JetStream durable consumer (`payment-authorize-worker`, `filter_subject:
payment.authorize`, AckExplicit, `max_deliver: 5`) on the `PAYMENT` stream, plus a tiny
Axum `/healthz` for the container probe. Code: [`services/payment/`](services/payment/)
(`saga.rs`, `decision.rs`, `store.rs`, `telemetry.rs`, `natstrace.rs`). All crate
versions/APIs were **verified by reading the crate source + building in Docker** (compiler
as ground truth) before use.

- **Deterministic decision (the simulator).** `decision.rs` decides authorize/decline by
  env-tunable rules, precedence: (1) **amount band** `[PAYMENT_DECLINE_MIN_CENTS,
  PAYMENT_DECLINE_MAX_CENTS]`; (2) **failure rate** — a stable fraction of `order_id`
  (`PAYMENT_FAILURE_RATE`, hashed not random, so the *same order* always gets the same
  outcome → replayable incidents); (3) else authorize. `PAYMENT_LATENCY_MS` injects
  processing latency. **Defaults authorize everything**, so the happy path works out of
  the box and incidents are opt-in.
- **Idempotent persistence.** `store.rs` upserts one row per saga decision into the
  `payment` Postgres DB (`INSERT … ON CONFLICT (order_id) DO NOTHING RETURNING`); a
  redelivered `payment.authorize` replays the stored decision instead of charging twice.
  The DB call runs inside a `db.payments.record_decision` span (parity with Orders' JDBC /
  Inventory's pgx query spans).
- **Metrics (M).** A hand-rolled RED recorder (`telemetry.rs`): `payment.requests`
  (counter) + `payment.duration` (histogram, seconds) keyed by `subject` + `result`
  (`authorized`/`declined`). In Prometheus: `payment_requests_total` +
  `payment_duration_seconds_*{service_name="payment"}`. **Exemplar gap (verified):**
  `opentelemetry_sdk` 0.32 does not populate exemplars — see the §9 Per-stack exemplar
  policy Rust note — so the metric↔trace join comes from the bundle's Tempo
  metrics-generator (`traces_spanmetrics_*{service="payment"}`), as for the JS/TS services.
- **Logs (L).** `tracing` fans out to **stdout JSON** (so `task logs -- payment` works)
  *and*, via `opentelemetry-appender-tracing`, to OTLP → Loki. In-request records carry
  the active `trace_id`/`span_id` (the `SdkLogger` reads `Context::current()` at emit).
  App logs keep their **module-path scope** (the §9 documented bridged-logs exception,
  parallel to Python/Java); domain events use the service scope.
- **Events (E).** Domain events are `tracing` events with `name:` → OTel **EventName** and
  `target: "shoeshop/payment"` → the instrumentation **scope** (`payment.authorized`,
  `payment.declined`); the event name is also the log **body**, matching the other
  services' convention. They carry `trace_id`/`span_id` + domain attributes
  (`order_id`, `authorization_id`, `amount_cents`, `reason`).
- **NATS+OTel propagation + async correctness.** `natstrace.rs` adapts
  `async_nats::HeaderMap` to OTel `Injector`/`Extractor`: extract `traceparent` and open a
  CONSUMER span as the producer's child; open a PRODUCER span on reply and inject. The
  handler body runs inside **`FutureExt::with_context(cx)`** (not a thread-local
  `attach()` guard) so the OTel context **survives `.await` thread-hops** under tokio's
  multi-thread runtime — without this, post-await logs/events silently lose the trace_id.
  Resource parity (§9) is automatic: `Resource::builder()` reads only `OTEL_SERVICE_NAME`
  + `OTEL_RESOURCE_ATTRIBUTES` (no host/process detectors).
- **Correlation proven (live, in the LGTM bundle).** A real checkout produced **one Tempo
  trace** spanning `bff · cart · catalogue · inventory · orders · payment` — including
  Payment's `consume payment.authorize` (CONSUMER), `db.payments.record_decision` and
  `publish payment.authorized` (PRODUCER) spans, across two further async NATS hops. The
  same saga `trace_id` stamped Payment's `authorizing payment` log **and** its
  `payment.authorized` event in Loki (scope `shoeshop/payment`, with `order_id`); RED was
  present and a `PAYMENT_FAILURE_RATE=1.0` run reached **CANCELLED** via `payment.declined`
  → `inventory.release` compensation. M → T → L/E all on one id.

> **Verified Rust OTel + saga set** (resolved + built in Docker; APIs read from crate
> source): `opentelemetry`/`opentelemetry_sdk` `0.32` + `opentelemetry-otlp` `0.32`
> (`grpc-tonic,metrics,logs`) + `opentelemetry-appender-tracing` `0.32`; `tracing` `0.1` /
> `tracing-subscriber` `0.3`; `async-nats` `0.49` (jetstream); `axum` `0.8`; `sqlx` `0.9`
> (`runtime-tokio,postgres,uuid` — runtime query API, no compile-time DB); `tokio` `1`.
> **No native metric exemplars in Rust 0.32** — metric↔trace join via the bundle's Tempo
> metrics-generator (§9 Per-stack exemplar policy). The async context fix
> (`FutureExt::with_context`) is mandatory for log/event correlation.

### Notification MELT implementation (Go · v0.3 fan-out subscriber — verified correlated 2026-06-08)

Notification is the **last v0.3 write-path service** and the simplest: a **pure**
JetStream subscriber that closes the saga loop with fan-out. It runs a durable
consumer (`notification-worker`, `FilterSubjects: [orders.confirmed,
orders.cancelled]`, AckExplicit, `MaxDeliver: 5`) on the **ORDERS** stream — the
terminal lifecycle events Orders publishes — and "sends" a customer notice for each.
It has **no new transport and no datastore** (no gRPC/proto, no Postgres): it
publishes nothing back to NATS. It reuses the Catalogue/Inventory Go telemetry
package verbatim (`services/notification/internal/telemetry/`, scope
`shoeshop/notification`) and the **consume side** of Inventory's NATS+OTel spine.
Code: [`services/notification/`](services/notification/) (`notify/consumer.go`,
`notify/envelope.go`, `telemetry/`). Built in Docker (compiler as ground truth);
same verified Go OTel set as Inventory (`nats.go` v1.52.0, OTel core v1.44.0).

- **One surface, "sending" modeled.** With no real channel wired (ADR-0003 §7),
  "sending" is modeled by a structured log (`notification: sent <status> notice`)
  plus a **`notification.sent`** domain Event carrying `order.id`, `user.id`,
  `order.status` and (for cancellations) `cancel.reason`. The handler stays
  self-sufficient: it `CreateOrUpdateStream`s ORDERS (idempotent, matching Orders'
  config) so it never races Orders' provisioning, then consumes.
- **Metrics (M).** No RPC surface, so RED is over **consumed messages**: a hand-rolled
  recorder (`telemetry/metrics.go`) — `notification.messages` (counter) +
  `notification.process.duration` (histogram, seconds) keyed by `subject`
  (`orders.confirmed`/`orders.cancelled`) + `result` (`sent`/`ignored`/`error`). In
  Prometheus: `notification_messages_total` +
  `notification_process_duration_seconds_*{service_name="notification"}`, the
  histogram carrying **native** Go `trace_id` exemplars — **no JS/Rust gap** (Go, like
  Inventory, emits them natively; verified live, an exemplar carried the saga trace_id).
- **Logs (L).** Same slog fan-out as the other Go services (stdout JSON +
  `otelslog`→OTLP→Loki); in-handler records carry the active `trace_id`/`span_id` from
  the consume span. Scope `shoeshop/notification`.
- **Events (E).** `notification.sent` via the Logs API (`SetEventName`), emitted with
  the consume context so it carries the saga `trace_id`/`span_id` + the order/user/
  status attributes.
- **NATS+OTel propagation (consume-only).** `telemetry/nats.go` carries just
  `StartConsumeSpan` (Notification never publishes): extract the producer's
  `traceparent` from the message headers and open a CONSUMER span `consume <subject>`
  as the producer's child, so the notice is part of the same checkout trace.
- **Health surface.** A tiny `/healthz` HTTP server is the only listener (no gRPC
  port); the container probe runs the binary's own `healthcheck` subcommand
  (distroless, no shell/curl — mirrors Payment's pattern).
- **Correlation proven (live, in the LGTM bundle).** A real checkout produced **one
  Tempo trace** (`efdfec2c…`) spanning `bff · cart · catalogue · inventory · orders ·
  payment · notification` — including Notification's `consume orders.confirmed`
  (CONSUMER, scope `shoeshop/notification`). The same saga `trace_id` (and the consume
  `span_id`) stamped Notification's `notification.sent` event + its log in Loki, and a
  `notification_process_duration_seconds_bucket` exemplar carried that exact trace_id —
  M → T → L/E all on one id. A forced-decline run (`PAYMENT_FAILURE_RATE=1.0`) produced
  the symmetric **`consume orders.cancelled`** span and a `notification.sent` event with
  `cancel.reason=payment_do_not_honor`. **9 of 11 MELT-complete; v0.3 write path
  complete (4/4).**

> **Verified Go OTel + NATS set** (same as Inventory): `nats.go` v1.52.0
> (`jetstream`); OTel core `v1.44.0` / log+sdk/log `v0.20.0` / otelslog `v0.19.0`. No
> proto/gRPC dependency (pure subscriber); the build context is `services/notification`
> (self-contained, like Payment), not the repo root.

---

## 10. Incidents & reliability (direction)

Failure is a **first-class feature**, not an afterthought. The plan: a curated
catalogue of realistic, **labeled, reproducible** incidents — each with a known
root cause, a real propagation path, and observable symptoms — so the running
storefront genuinely degrades and the failure can be studied end-to-end across
**all four MELT signals**. (The incident design is our own — informed by years
of running production systems and earlier incident-engineering work — built here
from the ground up to lean on OpenTelemetry and Compose-native injection.) See
§11 for sequencing.

Each incident is the **supervised target** of the project-2 dataset: a labeled
`(time_window, root_cause, …)` record over a window of correlated MELT. The label
**schema**, the **correlation contract** (the join keys the telemetry retrofit
must satisfy), and a worked **example** are designed now — build deferred — in
[`docs/dataset/`](docs/dataset/). This is *design-first on purpose*: the LGTM
bundle is ephemeral, so incidents run before the schema exists would produce
unlabeled, unrecoverable telemetry.

---

## 11. Roadmap / next steps

- **v0.2 (done — read path + NEXUS frontend):** ✅ Catalogue, ✅ BFF, ✅ Cart
  (Redis), ✅ **BFF → Cart wired** (`bff → cart → redis` trace validated; BFF
  exposes `/api/cart/:userId` GET/POST-items/DELETE-item/DELETE), ✅ **Users**
  (Python · FastAPI + gRPC · Postgres; `gRPC RPC → Postgres query` traces
  validated), ✅ **Frontend** (Next.js 15 App Router — NEXUS storefront; home ·
  shop with search/filter/sort · PDP · cart · account; live BFF calls). All
  backend services **traces-only** initially (see §9 / the §2 telemetry note);
  MELT retrofit completed separately (v0.2-MELT below). Frontend MELT
  instrumentation is the next frontend task.
- **v0.2-MELT (retrofit done — the direction correction, ADR-0002):** make the four
  real services **MELT-complete** before any new feature. Sequence:
  1. ✅ docs-first persist — ADR-0002, §9 standard + Definition of Done +
     coverage matrix, bounded `docs/dataset/` track;
  2. ✅ shared four-signal **telemetry bootstrap** on the reference stack (Go) —
     SDK APIs verified in Docker (`services/catalogue/internal/telemetry/`);
  3. **retrofit** — ✅ Catalogue (reference) · ✅ Users (Python) · ✅ Cart (Node) ·
     ✅ **BFF (TS)** (all verified correlated; the two JS/TS services get metric↔trace
     exemplars via the bundle's Tempo metrics-generator, §9; BFF's RED is
     HTTP-server-side from `instrumentation-http`, not an interceptor) — **done, all
     4 real services MELT-complete**;
  4. ✅ for all four: all four signals validated correlated in
     Grafana/Tempo/Loki/Prometheus (matrix cells flipped);
  5. ✅ moved **Users `full → core`** (compose-only) so all four real services come
     up and validate together on the default profile — verified fresh on `core`:
     four correlated signals for a `ListUsers` request (trace in Tempo 200 with a
     nested asyncpg Postgres span; `rpc_server_*` RED + app-level `trace_id`
     exemplar in Prometheus; correlated in-request log + domain event in Loki),
     `core` idles ~0.92 GB.
- **Then resume features (each born MELT-complete):** wire **BFF → Users**
  (account endpoints so the frontend account page goes live); add **OTel
  instrumentation to the Frontend** (Web Vitals → OTLP, RSC server spans,
  `trace_id` in client logs — Frontend MELT-complete).
- **v0.3 (in progress — NATS JetStream write path + checkout saga, ADR-0003):**
  an orchestrated checkout saga (sync edge `frontend → bff → Orders.CreateOrder`,
  then async fulfilment over JetStream), where domain **Events** get rich. Build
  order, each born MELT-complete (ADR-0002), OTel verified in Docker first:
  0. ✅ ADR-0003 + `proto/inventory/v1` + Go stubs (the shared spine — streams,
     subjects, JSON envelope, traceparent-in-headers).
  1. ✅ **Inventory (Go)** — gRPC stock read + saga reserve/release over NATS;
     established the **NATS+OTel trace-propagation pattern** (§9); MELT-complete,
     verified correlated live (saga is one trace across the async hop).
  2. ✅ **Orders (Java/Spring)** — the saga orchestrator + state machine; sync
     `CreateOrder`/`GetOrder` over gRPC, drives `inventory.reserve` →
     `payment.authorize` → `orders.confirmed` (with compensation) over NATS; owns
     the `ORDERS` stream. Born MELT-complete via the **OTel Java agent** (native
     exemplars); BFF `POST /api/checkout/:userId` wired; verified correlated live
     (saga is one trace across NATS). **7 of 11 MELT-complete.**
  3. ✅ **Payment (Rust/Axum)** — deterministic payment simulator (reproducible
     authorize/decline by amount band / hash-of-`order_id` failure rate / injected
     latency; default authorize-all). NATS-only saga participant; first **Rust** stack;
     born MELT-complete (`tracing` + `opentelemetry-otlp`), mirrors the NATS+OTel spine in
     Rust. Verified correlated live — the full checkout (incl. the payment hop) is one
     trace across NATS, and a forced-decline run reached CANCELLED via compensation. Rust
     0.32 has the **JS-like exemplar gap** (→ Tempo metrics-generator, §9).
     **8 of 11 MELT-complete.**
  4. ✅ **Notification (Go)** — pure subscriber on terminal order events; fan-out.
     Subscribes to `orders.confirmed`/`orders.cancelled` on the `ORDERS` stream and
     emits a `notification.sent` Event (no new transport, no datastore); reuses the
     proven Go MELT module set + the consume side of the NATS+OTel spine. Born
     MELT-complete; verified correlated live (the `consume` span joins the one saga
     trace; native Go exemplars). **9 of 11 MELT-complete — v0.3 write path complete (4/4).**
  **Profile decision (resolved, ADR-0003):** the JVM-heavy write path is an opt-in
  `checkout` overlay (`task up:checkout`) — real Orders + Inventory + Payment +
  Notification — so `core` stays lean (~0.9 GB); `full`/`lean-jvm` fold it in.
- **Chaos / incident framework:** `tools/incident-simulator/` orchestrating
  labeled scenarios; `(time_window, root_cause)` records per the
  [`docs/dataset/`](docs/dataset/) schema; annotations in Grafana.

**Recommended sequencing:** the MELT retrofit on the existing 4 services is now
**complete** — telemetry debt was paid at its cheapest point (4 services, no drift),
and every later service inherits the standard by construction. The Users `full → core`
compose move (step 5) is **done**, so the four validate together on the default
profile; features now resume born MELT-complete. Incidents come *after* enough real,
MELT-complete services exist to break.

---

## 12. Using this file with a new AI session

This repo is developed with Claude Code, which **auto-loads `CLAUDE.md`** at the
start of every session — so the fastest bootstrap is already automatic.
`CLAUDE.md` points here. If you're pasting context into a fresh chat manually,
paste **this file first**: it captures status, decisions, and conventions with
enough fidelity to continue work accurately.
