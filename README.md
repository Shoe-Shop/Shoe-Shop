<div align="center">

# 👟 Shoe Shop

**A polyglot, cloud-native e-commerce reference platform — engineered as the 2026 successor to Weaveworks Sock Shop.**

*Built ground-up for Observability, Chaos Engineering, and AI-driven SRE research.*

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![OpenTelemetry](https://img.shields.io/badge/OpenTelemetry-native-7c3aed)](https://opentelemetry.io/)
[![CNCF Stack](https://img.shields.io/badge/Stack-CNCF-1e40af)](https://www.cncf.io/)
[![Status: Blueprint](https://img.shields.io/badge/Status-Blueprint-orange)]()

</div>

---

## 📖 Table of Contents

1. [Why Shoe Shop?](#-why-shoe-shop)
2. [Project Vision](#-project-vision)
3. [High-Level Architecture](#-high-level-architecture)
4. [The Microservices Matrix](#-the-microservices-matrix)
5. [Data Plane: Sync, Async & Storage](#-data-plane-sync-async--storage)
6. [Observability Stack (LGTM+P)](#-observability-stack-lgtmp)
7. [Chaos & Incident Engineering](#-chaos--incident-engineering)
8. [UI/UX Approach](#-uiux-approach)
9. [Repository Layout](#-repository-layout)
10. [Local Development Promise](#-local-development-promise)
11. [Roadmap](#-roadmap)
12. [License & Contributing](#-license--contributing)

---

## 🎯 Why Shoe Shop?

For nearly a decade, **Weaveworks Sock Shop** was the de-facto reference application for demoing cloud-native tooling — service meshes, observability stacks, chaos tools. But the project has been effectively unmaintained since ~2020. It ships:

- ❌ Legacy instrumentation (Zipkin via OpenTracing, retired in favor of OpenTelemetry)
- ❌ Outdated runtimes (Java 8, Node 10, Go 1.13)
- ❌ Container patterns that predate distroless/rootless/multi-arch as norms
- ❌ No native OTel, no profiling, no eBPF, no Gateway API, no GitOps wiring
- ❌ No realistic incident scenarios — only ad-hoc chaos

**Shoe Shop is the modern, opinionated rewrite.** Every architectural choice is justified by where the cloud-native ecosystem actually is in 2026, and every component emits structured, correlated telemetry by default.

---

## 🚀 Project Vision

Shoe Shop has two missions, both equally weighted:

### Mission 1 — A canonical reference for cloud-native tooling vendors and learners

A platform that vendors, educators, and engineers can deploy to a fresh cluster in minutes and use to demo, benchmark, or learn:

- Distributed tracing across **6+ languages**
- Service mesh behavior under realistic traffic
- Log/metric/trace/profile correlation in Grafana
- Chaos experiments with deterministic blast radius
- GitOps and progressive delivery patterns

### Mission 2 — A high-fidelity telemetry generator for **Project 2: AI SRE**

This is the load-bearing constraint. The telemetry Shoe Shop emits must be **rich, correlated, and incident-realistic** enough to train and evaluate an AI Site Reliability Engineer. Concretely that means:

- Every span, log, and metric carries `trace_id` and `service.name` per OTel semconv
- Incidents are **scenarios**, not random pod-kills — they have a root cause, a propagation path, and observable symptoms
- Golden signals (latency / traffic / errors / saturation) are exposed per-service, per-endpoint
- The system supports recording labeled incident windows so the AI can be trained on `(telemetry, root_cause)` pairs

If a design decision helps Mission 1 but corrupts Mission 2, Mission 2 wins.

---

## 🏗 High-Level Architecture

```mermaid
flowchart TB
    User([🧑 Shopper])

    subgraph Edge["Edge / Ingress"]
        GW[Envoy Gateway<br/>Gateway API]
    end

    subgraph FE["Presentation Tier"]
        Web[Next.js 15<br/>SSR + RSC]
        BFF[Hono BFF<br/>Edge-ready]
    end

    subgraph Core["Core Domain Services"]
        Cat[Catalogue<br/>Go]
        Cart[Cart<br/>Node.js]
        Order[Orders<br/>Java 21]
        Pay[Payment<br/>Rust]
        User2[Users / Auth<br/>Python]
        Ship[Shipping<br/>Kotlin]
        Inv[Inventory<br/>Go]
        Rec[Recommendation<br/>Python + ML]
        Notif[Notification<br/>Go]
    end

    subgraph Data["Data & Messaging"]
        PG[(PostgreSQL)]
        Redis[(Redis)]
        Search[(Meilisearch)]
        NATS{{NATS JetStream}}
    end

    subgraph Obs["Observability Plane"]
        OTel[OTel Collector<br/>Gateway]
        Loki[(Loki)]
        Mimir[(Mimir)]
        Tempo[(Tempo)]
        Pyro[(Pyroscope)]
        Graf[Grafana]
    end

    subgraph Chaos["Chaos & Load"]
        CM[Chaos Mesh]
        Tox[Toxiproxy]
        Inc[Incident Simulator]
        K6[k6 Load Gen]
    end

    User --> GW --> Web --> BFF
    BFF --> Cat & Cart & Order & User2 & Rec
    Order --> Pay & Ship & Inv
    Inv -.->|stock events| NATS
    Order -.->|order events| NATS
    NATS -.-> Notif & Ship & Rec
    Cat --> PG & Search
    Cart --> Redis
    Order & User2 & Ship & Inv --> PG

    Web & BFF & Cat & Cart & Order & Pay & User2 & Ship & Inv & Rec & Notif -.->|OTLP| OTel
    OTel --> Loki & Mimir & Tempo & Pyro
    Loki & Mimir & Tempo & Pyro --> Graf

    CM -.->|injects faults| Core
    Tox -.->|net chaos| Core
    Inc -.->|scenario orchestration| CM & Tox
    K6 -.->|synthetic traffic| GW
```

**Request lifecycle (golden path):**

1. Shopper hits **Envoy Gateway** (Gateway API v1, HTTPRoute) which TLS-terminates and routes by host/path.
2. **Next.js 15** renders via React Server Components, hydrating from the **Hono BFF** which aggregates calls to downstream services. The BFF is the trace-root for user-initiated traffic.
3. Domain services communicate **synchronously via gRPC** (with REST shims at the edge) and **asynchronously via NATS JetStream** for event-driven flows (order placed → shipping reserved → notification sent).
4. Every hop propagates **W3C `traceparent`** and emits OTLP to a per-node **OpenTelemetry Collector agent**, which forwards to a **gateway-tier Collector** for processing, tail-sampling, and fanout to Loki / Mimir / Tempo / Pyroscope.
5. **Grafana** is the single pane of glass; dashboards, alerts, and SLOs are stored as code in this repo.

---

## 🧬 The Microservices Matrix

Polyglot is deliberate: it forces the observability layer to prove cross-language correlation, and it gives readers idiomatic instrumentation examples in the languages they actually work in. Each service was picked for the language that best fits its workload — not for variety's sake.

| # | Service | Language / Framework | Runtime | Datastore | Why this stack |
|---|---------|----------------------|---------|-----------|----------------|
| 1 | **Frontend** | TypeScript · Next.js 15 (App Router) | Node.js 22 / Edge | — | React Server Components and streaming SSR are the modern default; deep ecosystem; renders fast on cold caches. |
| 2 | **BFF** | TypeScript · Hono | Node.js 22 / Bun-compatible | — | Tiny, Web-Standard `fetch` API, edge-portable, excellent OTel support. Acts as trace root + auth boundary. |
| 3 | **Catalogue** | Go · Chi + `sqlc` | Go 1.23 | PostgreSQL + Meilisearch | Read-heavy, low-latency. Go's GC pauses are negligible at this scale; `sqlc` keeps queries typesafe. |
| 4 | **Cart** | TypeScript · Fastify | Node.js 22 | Redis (primary store) | Session-affine, mutation-heavy, short-lived data. Redis is the right shape; Fastify is fast and OTel-native. |
| 5 | **Orders** | Java 21 · Spring Boot 3.3 (virtual threads) | JVM 21 | PostgreSQL | Classic enterprise workload — transactions, sagas, audit. Virtual threads remove the thread-per-request cost without rewriting the model. Also showcases JVM-side observability. |
| 6 | **Payment** | Rust · Axum + `sqlx` | Native | PostgreSQL | Security- and correctness-critical mock. Rust forces explicit error paths and gives us a `no_std`-adjacent footprint to demo low-resource scenarios. |
| 7 | **Users / Auth** | Python · FastAPI | Python 3.12 | PostgreSQL + **Zitadel** (OIDC) | FastAPI is the most idiomatic async Python web stack; auth is delegated to **Zitadel** — a Go-based OIDC provider (~200 MB) chosen over Keycloak's ~500 MB JVM for the local RAM budget — so we demo real SSO traces without the footprint. Pluggable behind standard OIDC; Keycloak remains a documented swap. |
| 8 | **Shipping** | Kotlin · Ktor (coroutines) | JVM 21 | PostgreSQL | Integration-style service (calls fake carrier APIs). Showcases the *other* major JVM language and structured concurrency. |
| 9 | **Inventory** | Go · gRPC-first | Go 1.23 | PostgreSQL | High-throughput stock reservations. gRPC streaming demonstrates non-HTTP tracing. |
| 10 | **Recommendation** | Python · FastAPI + ONNX Runtime | Python 3.12 | PostgreSQL (read-replica) | Realistic AI-inference workload — tail-latency heavy, GPU-optional. Important for the AI SRE because ML services have distinctive failure modes. |
| 11 | **Notification** | Go · NATS subscriber | Go 1.23 | (stateless) | Fan-out worker — email/SMS/webhook mocks. Demonstrates async-only services in traces. |

### Languages summary
**6 languages**: TypeScript, Go, Java, Rust, Python, Kotlin. Enough to make cross-language tracing genuinely interesting; few enough that one engineer can reason about the whole repo.

### Deliberately *excluded*
- **.NET / C#** — not because it's a bad fit, but to keep the matrix lean. Easy community contribution later.
- **Microservices for everything** — no separate "email service" + "SMS service"; one Notification worker handles both. Resist over-decomposition.

---

## 🔌 Data Plane: Sync, Async & Storage

### Inter-service protocols

| Protocol | Where | Why |
|----------|-------|-----|
| **gRPC** (Protobuf) | Service ↔ service | Strong contracts, generated clients in every language, native streaming, OTel-instrumented out of the box. |
| **REST/JSON** | BFF ↔ Frontend, external webhooks | Browser-friendly, debuggable, no codegen friction on the edge. |
| **NATS JetStream** | Event-driven flows | Modern, lightweight (single binary), at-least-once with consumer ack, OTel propagation supported. Picked over Kafka/Redpanda for footprint; Redpanda is a recommended drop-in if users want Kafka semantics. |

### Schema strategy
- **`/proto`** is the single source of truth for service contracts.
- Buf for linting, breaking-change detection, and codegen.
- **AsyncAPI 3** documents every NATS subject.

### Datastores

| Store | Used by | Why |
|-------|---------|-----|
| **PostgreSQL 16** | Catalogue, Orders, Payment, Users, Shipping, Inventory | One battle-tested OLTP store. Per-service schema or per-service database — not "shared DB" anti-pattern. |
| **Redis 7** | Cart, rate-limiting | Cart is genuinely K/V; Redis is the right tool. |
| **Meilisearch** | Catalogue search | Open-source, OTel-instrumentable, much simpler ops than Elasticsearch for a demo workload. Typesense is a drop-in alternative. |
| **NATS JetStream** | Event bus + KV for ephemeral state | See above. |

Every datastore is run in-cluster for hermetic local dev. No cloud SaaS dependencies required to run the full stack.

---

## 🔭 Observability Stack (LGTM+P)

Every choice below is 100% free and open-source. No "free tier" lock-in.

```mermaid
flowchart LR
    Svc[Polyglot Services] -->|OTLP/gRPC| Agent[OTel Collector<br/>Agent · DaemonSet]
    Beyla[Grafana Beyla<br/>eBPF auto-instrumentation] -->|OTLP| Agent
    Agent -->|OTLP| GW[OTel Collector<br/>Gateway · Deployment]
    GW -->|logs| Loki
    GW -->|metrics| Mimir
    GW -->|traces| Tempo
    GW -->|profiles| Pyroscope
    Loki & Mimir & Tempo & Pyroscope --> Grafana
    Grafana --> Alerts[Alertmanager]
```

### The pillars

| Signal | Tool | Why this and not the alternative |
|--------|------|-----------------------------------|
| **Logs** | **Grafana Loki** | Label-based indexing, cheap at rest, native Grafana integration. Trivial trace↔log correlation via `trace_id` label. |
| **Metrics** | **Grafana Mimir** (Prometheus-compatible) | Horizontally scalable Prometheus. Single binary for local; multi-tenant at scale. |
| **Traces** | **Grafana Tempo** | Object-store backed (cheap), full-fidelity (no sampling required at storage), `TraceQL` is genuinely good. |
| **Profiles** | **Grafana Pyroscope** | Continuous profiling closes the "I see the slow trace, now show me the CPU" loop. Critical for the AI SRE training data. |
| **UI / Alerts** | **Grafana OSS 11** + Alertmanager | Dashboards-as-code via Grafonnet / Foundation SDK. Alerts as code via Prometheus rules. |

> **⚠️ Local vs. cluster footprint.** The table above describes the **cluster/prod** topology. **Locally**, this entire stack is collapsed into the single **`grafana/otel-lgtm`** image (Grafana + Prometheus + Loki + Tempo, ~400 MB) plus **one** OTel Collector. **Pyroscope** runs as an **opt-in** sidecar container, toggled on only when profiling memory-leak scenarios for the AI SRE. Separate **Mimir**, the two-tier agent+gateway Collector, and standalone Loki/Tempo are reserved for the cluster path. See [ADR-0001](#-adr-0001--local-dev--resource-constraints-locked).

### Instrumentation strategy
- **OpenTelemetry SDKs** in every service — no vendor agents.
- **Auto-instrumentation** wherever it exists (Java agent, Node.js zero-code, Python `opentelemetry-instrument`).
- **Manual spans** for business operations (`order.checkout`, `payment.authorize`) with semantic-convention attributes.
- **Grafana Beyla** as an eBPF-based safety net — captures HTTP/gRPC golden signals from any language even if SDK instrumentation regresses. Crucial for guaranteeing telemetry coverage for the AI SRE.
- **Logs are structured JSON** (slog / pino / structlog / logback-json), always carrying `trace_id` and `span_id`.

### SLOs as code
- **Sloth** to generate Prometheus recording + alerting rules from human-readable SLO YAML.
- Every service ships with a baseline SLO (e.g. Catalogue: 99.9% of `GET /products` < 200ms over 30d).
- SLO burn-rate alerts feed Alertmanager → routed to the Incident Simulator's annotation store, so the AI SRE training pipeline can label "which incident triggered which alert."

### Service mesh observability (optional layer)
**Istio Ambient Mode** (sidecar-less) is offered as an opt-in overlay for users who want L7 mesh telemetry without sidecar overhead. **Linkerd** is the documented alternative. Neither is required for the core experience.

---

## 💥 Chaos & Incident Engineering

This is where Shoe Shop differs sharply from Sock Shop. We don't just inject random pod kills — we orchestrate **realistic, labeled, repeatable incident scenarios**.

### The three layers of chaos

| Layer | Tool | What it does |
|-------|------|--------------|
| **Infra** | **Chaos Mesh** (CNCF Incubating) | Pod kills, network partition, CPU/memory stress, disk I/O, time skew, DNS chaos. Kubernetes-native CRDs. |
| **Network** | **Toxiproxy** sidecars | Per-connection latency injection, bandwidth throttling, slow-close. Surgical, in-process. |
| **Application** | **Feature-flag fault injection** (OpenFeature) | In-code "if flag set, return 500 / sleep 2s / leak 100MB." Models bugs, not infra failures. |

### The Incident Simulator (custom)
A small Go service in `tools/incident-simulator/` that **orchestrates scenarios** — not single faults. Examples shipped on day 1:

| Scenario | Symptom chain | Root cause |
|----------|---------------|------------|
| `cascading-timeout` | BFF p99 ↑ → Cart errors ↑ → Cart pool exhaustion → Catalogue healthy but blackholed | Slow Redis cluster member |
| `noisy-neighbor` | Payment CPU throttling → Order checkout latency ↑ → SLO burn | Recommendation pod starts onnx-inference batch on shared node |
| `db-pool-exhaustion` | Orders 500s ↑ → connection refused | Long-running migration holds connections |
| `memory-leak` | Notification pod OOMKilled every 6h → backlog grows in NATS | Goroutine leak under a specific event type |
| `dns-flap` | Random services briefly unreachable, recover, repeat | CoreDNS pod cycling |
| `clock-skew` | JWT validation fails on Users → cascading 401s | Time drift on one node |

Each scenario:
- Has a machine-readable **manifest** (`scenarios/cascading-timeout.yaml`) declaring the fault sequence, expected symptoms, and ground-truth root cause.
- Emits **annotation events** to Grafana (`incident.start`, `incident.end`) tagged with the scenario ID.
- Produces a labeled `(time_window, root_cause)` record — **this is the training signal for Project 2: AI SRE.**

### Load generation
- **k6** for HTTP/gRPC load with realistic distributions (Pareto for cart sizes, Poisson for arrivals).
- A `tools/load-generator/` profile per persona: *browser*, *bargain-hunter*, *checkout-abandoner*, *bot*.

---

## 🎨 UI/UX Approach

The frontend deserves the same rigor as the backend. A demo that *looks* like a demo undermines the project's credibility.

### Stack
- **Next.js 15** (App Router, React Server Components, Partial Prerendering)
- **TypeScript** in strict mode
- **Tailwind CSS 4** for utility-first styling
- **shadcn/ui** for accessible, themeable primitives (Radix under the hood)
- **Motion** (formerly Framer Motion) for tasteful micro-interactions
- **next-intl** for i18n scaffolding (even if we ship English first)

### Design north star
Think **Allbirds / On / Veja** — clean editorial layout, generous whitespace, large product photography, no skeuomorphic gradients, no stock-bootstrap aesthetic. Dark mode first-class.

### Why this matters beyond aesthetics
- **Realistic frontend telemetry**: SSR + RSC + Client Components produce a non-trivial trace shape (server-side fetch waterfalls, client-side hydration, partial revalidation). Sock Shop's vanilla AngularJS frontend can't generate this.
- **Real Core Web Vitals data**: We ship `web-vitals` → OTel → Grafana, so the AI SRE can correlate backend incidents with frontend UX degradation.
- **Accessible by default**: WCAG 2.2 AA. Lighthouse a11y score ≥ 95 is a CI gate.

---

## 📁 Repository Layout

A strict, language-agnostic monorepo. Every service is self-contained; shared concerns live in `libs/` per language.

```
shoe-shop/
├── README.md
├── LICENSE                              # Apache 2.0
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── SECURITY.md
├── Taskfile.yml                         # Top-level task runner (go-task)
│
├── .github/
│   ├── workflows/                       # CI: build, test, scan, SBOM, sign
│   ├── ISSUE_TEMPLATE/
│   └── PULL_REQUEST_TEMPLATE.md
│
├── docs/
│   ├── architecture/                    # Component diagrams, data flows
│   ├── observability/                   # Dashboard catalogue, semconv guide
│   ├── chaos/                           # Scenario catalogue & runbooks
│   ├── adr/                             # Architecture Decision Records
│   └── runbooks/                        # Per-service runbooks (also fed to AI SRE)
│
├── proto/                               # Single source of truth: gRPC + AsyncAPI
│   ├── buf.yaml
│   ├── catalogue/v1/
│   ├── orders/v1/
│   ├── payment/v1/
│   └── ...
│
├── services/
│   ├── frontend/                        # Next.js 15 + TS
│   ├── bff/                             # Hono BFF (TS)
│   ├── catalogue/                       # Go
│   ├── cart/                            # Node.js + Fastify
│   ├── orders/                          # Java 21 + Spring Boot 3.3
│   ├── payment/                         # Rust + Axum
│   ├── users/                           # Python + FastAPI
│   ├── shipping/                        # Kotlin + Ktor
│   ├── inventory/                       # Go
│   ├── recommendation/                  # Python + FastAPI + ONNX
│   └── notification/                    # Go + NATS
│
├── libs/                                # Shared, language-scoped libraries
│   ├── go/otelinit/                     # Standard OTel bootstrap for Go services
│   ├── ts/otelinit/
│   ├── java/otelinit/
│   ├── python/otelinit/
│   ├── rust/otelinit/
│   └── kotlin/otelinit/
│
├── deploy/
│   ├── compose/                         # docker compose for the simplest possible start
│   ├── helm/                            # Umbrella + per-service Helm charts
│   ├── kustomize/                       # base + overlays/{local,demo,prod}
│   ├── tilt/                            # Tilt config for inner-loop K8s dev
│   ├── argocd/                          # GitOps Applications + AppProjects
│   └── terraform/                       # Optional cloud bootstrap (EKS/GKE/AKS)
│
├── observability/
│   ├── otel-collector/                  # Agent + Gateway configs
│   ├── grafana/
│   │   ├── dashboards/                  # Jsonnet (Grafonnet) sources
│   │   └── datasources/
│   ├── mimir/                           # Recording rules
│   ├── loki/
│   ├── tempo/                           # TraceQL examples
│   ├── pyroscope/
│   ├── alerts/                          # Prometheus alerting rules
│   └── slo/                             # Sloth SLO definitions
│
├── chaos/
│   ├── experiments/                     # Chaos Mesh CRDs
│   ├── scenarios/                       # Curated incidents (YAML manifests)
│   └── toxiproxy/                       # Toxiproxy configs per-service
│
├── tools/
│   ├── load-generator/                  # k6 scripts + personas
│   ├── incident-simulator/              # Scenario orchestrator (Go)
│   ├── data-seeder/                     # Idempotent seed loader
│   └── trace-labeler/                   # Exports (window, root_cause) for AI SRE
│
├── scripts/
│   ├── bootstrap.sh                     # One-shot local bringup
│   ├── seed.sh
│   └── verify-otel.sh                   # Smoke test: every service must emit a trace
│
└── .editorconfig / .gitattributes / .gitignore
```

**Conventions:**
- Every service directory contains its own `README.md`, `Dockerfile`, `Taskfile.yml`, and `OWNERS`.
- Every service exposes `/healthz`, `/readyz`, `/metrics` (Prometheus), and OTLP-emits by default.
- Distroless / chiseled base images, multi-arch (`linux/amd64`, `linux/arm64`), rootless.
- Images signed with **Cosign**, SBOM via **Syft**, scanned with **Trivy** in CI.

---

## 🛠 Local Development Promise

> *(No code yet — this section documents the contract the eventual code must satisfy.)*

Three escalating tiers, each with a hard time budget:

| Tier | Tool | Promise | Time budget |
|------|------|---------|-------------|
| **L0 — Try it** | `docker compose up` | Full stack + Grafana running on `localhost`. No K8s required. | ≤ 5 min cold |
| **L1 — Hack on it** | `tilt up` (against k3d / kind) | Live-reload on file change, port-forwarded UIs, dev-time tracing on. | ≤ 8 min cold |
| **L2 — Cluster-grade** | `helm install` (any conformant K8s) | Production-shape topology, HPA, PDBs, NetworkPolicies, mesh-optional. | depends on cluster |

A `Taskfile.yml` at the root exposes the same verbs across all tiers: `task up`, `task seed`, `task chaos:run cascading-timeout`, `task obs:open`.

---

## ⚙️ ADR-0001 — Local Dev & Resource Constraints (LOCKED)

> The first project decision is recorded inline because it shapes every file in v0.1. Full record will live at `docs/adr/0001-local-dev-resource-constraints.md`.

**Context — reference hardware envelope.** Shoe Shop must run on a developer laptop, not just a cluster. Our reference target is a constrained but common machine: **16 GB system RAM**, with **Docker via WSL2 hard-capped at 8 GB**. At full load the containerized stack uses ~6.5 GB, leaving only **~1.5 GB headroom** — which the project's own memory-leak/saturation chaos can exhaust and freeze the VM. Every decision below falls out of that single fact.

**Decisions:**

| # | Question | Ruling |
|---|----------|--------|
| 1 | Dev model | **Dual-Path Taskfile.** `task dev` = Hybrid (infra+obs in Docker, edited services native + hot-reload); `task up` = full containerized parity; chaos implies the orchestrated path. The two missions have different runtime needs, so both paths are mandatory. |
| 2 | Local orchestrator | **Compose by default; k3d (never kind) for chaos.** kind's per-node kubelet+etcd costs ~1–1.5 GB; k3d's sqlite-backed control plane is ~0.5–0.8 GB. Chaos Mesh + real `OOMKilled`/eviction telemetry need K8s, so k3d earns its tax only on the chaos path. |
| 3 | Database | **Raw Postgres 16, database-per-service.** No Supabase — managed DB is a chaos black box (can't exhaust pools, inject I/O latency, reproduce DB incidents) and self-hosted Supabase is ~9 containers. Both outcomes starve the AI SRE. `postgres_exporter` for metrics. |
| 4 | Message broker | **NATS JetStream.** ~40 MB vs Kafka's ~1 GB JVM; sub-second restart (good chaos action); replayable streams (deterministic incident regen); W3C trace propagation. RabbitMQ rejected (queue, not replayable log). Redpanda kept as a documented Kafka-API swap. |
| 5 | Service count | **11 boundaries, configurable topology.** The count is a *feature* (deep cross-language traces, room for cascades, a home per language), not domain modeling. RAM is managed with profiles, not by collapsing services. |

**Locked forks (this session):**

| Fork | Decision |
|------|----------|
| Default local topology | **`core` profile** (frontend, bff, catalogue, cart, orders, payment) via **Hybrid `task dev`** — full end-to-end checkout trace at minimum RAM |
| Local observability | **`grafana/otel-lgtm` bundle** (~400 MB) baseline + **opt-in Pyroscope** toggle for memory-leak training |
| Auth provider | **Zitadel** (Go, ~200 MB) over Keycloak's JVM |

**Topology dial (Compose/k3d profiles):**

| Profile | Services | Target |
|---------|----------|--------|
| `core` *(default)* | 6 — frontend, bff, catalogue, cart, orders, payment | Daily dev, tightest RAM |
| `full` | all 11 | Demo, integration, chaos |
| `lean-jvm` | 11, Orders/Shipping `-Xmx192m` | Squeeze the JVMs |

**Standing mandates:**
- **Every container gets a hard memory limit** (`mem_limit` / `resources.limits.memory`). This converts a WSL2 freeze into a clean, *observable* OOMKill — which is also better AI-SRE training data.
- **High-volume telemetry generation targets a bigger box / cheap cloud k3s node.** Local k3d is for *authoring and validating* chaos scenarios on a subset, not sustained full-stack load.

---

## 🗺 Roadmap

> Status: **Blueprint phase.** This README is the contract; code follows.

- [ ] **v0.1 — Foundations**: monorepo scaffold, **Dual-Path `Taskfile.yml`**, **Compose profiles** (`core`/`full`/`lean-jvm`) with per-container mem limits, `proto/` + Buf, CI skeleton, OTel libs per language
- [ ] **v0.2 — Read path**: Frontend + BFF + Catalogue + Users, end-to-end trace in Grafana
- [ ] **v0.3 — Write path**: Cart + Orders + Payment + Inventory, sagas working
- [ ] **v0.4 — Async**: NATS JetStream, Notification + Shipping event flows
- [ ] **v0.5 — Observability**: full LGTM+P stack, baseline dashboards, SLOs, Beyla
- [ ] **v0.6 — Chaos**: Chaos Mesh + Toxiproxy + first 6 incident scenarios
- [ ] **v0.7 — Recommendation**: ML service, GPU-optional, tail-latency dashboards
- [ ] **v0.8 — Mesh overlay**: Istio Ambient opt-in
- [ ] **v0.9 — Polish**: Lighthouse ≥ 95, k6 personas, docs site
- [ ] **v1.0 — GA**: Helm chart on Artifact Hub, blog post, conference demo
- [ ] **v1.x — AI SRE bridge**: `trace-labeler` exports for Project 2

---

## 📜 License & Contributing

**Apache License 2.0.** Permissive, vendor-friendly, the CNCF default — chosen so vendors and educators can adopt Shoe Shop without legal friction.

Contributions are welcomed once the v0.1 scaffold is in place. The contribution model is:

- **ADRs first** for any architectural change (`docs/adr/NNNN-title.md`)
- **Conventional Commits** for changelog automation
- **DCO sign-off** on all PRs (no CLA)
- **Reproducible CI** — every PR runs the full stack and a smoke chaos scenario before merge

---

<div align="center">

**Shoe Shop is a love letter to the people running production at 3 a.m.**

*Built so the next generation of tools — and the AI SREs that will partner with them — have something real to learn from.*

</div>
