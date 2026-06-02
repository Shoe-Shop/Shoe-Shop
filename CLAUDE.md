# CLAUDE.md — session bootstrap

Claude Code loads this file automatically at the start of every session.
**Read [`ARCHITECTURE.md`](ARCHITECTURE.md) first** — it is the engineering
ground truth (status, decisions, conventions). This file is the short version.

## What Shoe Shop is
A polyglot (6-language, ~11-service) e-commerce platform whose **real product is
observability data** — correlated four-signal telemetry (**MELT**: Metrics,
Events, Logs, Traces) plus a labeled, reproducible **incident corpus** to train a
future AI SRE ("project 2"). The storefront is the vehicle, not the goal; see
**[ADR-0002](docs/adr/ADR-0002-melt-four-signal-telemetry-as-product.md)**. Four
services are real today (**Catalogue** Go, **BFF** TS, **Cart** Node, **Users**
Python) + the 5 infra containers; the rest are `traefik/whoami` stubs.
**All 4 real services are MELT-complete** (Catalogue Go, Users Python, Cart Node,
BFF TS — four signals verified correlated) — **4 of 11 MELT-complete; the retrofit
phase is done.** See ARCHITECTURE.md §2 / §9. Note: both JS/TS services (Cart **and**
BFF) get their metric↔trace **exemplars from the bundle's Tempo metrics-generator**,
because OpenTelemetry-JS does not emit metric exemplars (verified; documented in §9).
BFF's RED is HTTP-server-side from `instrumentation-http` (not a hand-rolled
interceptor).

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

## Current focus — v0.2-MELT (direction correction, ADR-0002)
Make the 4 real services **MELT-complete before any new feature.** Sequence:
1. ✅ docs-first persist (ADR-0002, §9 standard + Definition of Done + coverage
   matrix, bounded `docs/dataset/` track) — **done**.
2. ✅ four-signal **telemetry bootstrap** on the reference **Catalogue (Go)** —
   SDK APIs verified in Docker; **Catalogue MELT-complete & verified correlated**
   (`services/catalogue/internal/telemetry/`, ARCHITECTURE.md §9).
3. retrofit against the Catalogue reference (verify each stack's SDK APIs in
   Docker — logs/events maturity differs by language; validate correlated, flip
   §9 cells): ✅ **Users (Python)** (`services/users/app/telemetry.py`) ·
   ✅ **Cart (Node)** (`services/cart/src/telemetry.ts`) ·
   ✅ **BFF (TS)** (`services/bff/src/telemetry.ts`; HTTP-server-side RED from
   `instrumentation-http` + stable semconv opt-in, no interceptor; JS has no metric
   exemplars → metric↔trace via the bundle's Tempo metrics-generator, §9) —
   **retrofit done: all 4 real services MELT-complete & verified correlated**.
4. **Next:** move **Users `full` → `core`** so the 4 validate together on the
   default profile (compose-only; still pending).
5. *Then* resume features: **BFF → Users**, a real **Frontend**, v0.3 NATS write
   path. Incident/chaos framework comes *after* the 4 are MELT-complete.
