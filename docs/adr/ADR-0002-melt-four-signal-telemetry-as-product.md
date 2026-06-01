# ADR-0002 — MELT four-signal telemetry is the product; additive retrofit (Option D)

- **Status:** Accepted
- **Date:** 2026-06-01
- **Supersedes / refines:** the §9 "golden reference pattern" in `ARCHITECTURE.md`
  (previously "traces"). ADR-0001 (local dev & resource constraints) still stands.

---

## Context

Shoe Shop's purpose, sharpened: it is an **observability DATA GENERATOR**. Its
product is **correlated four-signal telemetry** — **MELT: Metrics, Events, Logs,
Traces** — plus a **labeled, reproducible incident corpus**. That corpus is the
training / eval dataset for a future AI SRE ("**project 2**").

Full, correlated MELT is a **hard requirement**. An AI SRE trained on traces
alone is blind: it sees the *request path* but not the *magnitude* (metrics), the
*error cause* (logs), or the *trigger* (events). The four signals are only useful
to a model if they are **correlated**, joined on:

- `trace_id` / `span_id` stamped into log records,
- metric **exemplars** linking series back to traces,
- **aligned timestamps**,
- **consistent resource attributes** (`service.namespace`, `service.name`,
  `deployment.environment`).

**Verified current reality (2026-06-01):** the repo is **traces-only**. The four
real services — `catalogue` (Go), `bff` (TS), `cart` (Node), `users` (Python) —
each initialize only an OTel **TracerProvider**. No `MeterProvider`, no log
export, no events. `ARCHITECTURE.md` §9 codified "traces" as the golden
reference. **0 of 11 services are MELT-complete.** The telemetry gap is the only
thing misaligned with the vision — and it is **additive**, not a rewrite.

## Decision

1. **Redefine the golden reference pattern** from "traces" to "**four correlated
   signals (MELT)**." A service is not *done* until M + E + L + T are emitted and
   **verified correlated** — see the **Definition of Done** in `ARCHITECTURE.md`
   §9.

2. **Do not rewrite the repo.** The platform backbone (Postgres, Redis,
   Meilisearch, NATS, `otel-lgtm`), the Compose profiles / mem-limits /
   orchestration, the proto + codegen pipeline, and the four services' **business
   logic** are sound and aligned. We **greenfield only the telemetry standard** on
   one reference service, prove it end-to-end, then propagate.

3. **Reference service = Catalogue (Go).** It is already §9's reference, and Go's
   four-signal OTel SDK is the most mature of the three stacks — the exemplar
   should absorb the **least** SDK risk. **Users (Python) is the first retrofit**,
   precisely because its logs/events are the least mature signals, so cross-stack
   gaps surface early rather than late.

4. **Design the dataset/labeling layer now, build it later.** Deliver only an
   **incident label schema**, a **correlation contract**, and **one worked
   example** under `docs/dataset/`. No export pipeline, storage, or automation
   yet — that boundary is held deliberately to prevent scope creep.

5. **Move Users from the `full` profile to `core`,** so all four real services
   validate MELT correlation together on the default profile (and the later
   BFF → Users path works on `core`).

6. **Sequencing:**
   1. docs-first persist (this ADR + `ARCHITECTURE.md` rewrite + coverage matrix
      + bounded dataset track) — **done in this change**;
   2. shared four-signal telemetry bootstrap per stack — **SDK APIs verified in
      Docker, not from memory** (logs/events maturity differs by language);
   3. retrofit the four existing services;
   4. validate all four signals **correlated** end-to-end in
      Grafana / Tempo / Loki / Prometheus;
   5. only then resume features (BFF → Users, a real Frontend, the v0.3 NATS
      write path where domain **Events** get rich) — each **born MELT-complete**.

## Consequences

**Positive**

- Correlated, multimodal data an AI SRE can actually learn from; the corpus is
  trainable from the **first** incident rather than reconstructed later.
- Telemetry debt is paid at its **cheapest point** — 4 services, before drift —
  and the standard **self-propagates**: every later service inherits MELT by
  construction and it is enforceable in review/CI.
- Reframes success from "we have traces" to "we have a **dataset**."

**Negative / costs**

- Near-term **visible feature progress slows** — the work is invisible
  infrastructure, not storefront capability. (Features were always only a vehicle
  for telemetry and failure modes.)
- **Cross-stack SDK maturity differs:** traces and metrics are the mature OTel
  signals; logs and especially the Events API are newer and mature at different
  rates across Go / Node / Python. APIs **must be verified in Docker**; some
  signals may need workarounds (e.g. a stdlib-logger bridge, or span-events where
  a clean Events API is absent). Real schedule uncertainty lives here.
- Standing **cardinality / label discipline** becomes a permanent concern (also
  good training-data hygiene).
- The dataset track must stay **strictly bounded** (design now, build later).

## System constraints (grounded, 2026-06-01)

Windows 11 Home (25H2), **16 GB RAM** (15.2 GB usable), AMD Ryzen 7 7840HS,
Docker Desktop on WSL2 (default cap ~8 GB = 50% of physical). Measured baseline
(ARCHITECTURE §6): `core` idles **~0.8 GB** total, `otel-lgtm` ~90% of it
(1024m limit).

- **Standard + retrofit on `core`:** fits 8 GB comfortably — today's footprint
  plus modest per-service metric/log batchers.
- **Stress point = `full` (11 services) at full MELT.** Only 4 services + the
  LGTM bundle carry real MELT cost (7 are `traefik/whoami` stubs). Sum of all
  `mem_limit` caps in `full` is ~4.6 GB. Mitigations: run subsets, use
  `lean-jvm`, raise `otel-lgtm`'s 1024m cap, and/or raise the WSL2 cap toward
  ~12 GB (16 GB physical allows it, leaving headroom for Windows).
- The **dataset retention/export** (deferred) is what will eventually want more
  disk (~500 GB free today → ample near-term) and possibly off-bundle storage.

**Exact memory deltas are UNMEASURED.** Measure and tune `mem_limit`s in Docker
during the retrofit — invent no numbers. The RTX 4060 (8 GB VRAM) is irrelevant
to this platform; it matters only to project-2 model work later.

## Alternatives considered

- **Rebuild the repo from scratch — rejected.** Discards validated platform,
  orchestration, proto pipeline, and business logic to fix a purely *additive*
  gap; re-incurs weeks of setup and new bugs; the telemetry gap travels with you
  regardless. The only worthwhile "from scratch" is scoped to the telemetry
  *standard*, which is exactly this decision.
- **Feature-first, retrofit telemetry later — rejected.** Grows the
  non-compliant backlog from 4 toward 11 and lets ad-hoc logging/metrics
  **drift**, turning the eventual retrofit into a reconciliation. Worse, incidents
  run before labeling exists produce telemetry that is never captured — and the
  LGTM bundle is ephemeral, so that data is lost.
- **Reference on Users (Python) instead of Catalogue — rejected as exemplar.**
  Python's logs/events are the least mature signals; the reference should carry
  the least SDK risk. Users is the **first retrofit** instead, to surface
  cross-stack gaps early.
