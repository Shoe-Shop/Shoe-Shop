# Incident dataset & labeling track

> **Status: DESIGN ONLY (design now, build later).** Per
> [ADR-0002](../adr/ADR-0002-melt-four-signal-telemetry-as-product.md), this
> directory defines the *shape* of the future incident corpus. It is the schema
> and the rules — **not** an export pipeline, storage layer, or automation.

Shoe Shop's product is correlated four-signal telemetry (**MELT**) plus a
**labeled, reproducible incident corpus**. That corpus is the training / eval
dataset for a future AI SRE ("project 2"). A labeled incident is the supervised
target; the correlated MELT inside its time window is the input.

## What lives here

| File | Purpose |
|------|---------|
| [`incident-schema.md`](incident-schema.md) | The **label schema** — the versioned record that describes one incident (ground truth). |
| [`correlation-contract.md`](correlation-contract.md) | The **correlation contract** — the join keys every service must emit so a labeled window resolves to all four signals. This is the *definition of done* the telemetry retrofit must satisfy. |
| [`examples/incident-0001-cascading-timeout.yaml`](examples/incident-0001-cascading-timeout.yaml) | **One worked example** record, validating the schema is expressive enough. |

## The boundary (what is explicitly NOT in scope yet)

Held deliberately to prevent the dataset track from becoming an open-ended
data-engineering project:

- ❌ No export / capture pipeline (no `tools/trace-labeler/` implementation).
- ❌ No storage, retention, or schema-migration tooling.
- ❌ No automated extraction of telemetry windows from the LGTM bundle.
- ❌ No dataset format decision (Parquet / JSONL / etc.) beyond the label record.

These wait until **enough real services and real incidents exist** to make the
export design concrete. Designing the schema and correlation rules *now* ensures
that when incidents do run, they are recorded in a trainable shape from the first
one — rather than generating ephemeral telemetry that is lost.

## Why design-first

The LGTM bundle is ephemeral local storage. If incidents run before the label
schema and correlation keys exist, the telemetry they produce is unlabeled and
unrecoverable. Fixing the schema early makes every future incident trainable by
construction.
