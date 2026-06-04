# CLAUDE.md — session bootstrap

Claude Code loads this file automatically at the start of every session.
**Read [`ARCHITECTURE.md`](ARCHITECTURE.md) first** — it is the engineering
ground truth (status, decisions, conventions). This file is the short version.

## What Shoe Shop is
A polyglot (6-language, ~11-service) e-commerce platform whose **real product is
observability data** — correlated four-signal telemetry (**MELT**: Metrics,
Events, Logs, Traces) plus a labeled, reproducible **incident corpus** to train a
future AI SRE ("project 2"). The storefront is the vehicle, not the goal; see
**[ADR-0002](docs/adr/ADR-0002-melt-four-signal-telemetry-as-product.md)**. Five
services are real today (**Frontend** Next.js 15, **Catalogue** Go, **BFF** TS,
**Cart** Node, **Users** Python) + the 5 infra containers; the rest are
`traefik/whoami` stubs.
**6 real services are MELT-complete** (Catalogue Go, Users Python, Cart Node,
BFF TS, **Frontend** Next.js 15, **Inventory** Go — four signals verified
correlated) — **6 of 11 MELT-complete.** The v0.2-MELT retrofit phase is done and
the **v0.3 NATS JetStream write path has begun: Inventory (Go) is the first
write-path service** (ADR-0003) — sync gRPC stock read (GetStock/BatchGetStock) +
the inventory side of the checkout saga over NATS JetStream (reserve/release →
reserved/rejected). It established the new cross-cutting **NATS+OTel
trace-propagation pattern** (W3C `traceparent` rides NATS message headers, so an
async saga step is ONE correlated trace), verified live. The two Go services
(Catalogue, Inventory) emit metric **exemplars natively**; the three JS/TS services
(Cart, BFF, Frontend) get their metric↔trace **exemplars from the bundle's Tempo
metrics-generator**, because OpenTelemetry-JS does not emit them (verified; §9).
See ARCHITECTURE.md §2 / §9 + ADR-0003.

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
- Bring up: `task up:core` · status: `task ps` · logs: `task logs -- <svc>` ·
  down: `task down`.
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

**v0.3 write path (in progress — ADR-0003):** orchestrated checkout saga over NATS
JetStream (sync edge `frontend → bff → Orders.CreateOrder`, then async fulfilment).
Streams `ORDERS`/`INVENTORY`/`PAYMENT`; JSON event envelope; `traceparent` in NATS
headers. Build order, each born MELT-complete:
- ✅ **Inventory (Go)** — done, MELT-complete, verified correlated; established the
  NATS+OTel propagation spine. Runs in `full` (checkout-set profile placement TBD);
  bring up explicitly: `docker compose --env-file deploy/compose/.env -f
  deploy/compose/compose.yaml -f deploy/compose/compose.core.yaml -f
  deploy/compose/compose.full.yaml up -d nats postgres otel-lgtm inventory`.
- ⬜ **Orders (Java/Spring)** — next: the saga orchestrator + state machine.
- ⬜ **Payment (Rust/Axum)** — deterministic simulator; Rust OTel verified last.
- ⬜ **Notification (Go)** — pure subscriber on terminal order events.

**Then:** incident/chaos framework — after enough real, MELT-complete services exist to break.
