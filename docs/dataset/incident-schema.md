# Incident label schema (v0)

> **Design only.** The label record for one incident — the supervised ground
> truth in the future corpus. Versioned (`schema_version`) so it can evolve
> without breaking older records. Format is YAML for hand-authoring now; a
> machine format (JSONL/Parquet) is a *later* decision (see
> [`README.md`](README.md) boundary).

A labeled incident answers, for one bounded time window: **what broke, where,
why, what it looked like, and how it was fixed** — and which signals carry the
evidence.

## Fields

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `schema_version` | string | ✅ | Schema version this record conforms to (e.g. `v0`). |
| `incident_id` | string | ✅ | Stable unique id, e.g. `incident-0001`. |
| `title` | string | ✅ | Short human label. |
| `scenario_id` | string | ✅ | The reproducible scenario that generated it (maps to the future incident-simulator manifest). |
| `time_window` | object | ✅ | `{ start, end }` — RFC 3339 UTC. The bounds telemetry is sliced to. |
| `fault` | object | ✅ | The injected cause. `{ type, target_service, injection_method, parameters }`. |
| `root_cause` | string | ✅ | One-line ground-truth root cause (the label a model must predict). |
| `affected_services` | string[] | ✅ | Services with observable symptoms (blast radius). |
| `signals_touched` | object | ✅ | Which of `metrics`/`events`/`logs`/`traces` carry evidence (bool each). All four SHOULD be true for a well-formed incident. |
| `expected_symptoms` | object[] | ✅ | Observable symptoms, each `{ signal, service, description, where }` — `where` is a TraceQL/LogQL/PromQL pointer or attribute selector. |
| `correlation` | object | ✅ | Anchors to find the data: `{ trace_ids[], resource_selector, exemplar_metric }`. See [`correlation-contract.md`](correlation-contract.md). |
| `remediation` | string | ✅ | What resolved it (the action a model should learn to recommend). |
| `severity` | enum | — | `sev1`..`sev4` (informational). |
| `notes` | string | — | Free text. |
| `labeler` | string | — | Who/what produced the record. |

## Conventions

- **Timestamps** are RFC 3339, UTC, and MUST align with the
  `deployment.environment=local` clock the services export with.
- **Service names** MUST match `service.name` resource attributes exactly
  (`catalogue`, `bff`, `cart`, `users`, …) so labels join to telemetry.
- `fault.injection_method` enumerates how the fault was introduced. Fixed by the
  incident-simulator ([`tools/incident-simulator/`](../../tools/incident-simulator/))
  to what the Compose stack can actually do:
  - **`env-knob`** — set a service env var and recreate its container (e.g. the
    Payment simulator's `PAYMENT_FAILURE_RATE` / `PAYMENT_LATENCY_MS`). The only
    method **implemented** in simulator v0.
  - **`compose-stop`** — stop a container outright (service-down faults; the
    Compose analog of Sock Shop's "scale to 0"). *Designed, not yet wired.*
  - **`resource-limit`** — apply a `mem_limit` / `cpus` cap to starve a service
    (DB-throttle faults). *Designed, not yet wired.*
  - **`load`** — drive excess storefront traffic (saturation/crash faults).
    *Designed, not yet wired.*
  - **`toxiproxy`** — network fault injection. *Planned* — requires a Toxiproxy
    sidecar that is **not** in the stack today, so the cascading-timeout fixture
    that uses it ([`examples/`](examples/)) remains a design fixture until then.
- `correlation.order_ids` (optional) — for write-path incidents, the order ids a
  run produced. Each order span carries an `order.id` attribute, so this anchors
  the labeled window to its traces in Tempo even before `trace_ids` are
  backfilled. Emitted by the incident-simulator.
- A record is **well-formed** only if `signals_touched` has all four `true` and
  `correlation` provides at least one anchor — this enforces the MELT
  requirement at the dataset level.
