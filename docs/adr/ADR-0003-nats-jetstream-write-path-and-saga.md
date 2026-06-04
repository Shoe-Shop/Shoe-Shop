# ADR-0003 — v0.3 write path: NATS JetStream, an orchestrated checkout saga, rich domain Events

- **Status:** Accepted
- **Date:** 2026-06-04
- **Builds on:** ADR-0001 (local dev & resource constraints), ADR-0002 (MELT is the
  product; every new service is born MELT-complete). Realizes `ARCHITECTURE.md`
  §3's "async/event flows use NATS JetStream" and §11's v0.3 milestone.

---

## Context

The read path is complete and MELT-complete end to end: `frontend → bff →
{catalogue, cart, users}`, all **synchronous gRPC**. NATS JetStream is provisioned
in the backbone (`nats -js`, durable store, healthcheck) but **no service touches
it yet** — the async path is dark.

v0.3 lights it up: turn a cart into an order, reserve stock, take payment, confirm
or compensate. This is the milestone where domain **Events** (the "E" in MELT)
become *rich* — ADR-0002 explicitly deferred rich events to "the v0.3 NATS write
path." Three new services land (Orders · Payment · Inventory) plus a pure
subscriber (Notification), across three new language stacks (Java/Spring,
Rust/Axum, Go).

The dominant *new* technical risk is **trace-context propagation across NATS
messages**: keeping the saga a single correlated trace across async hops. No
service does this today, and it is the linchpin of the whole MELT/incident-corpus
purpose — an async saga that fragments into disconnected traces is useless as
training data.

## Decision

### 1. Sync edge, async fulfillment

Checkout is a **synchronous front door over an asynchronous saga**:

```
frontend → bff → Orders.CreateOrder (gRPC, sync)
                   │  BFF assembles the request: reads cart line items
                   │  (it already fronts cart) + attaches the user id
                   │  Orders persists order = PENDING, starts the saga
                   └─ returns { order_id, status: PENDING } immediately
                          ⇣ (async, over NATS JetStream)
        Orders orchestrates ⇄ Inventory ⇄ Payment ⇄ Notification
```

The UI gets a fast acknowledgement; fulfillment runs in the background and the
order's terminal state (CONFIRMED / CANCELLED) is reached asynchronously. This is
realistic *and* it is the point of v0.3 — it exercises the JetStream path the read
path never touches. BFF stays a thin gateway; Orders is the system of record for
orders and the only saga authority.

### 2. Orchestrated saga (Orders is the coordinator)

Orders owns an **explicit state machine** and emits a lifecycle Event at every
transition. Chosen over choreography because the real product is a **labeled
incident corpus**: orchestration gives explicit state, clean root-cause
attribution, and obvious, nameable failure-injection points. Happy path:

| # | Subject (command → reply event) | Actor | Effect |
|---|---|---|---|
| 1 | `inventory.reserve` | Orders publishes | order PENDING → RESERVING |
| 2 | `inventory.reserved` | Inventory | stock decremented (Postgres) |
| 3 | `payment.authorize` | Orders publishes | order RESERVING → AUTHORIZING |
| 4 | `payment.authorized` | Payment | simulated charge captured |
| 5 | `orders.confirmed` | Orders | order → CONFIRMED |
| 6 | (consume `orders.confirmed`) | Notification | "sends" confirmation (Event) |

**Compensation** (any step fails) runs in reverse: e.g. `payment.declined` →
Orders publishes `inventory.release` → Inventory restocks → Orders →
`orders.cancelled`. `inventory.rejected` (insufficient stock) short-circuits to
`orders.cancelled` with no payment attempted.

### 3. JetStream streams & subject catalog

Streams are grouped by **owning domain** (the service that consumes commands on
that subject owns the stream). Three streams, `WorkQueue`/`Limits` retention as
noted, all backed by the file store the backbone already mounts:

| Stream | Subjects | Owner | Notes |
|---|---|---|---|
| `ORDERS` | `orders.placed`, `orders.confirmed`, `orders.cancelled` | Orders | lifecycle events; Notification + (future) analytics subscribe |
| `INVENTORY` | `inventory.reserve`, `inventory.release` (cmds); `inventory.reserved`, `inventory.rejected` (events) | Inventory consumes cmds; Orders consumes events | |
| `PAYMENT` | `payment.authorize`, `payment.void` (cmds); `payment.authorized`, `payment.declined` (events) | Payment consumes cmds; Orders consumes events | |

Consumers are **durable**, named per service+role (e.g. `inventory-reserve-worker`,
`orders-saga`), with explicit ack and a bounded redelivery / max-deliver so a
poison message becomes a dead-lettered, *observable* failure rather than an
infinite loop — itself a future incident scenario. Idempotency is keyed on
`order_id` (each domain action is safe to replay).

### 4. Event envelope: JSON body, `traceparent` in NATS headers

Async event/command **bodies are JSON** with a documented envelope; the W3C
`traceparent` (+ optional `tracestate`) rides in **NATS message headers**, never in
the body. Sync RPC contracts (`Inventory.GetStock`, `Orders.CreateOrder`, …) stay
**protobuf** in `proto/`. Rationale: events are the MELT "E" signal and a core
dataset artifact, so a human-readable, easily-labeled JSON body wins; it avoids
forcing protobuf codegen for Java/Rust just for event bodies; and trace context
propagates via headers regardless of body format. (Protobuf-for-RPC +
JSON-for-events is a common, realistic split.)

Envelope:

```jsonc
{
  "event_id":   "<uuid>",            // unique per message; idempotency/dedup hint
  "type":       "inventory.reserve", // == the subject it is published on
  "occurred_at":"2026-06-04T12:34:56.789Z", // RFC 3339 / ISO 8601 (UTC, ms)
  "order_id":   "<uuid>",            // the saga correlation id (saga_id == order_id in v0.3)
  "data":       { /* domain payload, per subject */ }
}
```

Per-subject `data` payloads (v0.3):

- `inventory.reserve` / `inventory.release`: `{ "items": [ { "product_id": "..", "quantity": N } ] }`
- `inventory.reserved`: `{}` · `inventory.rejected`: `{ "reason": "insufficient_stock", "product_id": ".." }`
- `payment.authorize`: `{ "amount_cents": N, "currency": "USD" }` · `payment.void`: `{}`
- `payment.authorized`: `{ "authorization_id": ".." }` · `payment.declined`: `{ "reason": ".." }`
- `orders.placed|confirmed|cancelled`: `{ "user_id": "..", "total_cents": N, "currency": ".." }`

### 5. Trace-context propagation over NATS (the shared spine)

A small, per-stack publish/consume wrapper:

- **Publish:** inject the active span context (`propagation.TraceContext`) into the
  outgoing NATS message **headers** as `traceparent`.
- **Consume:** extract `traceparent` from headers, start a **CONSUMER**-kind span
  as a child of (or linked to) the producer span, run the handler inside it. Every
  log/event emitted in the handler therefore carries the saga's `trace_id`.

This makes `Orders.CreateOrder → inventory.reserve → inventory.reserved →
payment.authorize → … → orders.confirmed` resolve as **one trace** in Tempo, with
each service's logs/events joinable by that `trace_id` in Loki — i.e. it satisfies
the §9 correlation contract across async hops, not just sync ones. The Go version
is built first (with Inventory) and is the reference the Java/Rust/Notification
versions mirror.

### 6. Payment is a deterministic simulator (reproducible incidents)

Payment has no real PSP. It decides authorize/decline by **deterministic rules**
(e.g. amounts in a configured band decline; a configurable injected latency/error
rate) so incidents are **reproducible** — a requirement of the labeled corpus, not
a shortcut.

### 7. Build order — each born MELT-complete, OTel verified in Docker first

0. **Proto + this ADR** — the shared spine (subjects, envelope, propagation).
1. **Inventory (Go)** — reuses the proven Go MELT module set + `internal/telemetry`
   reference (Catalogue). A saga **leaf** (gRPC `GetStock` + NATS reserve/release
   consumer + Postgres), so it is the simplest place to nail the new NATS+OTel
   propagation pattern on a known-good stack before adding new languages.
2. **Orders (Java/Spring)** — the orchestrator; new stack; owns the state machine.
3. **Payment (Rust/Axum)** — new stack, Rust OTel least mature → last, once the
   saga shape is proven; deterministic simulator.
4. **Notification (Go)** — pure subscriber on the proven stack; consumes terminal
   events, emits Events; demonstrates fan-out.

## Consequences

**Positive**

- The async path is finally exercised; domain Events become rich, as ADR-0002
  planned — the corpus gains the "trigger" signal it was missing.
- An orchestrated saga with explicit state + compensations is a *generator of
  clean, labelable incidents* (payment-decline storm, Inventory down → orders
  stuck RESERVING, oversell race, poison-message dead-letter, stuck saga timeout).
- The NATS+OTel propagation pattern, proven once in Go, is inherited by every
  later async service by construction.

**Negative / costs**

- Three new language stacks (Java, Rust, Go-subscriber) each need their OTel
  four-signal APIs **verified in Docker** before use (ADR-0002's cross-stack
  maturity cost applies again — Rust's `tracing-opentelemetry` logs/metrics
  maturity is the known unknown).
- Java/Spring (~384 MiB) is a real RAM add; the full checkout set must be measured
  against the 8 GB WSL2 budget and may live in its own profile rather than `core`.
- Saga/eventing complexity (idempotency, redelivery, dead-letter, timeouts) is new
  surface area — deliberately so, since it is also incident surface.

## Alternatives considered

- **Choreography (no central coordinator) — rejected.** More "pure" event-driven,
  but the saga is harder to trace as a whole and far harder to *label* by root
  cause — directly at odds with the incident-corpus product. Orchestration's
  explicit state machine is the asset here.
- **Fully synchronous checkout over gRPC — rejected.** Simpler, but it is just
  more of the read path; it never exercises JetStream, which is the entire purpose
  of v0.3.
- **Protobuf event envelopes over NATS — rejected (for now).** More type-safe
  cross-language, but forces protobuf codegen for Java/Rust just for event bodies
  and yields opaque binary in the dataset; JSON bodies are easier to inspect and
  label. Revisit if event schemas need stronger cross-stack guarantees. Sync RPC
  stays protobuf regardless.
- **Orders-first build order — rejected.** Orders defines the contracts, but it is
  a new stack *and* the coordinator *and* introduces NATS at once. Inventory-first
  de-risks NATS+OTel on the proven Go stack; the proto/ADR spine (step 0) gives
  everyone the contracts before Orders is written.
