# CLAUDE.md — session bootstrap

Claude Code loads this file automatically at the start of every session.
**Read [`ARCHITECTURE.md`](ARCHITECTURE.md) first** — it is the engineering
ground truth (status, decisions, conventions). This file is the short version.

## What Shoe Shop is
A polyglot (6-language, ~11-service) e-commerce platform whose **real product is
observability data** — correlated four-signal telemetry (**MELT**: Metrics,
Events, Logs, Traces) plus a labeled, reproducible **incident corpus** to train a
future AI SRE ("project 2"). The storefront is the vehicle, not the goal; see
**[ADR-0002](docs/adr/ADR-0002-melt-four-signal-telemetry-as-product.md)**. Nine
services are real today (**Frontend** Next.js 15, **Catalogue** Go, **BFF** TS,
**Cart** Node, **Users** Python, **Inventory** Go, **Orders** Java, **Payment** Rust,
**Notification** Go) + the 5 infra containers; the rest (shipping, recommendation) are
`traefik/whoami` stubs.
**9 real services are MELT-complete** (Catalogue Go, Users Python, Cart Node,
BFF TS, **Frontend** Next.js 15, **Inventory** Go, **Orders** Java/Spring, **Payment**
Rust, **Notification** Go — four signals verified correlated) — **9 of 11 MELT-complete.**
The v0.2-MELT retrofit phase is done and the **v0.3 NATS JetStream write path is COMPLETE
(4/4): Inventory (Go), Orders (Java/Spring), Payment (Rust), Notification (Go)**. Orders is
the **checkout-saga orchestrator** (ADR-0003): sync gRPC `CreateOrder`/`GetOrder` front
door, then the async saga over NATS (owns `ORDERS`; reserve → authorize → confirm, with
compensation). Payment is the **deterministic simulator** (ADR-0003 §6): NATS-only, consumes
`payment.authorize`, decides authorize/decline by env-tunable rules (default authorize-all),
publishes `payment.authorized`/`payment.declined`. Notification is the **pure fan-out
subscriber** (ADR-0003 §3/§7): a durable consumer on the terminal `orders.confirmed`/
`orders.cancelled` events that "sends" a notice (`notification.sent` Event) — no new
transport, no datastore. All write-path services use the cross-cutting **NATS+OTel
trace-propagation pattern** (W3C `traceparent` rides NATS message headers, so the whole
async saga is ONE correlated trace — verified live: one Tempo trace `bff → orders →
inventory → orders → payment → orders → CONFIRMED → notification`). Exemplars: the **three
Go services** (Catalogue, Inventory, Notification) **and Orders (Java, via the OTel agent)**
emit metric **exemplars natively**; the three JS/TS services (Cart, BFF, Frontend) **and
Payment (Rust)** get them from the bundle's Tempo metrics-generator, because OpenTelemetry-JS
and `opentelemetry_sdk` 0.32 (Rust) do not (both verified at the SDK source; §9). See
ARCHITECTURE.md §2 / §9 + ADR-0003.

## Hard rules
- **No hallucination.** Verify against the code/registry before claiming things.
  Build/test in Docker and let the compiler/`buf lint`/`docker build` be ground
  truth rather than guessing library APIs or versions.
- **Commits:** Conventional Commits + DCO sign-off (`git commit -s`).
  **Author name only — never add `Co-Authored-By` trailers.**
- **Git:** remote is `git@github.com:Shoe-Shop/Shoe-Shop.git`, branch `main`.
  Solo repo — the user wants `origin/main` kept current, so push after
  committing. Use `--force-with-lease` only for intentional history fixes.
- **Don't write to** `deploy/compose/.env` expectations: `.env` is gitignored
  (default creds); `.env.example` is the committed template.

## Environment
- Windows + Docker Desktop (WSL2, ~8 GB). Use **PowerShell** for git/docker/task.
- `task` CLI is installed (winget). Go / buf / sqlc / protoc are **NOT** installed
  locally — run all codegen and Go builds inside Docker images.
- PowerShell PATH for `task` may need refreshing in a fresh shell:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')`

## Day-to-day
- Bring up: `task up:core` (read path) · `task up:checkout` (read + v0.3 write
  path: real Orders + Inventory + Payment + Notification) · status: `task ps` ·
  logs: `task logs -- <svc>` · down: `task down`.
- Codegen: `buf` (proto→Go) and `sqlc` (SQL→Go) via Docker; commit the output.
- New services follow the **four-signal MELT standard** (ARCHITECTURE.md §9 +
  ADR-0002): a service ships only when Metrics + Events + Logs + Traces are
  emitted **and verified correlated** (Definition of Done in §9) — not traces
  alone. SDK APIs for each stack are **verified in Docker** before use.

## What's done / what's next

**v0.2-MELT (done):** All 4 backend services MELT-complete and verified correlated.
Sequence:
1. ✅ docs-first persist (ADR-0002, §9 standard + Definition of Done + coverage
   matrix, bounded `docs/dataset/` track).
2. ✅ four-signal **telemetry bootstrap** on the reference **Catalogue (Go)** —
   SDK APIs verified in Docker; **Catalogue MELT-complete & verified correlated**
   (`services/catalogue/internal/telemetry/`, ARCHITECTURE.md §9).
3. ✅ retrofit: **Users (Python)** · **Cart (Node)** · **BFF (TS)** — all
   verified correlated. JS/TS services get metric↔trace exemplars via the bundle's
   Tempo metrics-generator (§9). BFF RED from `instrumentation-http`, no interceptor.
4. ✅ moved **Users `full` → `core`** — all 4 validate together on `task up:core`;
   `core` idles ~0.92 GB.

**Frontend (done & MELT-complete):** NEXUS storefront — Next.js 15 App Router —
shipped and four-signal instrumented. Pages: home (hero + campaign + marquee) ·
shop (search + filter/brand/tag + sort) · PDP · cart · account. Live BFF calls.
OTel **wired and verified correlated live in Grafana** (5 of 11 MELT-complete):
RED via `instrumentation-http`, Web Vitals histograms via `next/web-vitals` →
`/api/vitals`, trace_id-stamped logs/events from RSC handlers, cross-service
`frontend → bff → catalogue` traces, spanmetrics exemplars (JS exemplar gap, §9).

**Account page (done):** **BFF → Users** wired — BFF fronts Users over gRPC
(`GET /api/users/by-email/:email`, `GET /api/users/:id`); the Frontend account page
is **live** (server component resolves the seeded demo shopper `ada@shoeshop.test`,
renders real profile). Verified end-to-end as one trace: `frontend → bff → users →
postgres` (asyncpg SELECT spans). Auth (Zitadel) still deferred — single demo
identity until then.

**Storefront UX + live account/orders (done, on top of v0.3 — browser-verified):**
the account page now shows **real order history** via a new
**`OrdersService.ListOrders(user_id)`** RPC (proto + Java `OrderRepository.findByUser` +
BFF `GET /api/users/:id/orders`), plus a **required mock shipping address** (localStorage)
that gates checkout and shows on the order page. **Checkout is account-gated** — BFF
verifies `Users.GetUser` before `CreateOrder` (401 otherwise) — and the storefront identity
was unified onto the **seeded shopper id** (was a throwaway `u-demo` that never joined the
account). Critical fix: **BFF now sets CORS** (`hono/cors` on `/api/*`) — the storefront
calls the BFF directly from the browser (`:9000`→`:9001`), so all client-side cart/checkout
calls were silently CORS-blocked (server-rendered pages masked it; this was the
always-empty-bag bug). Also: order timeline reworked to the shopper narrative
(Authorizing payment → Order confirmed → **Shipped**, green tick + confetti), cart `-`/`+`
stepper fixed (qty delta via `hincrby`, not whole-line delete), product images fixed in the
bag/order summary, filled size selector. Auth still the single demo identity.

**v0.3 write path (COMPLETE, 4 of 4 — ADR-0003):** orchestrated checkout saga over
NATS JetStream (sync edge `frontend → bff → Orders.CreateOrder`, then async fulfilment).
Streams `ORDERS`/`INVENTORY`/`PAYMENT`; JSON event envelope; `traceparent` in NATS
headers. The JVM-heavy write path is the opt-in **`checkout` overlay** —
`task up:checkout` (or `docker compose --env-file deploy/compose/.env -f
deploy/compose/compose.yaml -f deploy/compose/compose.core.yaml -f
deploy/compose/compose.checkout.yaml up -d`) — so `core` stays lean. Build order,
each born MELT-complete:
- ✅ **Inventory (Go)** — done, MELT-complete; established the NATS+OTel propagation spine.
- ✅ **Orders (Java/Spring)** — done, MELT-complete, verified correlated. Saga
  orchestrator + state machine (PENDING→RESERVING→AUTHORIZING→CONFIRMED, compensate to
  CANCELLED); sync gRPC CreateOrder/GetOrder; BFF `POST /api/checkout/:userId` wired.
  Instrumented by the **OTel Java agent** (`-javaagent`, native exemplars); only NATS
  propagation hand-wired. `services/orders/` (Maven, Spring Boot 3.4.1, grpc-java,
  jnats, JdbcClient). Verified live: one 33-span trace across NATS. See §9 + memory
  `orders-java-otel-agent-sdk`.
- ✅ **Payment (Rust/Axum)** — done, MELT-complete, verified correlated. Deterministic
  simulator (ADR-0003 §6): NATS-only saga participant, consumes `payment.authorize`,
  decides authorize/decline by env-tunable rules (amount band / hash-of-`order_id`
  failure rate / injected latency; default authorize-all), persists idempotently to
  Postgres, publishes `payment.authorized`/`payment.declined`. First **Rust** stack;
  hand-wired four signals (`tracing` + `opentelemetry-otlp` 0.32); mirrors the NATS+OTel
  spine in Rust (`services/payment/src/natstrace.rs`). Verified live: full checkout is one
  trace incl. the payment hop, and `PAYMENT_FAILURE_RATE=1.0` → CANCELLED via
  compensation. **Rust 0.32 has the JS-like exemplar gap** → Tempo metrics-generator (§9).
  Async gotcha: handler runs in `FutureExt::with_context(cx)` so trace_id survives
  `.await` thread-hops. `services/payment/` (Cargo, Axum, async-nats, sqlx). See §9 +
  memory `payment-rust-otel-nats-sdk`.
- ✅ **Notification (Go)** — done, MELT-complete, verified correlated. Pure subscriber on
  terminal order events (`orders.confirmed`/`orders.cancelled` on the `ORDERS` stream);
  durable consumer `notification-worker`; "sends" a notice via a `notification.sent` Event +
  log — **no new transport, no datastore**. Reuses the Catalogue/Inventory Go telemetry
  package verbatim (scope `shoeshop/notification`) + the **consume side** of the NATS+OTel
  spine. RED over consumed messages (`notification_messages_total` /
  `notification_process_duration_seconds_*` by `subject`/`result`), **native Go exemplars**.
  Health = tiny `/healthz` + binary `healthcheck` subcommand. Verified live: the checkout
  trace includes `consume orders.confirmed`/`orders.cancelled`; event/log/exemplar carry the
  saga trace_id. `services/notification/` (Go, nats.go jetstream). See §9 + memory
  `notification-go-nats-sdk`. **9 of 11 MELT-complete; v0.3 write path complete (4/4).**

**Chaos / incident framework (v0 — DONE this session):** `tools/incident-simulator/`
(Python-in-container; `task chaos:run -- <scenario>`) runs one scenario
`manifest → inject → load → recover → label`, writing a schema-v0 record to
`docs/dataset/incidents/` with the captured `time_window` + `order_ids`. Fills the
old `chaos:run` stub; fixes the `injection_method` enum (v0 implements `env-knob`:
env var + `--force-recreate` one container; `compose-stop`/`resource-limit`/`load`
designed, not wired). Two deterministic Payment-knob scenarios ship, both verified
correlated live in the LGTM bundle (absolute windows): **payment-hard-decline**
(`PAYMENT_FAILURE_RATE=1.0` → all orders CANCELLED; `payment_requests_total{result=
"declined"}`=5 + per-order `payment.declined` WARN logs with the saga trace_id) and
**payment-latency-spike** (`PAYMENT_LATENCY_MS=1500` → mean `payment_duration_seconds`
≈1.51s, orders still CONFIRMED). Deterministic analogs of Sock Shop incidents 3/6
(see memory `incident-simulator-v0`). Gotcha: a short incident window < the 60s OTLP
metric-export interval, so the simulator injects a short `OTEL_METRIC_EXPORT_INTERVAL`
onto the faulted container or metrics never flush before recovery recreates it.

**Then:** more injection methods + service classes (compose-stop → service-down,
resource-limit → DB throttle, load → saturation), Grafana annotations per window.
