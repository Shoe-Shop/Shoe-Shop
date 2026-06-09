# ADR-0001 — Local-first development & resource constraints

- **Status:** Accepted
- **Date:** 2026-05-31
- **Referenced by:** ADR-0002 (MELT is the product), ADR-0003 (NATS write path & saga),
  the root `Taskfile.yml`, `deploy/compose/`, and `CONTRIBUTING.md`.

---

## Context

Shoe Shop is a polyglot, multi-service platform, but it must be **runnable by one
person on one laptop** — that is the whole point: a system you can stand up,
observe, and break in minutes, not a cluster you need a cloud account to touch.

The reference machine is a **constrained-but-common laptop: 16 GB RAM with
Docker / WSL2 capped at ~8 GB.** Every infrastructure decision below serves that
envelope. The platform's own saturation and memory scenarios can exhaust the
headroom on purpose, so the runtime has to fail *cleanly and observably* rather
than freeze the host.

These constraints were settled before any service was written; this record
consolidates them so later ADRs and the code can reference a single source.

## Decision

1. **Local-first.** The entire stack runs via **Docker Compose**; no Kubernetes is
   required for the core experience. A cluster path may be added later but is never
   a prerequisite to run, observe, or contribute.
2. **A fixed resource envelope.** Target **16 GB RAM / ~8 GB to Docker (WSL2)**.
   Choices are judged against that budget, not an unbounded cloud node.
3. **Database-per-service on one PostgreSQL instance.** Each service owns its own
   database (created once by `deploy/compose/initdb/`), giving schema isolation
   without the memory cost of running many database servers. Not a shared schema;
   not one Postgres container per service.
4. **NATS JetStream as the async event bus.** A single lightweight binary with
   replayable streams and at-least-once delivery (consumer ack) — chosen for its
   footprint and for failures that stay reproducible and inspectable.
5. **Every container has a hard `mem_limit`.** An out-of-memory event becomes a
   clean, observable container restart instead of a frozen laptop — and yields a
   legible failure signal for the observability plane.
6. **No auto-start.** Compose restart policy is `"no"`. Nothing comes back on its
   own; every bring-up is explicit (`task up:*`). The host is never surprised by
   containers it didn't ask for.
7. **Local observability is one bundle.** The `grafana/otel-lgtm` image
   (Grafana + Prometheus + Loki + Tempo) plus opt-in Pyroscope covers the local
   path; a separated, cluster-grade telemetry topology is deferred (see ADR-0002,
   `ARCHITECTURE.md` §9).
8. **Compose profiles are the RAM dial.** Layered overlays — `core` (read path) →
   `checkout` (the v0.3 write path) → `full` (all services + auth) → `lean-jvm`
   (capped JVM heaps) — so the heavy services are opt-in and daily dev stays lean.
9. **Dual-Path workflow behind one interface.** `task dev` runs infra + observability
   in Docker while you run the single service you're editing natively (fast reloads);
   `task up:*` runs everything containerized (parity, demos, reliability scenarios).
10. **Healthchecks bind explicit IPv4 (`127.0.0.1`), not `localhost`.** This avoids
    the IPv6 name-resolution flakiness that makes container healthchecks fail
    intermittently.

## Consequences

**Positive.** The whole platform stands up on a laptop with one command; failures
are bounded and observable rather than host-killing; per-service databases and a
replayable bus keep incidents reproducible and inspectable; the profile dial lets a
contributor run only what they need.

**Trade-offs.** This is explicitly *not* a production topology — the single
Postgres and single NATS are local single points of failure, and the ~8 GB ceiling
caps how much concurrency and telemetry volume can run at once. Sustained
high-volume generation targets a larger host. Those are acceptable for a
learn-and-break platform and are revisited if/when a cluster path is built.
