# Exported dataset (the trainable artifact)

> **Generated, committed output.** Produced by
> [`tools/trace-labeler/`](../../../tools/trace-labeler/) from the labeled
> incident records in [`../incidents/`](../incidents/). Regenerate with
> `task dataset:export` (needs `task up:checkout` running and the bundle still
> holding the incidents' windows). Do not hand-edit.

This is the dataset for the future AI-SRE ("project 2", ADR-0002). Each line is
**one self-contained training example** for one labeled incident: the four-signal
(MELT) telemetry slice inside the incident's `time_window` (the **input**) joined
to the incident's `root_cause` / `remediation` / `fault` (the supervised
**label**).

## Files

| File | What |
|------|------|
| `dataset.jsonl` | The dataset — one JSON object per line, one line per incident, sorted by `incident_id`. |
| `manifest.json` | Provenance index: per-incident `time_window`, signal `counts`, `extracted_at`, and the `sha256` of its dataset line; plus dataset `totals` and the bundle queried. |

**Format: JSONL** (not Parquet) — by design. The corpus is small and the schema
is still `export-v0`/evolving, so JSONL stays human-diffable, git-friendly, and
dependency-free, matching the repo's hand-authored-YAML lineage. Parquet is a
later decision for when the corpus is large and the schema stable.

## Example schema (`export-v0`)

```jsonc
{
  "export_schema": "export-v0",
  "incident_id": "incident-0002",
  "scenario_id": "payment-hard-decline",
  "title": "...",

  "label": {                      // the supervised target (from the incident record)
    "root_cause": "...",          //   the one-line ground truth a model must predict
    "remediation": "...",         //   the action a model should learn to recommend
    "severity": "sev2",
    "fault": { "type", "target_service", "injection_method", "parameters" },
    "affected_services": [ ... ],
    "signals_touched": { "metrics", "events", "logs", "traces" }
  },

  "time_window":  { "start", "end" },          // RFC 3339 UTC — the labeled bounds
  "query_window": {                            // exactly how each signal was sliced
    "logs_events": { "start_unix", "end_unix", "strict": true },
    "traces":      { "start_unix", "end_unix", "strict": true },
    "metrics":     { "start_unix", "end_unix", "pad_s": 120 }
  },
  "correlation": {                             // the join anchors (trace_ids backfilled)
    "resource_selector", "exemplar_metric", "order_ids", "trace_ids"
  },

  "signals": {                                 // the INPUT — the correlated MELT slice
    "traces":  [ { "trace_id", "root_service", "span_count", "services",
                   "spans": [ { "span_id", "parent_span_id", "service", "name",
                                "duration_ms", "status", "attributes", "events" } ] } ],
    "logs":    [ { "ts_unix_nano", "service", "level", "trace_id", "span_id", "body", "labels" } ],
    "events":  [ { "ts_unix_nano", "service", "name", "trace_id", "span_id", "attributes" } ],
    "metrics": { "exemplar_metric",
                 "series":    [ { "name", "query", "result": [ { "labels", "samples" } ] } ],
                 "exemplars": [ { "series_labels", "labels", "value", "timestamp" } ] }
  },

  "evidence": {                                // each record symptom executed verbatim
    "symptoms": [ { "signal", "service", "description", "where", "executed", "result_count", ... } ]
  },
  "extraction": { "tool_version", "extracted_at", "bundle", "counts", "queries" }
}
```

The four signals are joinable by `trace_id` (logs/events ↔ traces), `order.id`
(write-path), `exemplar` (metric ↔ trace where the SDK supports it), and the
shared `time_window` + `resource_selector` — the join keys defined in
[`../correlation-contract.md`](../correlation-contract.md).

## Current contents

5 examples (`incident-0002..0006`) spanning all four injection methods and both
write-path and read-path blast radii. See `manifest.json` for exact per-incident
counts and the dataset totals.
