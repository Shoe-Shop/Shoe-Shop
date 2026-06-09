# Incident dataset & labeling track

> **Status: ACTIVE — schema, captured incidents, AND export pipeline.** Per
> [ADR-0002](../adr/ADR-0002-melt-four-signal-telemetry-as-product.md), this
> directory began as the *shape* of the future incident corpus (schema + rules).
> It now also holds **captured incidents** ([`incidents/`](incidents/)) and the
> **exported trainable dataset** ([`exports/`](exports/)), produced by the
> [`tools/trace-labeler/`](../../tools/trace-labeler/) export pipeline.

Shoe Shop's product is correlated four-signal telemetry (**MELT**) plus a
**labeled, reproducible incident corpus**. That corpus is the training / eval
dataset for a future AI SRE ("project 2"). A labeled incident is the supervised
target; the correlated MELT inside its time window is the input.

## What lives here

| File | Purpose |
|------|---------|
| [`incident-schema.md`](incident-schema.md) | The **label schema** — the versioned record that describes one incident (ground truth). |
| [`correlation-contract.md`](correlation-contract.md) | The **correlation contract** — the join keys every service must emit so a labeled window resolves to all four signals. This is the *definition of done* the telemetry retrofit must satisfy. |
| [`examples/incident-0001-cascading-timeout.yaml`](examples/incident-0001-cascading-timeout.yaml) | **One worked example** record (design fixture; uses the not-yet-wired `toxiproxy` method). |
| [`incidents/`](incidents/) | **Captured** schema-v0 records from real incident-simulator runs (`incident-0002..0006`). |
| [`exports/`](exports/) | The **exported trainable dataset** (`dataset.jsonl` + `manifest.json`) — one MELT training example per captured incident. |

## The pipeline (now built)

```
scenario manifest ──► incident-simulator ──► incident record ──► trace-labeler ──► dataset.jsonl
 (tools/incident-       inject·load·recover     (incidents/,        (export MELT       (exports/, one
  simulator/)           ·label                   the label)          slice from bundle)  example/incident)
```

The previously-deferred boundary — *no export pipeline / no automated extraction
/ no format decision* — is **resolved**:
[`tools/trace-labeler/`](../../tools/trace-labeler/) extracts the correlated MELT
slice for each labeled window from the LGTM bundle (Tempo + Loki + Prometheus)
into versioned **JSONL** (format rationale in [`exports/`](exports/)). Run it with
`task dataset:export`. Remaining out of scope (deliberately): retention /
schema-migration tooling, and the Parquet decision (revisited when the corpus is
large and the schema stable).

## Why design-first (and why it paid off)

The LGTM bundle is ephemeral local storage. Designing the label schema and
correlation keys *before* running incidents ensured every captured incident was
trainable **by construction** — so when the export pipeline landed, it extracted
clean four-signal slices from records `0002..0006` without re-running anything.
Fixing the schema early is exactly what made the late-built exporter trivial.
