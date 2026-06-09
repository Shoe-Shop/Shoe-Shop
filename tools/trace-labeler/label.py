#!/usr/bin/env python3
"""Shoe Shop trace-labeler — dataset export pipeline (v0).

Turns the labeled incident records under ``docs/dataset/incidents/`` into a
trainable dataset: for each record it extracts the correlated four-signal
(MELT) slice bounded by the record's ``time_window`` from the LGTM bundle and
emits ONE self-contained training example.

    incident record (label / ground truth)  ──►  extract MELT slice  ──►  one JSONL line
        time_window + correlation                  Tempo · Loki · Prometheus      (input = signals,
        + root_cause/remediation (the target)                                      label = the record)

Why this exists (ADR-0002, docs/dataset/README.md): the LGTM bundle is ephemeral
local storage. A labeled incident is only trainable while its telemetry still
lives in the bundle; this tool captures that telemetry into a versioned,
git-committed artifact so the corpus survives the bundle.

Runtime — Python-in-container (see Dockerfile): runs on the ``shoeshop`` Compose
network with the repo mounted at /work, querying the bundle's backends directly
(Tempo :3200, Loki :3100, Prometheus :9090). HTTP + file IO only — no Docker
socket. Invoked via ``task dataset:export`` (all records) or
``task dataset:export -- incident-0002`` (one).

Bundle query APIs (all verified live against the running bundle):
  • Tempo     GET /api/search?q=<TraceQL>&start&end&limit   → trace ids by order.id
              GET /api/traces/{id}                          → full OTLP spans
  • Loki      GET /loki/api/v1/query_range?query=<LogQL>    → logs (trace_id is a label here)
  • Prometheus GET /api/v1/query_range?query=<PromQL>       → RED / symptom series
              GET /api/v1/query_exemplars?query=<bucket>    → metric↔trace exemplars (best-effort)
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
from pathlib import Path

import httpx
import yaml

# ── Config (overridable; defaults match the in-container compose network) ────
REPO = Path(os.environ.get("REPO_DIR", "/work"))
INCIDENTS_DIR = REPO / "docs" / "dataset" / "incidents"
EXPORTS_DIR = REPO / "docs" / "dataset" / "exports"

TEMPO_URL = os.environ.get("TEMPO_URL", "http://otel-lgtm:3200")
LOKI_URL = os.environ.get("LOKI_URL", "http://otel-lgtm:3100")
PROM_URL = os.environ.get("PROM_URL", "http://otel-lgtm:9090")

TOOL_VERSION = "trace-labeler/v0"
EXPORT_SCHEMA = "export-v0"
NAMESPACE = "shoeshop"

# A domain Event in this stack is a structured log record whose *body* is a
# dotted event name (e.g. payment.declined, notification.sent, orders.confirmed)
# with its attributes promoted to Loki stream labels (verified §9 + live). Plain
# logs have free-text bodies. This is the events-vs-logs discriminator.
EVENT_NAME_RE = re.compile(r"^[a-z][a-z0-9]*(?:\.[a-z0-9_]+)+$")

# Loki stream labels that are infra/resource plumbing, not event attributes.
BORING_LABELS = {
    "service_name", "service_namespace", "deployment_environment", "scope_name",
    "severity_text", "severity_number", "detected_level", "trace_id", "span_id",
    "flags", "telemetry_sdk_language", "telemetry_sdk_name", "telemetry_sdk_version",
}

# Query windowing. Logs/events are bound STRICTLY to the labeled window: the
# window *is* the incident, and a pad past it would dilute the signature (e.g.
# notification-down's defining "absence" of notification.sent — a generous pad
# catches the post-window recovery drain, which the NATS traceparent stamps with
# the same trace_id, falsely showing the fan-out as healthy). Trace search is
# also window-strict: Tempo returns newest-first, so a post-window pad biases the
# read-path service-sample toward traces whose logs then fall outside the strict
# log window (join misses). Metrics get a wide pad because they export on a 60s
# interval (README gotcha) — without it a short window holds zero points; it is
# recorded in query_window so the slice is transparent.
METRIC_PAD_S = 120
MAX_TRACES = 50

client = httpx.Client(timeout=60.0)


def log(msg: str) -> None:
    print(f"[trace-labeler] {msg}", flush=True)


# ── Time helpers ─────────────────────────────────────────────────────────────
def parse_ts(s: str) -> dt.datetime:
    """Tolerant RFC 3339 → aware UTC datetime."""
    t = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    return t.astimezone(dt.timezone.utc)


def unix_s(t: dt.datetime) -> int:
    return int(t.timestamp())


def unix_ns(t: dt.datetime) -> int:
    return int(t.timestamp() * 1_000_000_000)


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ── OTLP attribute flattening ─────────────────────────────────────────────────
def attr_val(v: dict):
    if "stringValue" in v:
        return v["stringValue"]
    if "intValue" in v:
        return int(v["intValue"])
    if "doubleValue" in v:
        return v["doubleValue"]
    if "boolValue" in v:
        return v["boolValue"]
    if "arrayValue" in v:
        return [attr_val(x) for x in v["arrayValue"].get("values", [])]
    if "kvlistValue" in v:
        return {kv["key"]: attr_val(kv["value"]) for kv in v["kvlistValue"].get("values", [])}
    return None


def attrs(lst) -> dict:
    return {a["key"]: attr_val(a.get("value", {})) for a in (lst or [])}


# ── Bundle query clients ──────────────────────────────────────────────────────
def _get(url: str, params: dict, headers: dict | None = None) -> dict:
    r = client.get(url, params=params, headers=headers)
    r.raise_for_status()
    return r.json()


def norm_trace_id(tid: str) -> str:
    """Tempo's search API drops leading zeros (e19975…, 31 hex); Loki stores the
    full zero-padded 32-hex id (0e19975…). Normalize so the trace↔log join (the
    Loki ``trace_id`` label) actually matches."""
    return tid.strip().lower().zfill(32)


def tempo_search(traceql: str, start: int, end: int, limit: int = 20) -> list[str]:
    d = _get(f"{TEMPO_URL}/api/search",
             {"q": traceql, "start": start, "end": end, "limit": limit},
             headers={"Accept": "application/json"})
    return [norm_trace_id(t["traceID"]) for t in d.get("traces", []) if t.get("traceID")]


def tempo_trace(trace_id: str) -> dict:
    return _get(f"{TEMPO_URL}/api/traces/{trace_id}", {}, headers={"Accept": "application/json"})


def normalize_trace(trace_id: str, raw: dict) -> dict:
    """OTLP batches JSON → a flat, training-friendly span list."""
    spans: list[dict] = []
    for batch in raw.get("batches", []):
        rattrs = attrs(batch.get("resource", {}).get("attributes"))
        svc = rattrs.get("service.name")
        scope_spans = batch.get("scopeSpans") or batch.get("instrumentationLibrarySpans") or []
        for ss in scope_spans:
            scope = (ss.get("scope") or {}).get("name")
            for sp in ss.get("spans", []):
                start = int(sp.get("startTimeUnixNano", 0))
                end = int(sp.get("endTimeUnixNano", 0))
                spans.append({
                    "span_id": sp.get("spanId"),
                    "parent_span_id": sp.get("parentSpanId") or None,
                    "service": svc,
                    "scope": scope,
                    "name": sp.get("name"),
                    "kind": sp.get("kind"),
                    "start_unix_nano": start,
                    "duration_ms": round((end - start) / 1e6, 3) if end >= start > 0 else None,
                    "status": (sp.get("status") or {}).get("code"),
                    "attributes": attrs(sp.get("attributes")),
                    "events": [{
                        "name": e.get("name"),
                        "time_unix_nano": int(e.get("timeUnixNano", 0)),
                        "attributes": attrs(e.get("attributes")),
                    } for e in sp.get("events", [])],
                })
    spans.sort(key=lambda s: s["start_unix_nano"])
    root = next((s for s in spans if not s["parent_span_id"]), spans[0] if spans else None)
    return {
        "trace_id": trace_id,
        "root_service": root["service"] if root else None,
        "root_name": root["name"] if root else None,
        "span_count": len(spans),
        "services": sorted({s["service"] for s in spans if s["service"]}),
        "spans": spans,
    }


def loki_query(logql: str, start_ns: int, end_ns: int, limit: int = 1000) -> list[dict]:
    d = _get(f"{LOKI_URL}/loki/api/v1/query_range",
             {"query": logql, "start": str(start_ns), "end": str(end_ns),
              "limit": limit, "direction": "forward"})
    out: list[dict] = []
    for stream in d.get("data", {}).get("result", []):
        labels = stream.get("stream", {})
        for ts, line in stream.get("values", []):
            out.append({
                "ts_unix_nano": int(ts),
                "service": labels.get("service_name"),
                "level": labels.get("severity_text") or labels.get("detected_level"),
                "trace_id": labels.get("trace_id"),
                "span_id": labels.get("span_id"),
                "body": line,
                "labels": labels,
            })
    return out


def dedupe_logs(logs: list[dict]) -> list[dict]:
    seen, out = set(), []
    for r in logs:
        key = (r["ts_unix_nano"], r["service"], r["span_id"], r["body"])
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    out.sort(key=lambda r: r["ts_unix_nano"])
    return out


def extract_events(logs: list[dict]) -> list[dict]:
    """Domain events = logs whose body is a dotted event name (payment.declined…)."""
    ev = []
    for r in logs:
        body = (r.get("body") or "").strip()
        if EVENT_NAME_RE.match(body):
            ev.append({
                "ts_unix_nano": r["ts_unix_nano"],
                "service": r["service"],
                "name": body,
                "trace_id": r["trace_id"],
                "span_id": r["span_id"],
                "attributes": {k: v for k, v in r["labels"].items() if k not in BORING_LABELS},
            })
    return ev


def prom_range(promql: str, start: int, end: int, step: int = 15) -> list[dict]:
    d = _get(f"{PROM_URL}/api/v1/query_range",
             {"query": promql, "start": start, "end": end, "step": step})
    return [{"labels": m.get("metric", {}),
             "samples": [[float(t), v] for t, v in m.get("values", [])]}
            for m in d.get("data", {}).get("result", [])]


def prom_exemplars(promql: str, start: int, end: int) -> list[dict]:
    try:
        d = _get(f"{PROM_URL}/api/v1/query_exemplars",
                 {"query": promql, "start": start, "end": end})
    except httpx.HTTPError as e:
        log(f"  exemplars query failed (non-fatal): {e}")
        return []
    out = []
    for s in d.get("data", []):
        for ex in s.get("exemplars", []):
            out.append({
                "series_labels": s.get("seriesLabels", {}),
                "labels": ex.get("labels", {}),
                "value": ex.get("value"),
                "timestamp": ex.get("timestamp"),
            })
    return out


# ── Per-incident extraction ───────────────────────────────────────────────────
def export_incident(rec: dict) -> dict:
    iid = rec["incident_id"]
    log(f"{iid}: extracting MELT slice…")
    tw = rec["time_window"]
    start_t, end_t = parse_ts(tw["start"]), parse_ts(tw["end"])
    t0, t1 = unix_s(start_t), unix_s(end_t)                              # trace search: STRICT window (s)
    m0, m1 = t0 - METRIC_PAD_S, t1 + METRIC_PAD_S                        # metrics: padded (s)
    ln0, ln1 = unix_ns(start_t), unix_ns(end_t)                          # logs/events: STRICT window (ns)

    corr = rec.get("correlation", {}) or {}
    order_ids = corr.get("order_ids") or []
    trace_ids: set[str] = set(corr.get("trace_ids") or [])
    affected = rec.get("affected_services") or []
    query_log: list[dict] = []

    # 1) Resolve trace ids: order.id → Tempo (write-path), else sample by service.
    for oid in order_ids:
        q = f'{{ span.order.id = "{oid}" }}'
        try:
            found = tempo_search(q, t0, t1, limit=20)
            trace_ids.update(found)
            query_log.append({"signal": "traces", "api": "tempo/search", "query": q, "result_count": len(found)})
        except httpx.HTTPError as e:
            log(f"  tempo search order.id={oid} failed: {e}")
    if not trace_ids:
        # Read-path incidents (load / DB-throttle) have no order anchor. Seed
        # from the record's curated trace-symptom selectors first — those target
        # the *incident-relevant* slow traces (e.g. `{ catalogue && duration >
        # 200ms }`), which are far better training evidence than arbitrary
        # newest traces — then top up by service so a sample always exists.
        for sym in rec.get("expected_symptoms", []) or []:
            if sym.get("signal") == "traces" and sym.get("where"):
                q = sym["where"]
                try:
                    found = tempo_search(q, t0, t1, limit=20)
                    trace_ids.update(found)
                    query_log.append({"signal": "traces", "api": "tempo/search", "query": q, "result_count": len(found)})
                except httpx.HTTPError as e:
                    log(f"  tempo symptom-trace search failed: {e}")
        for svc in affected:
            if len(trace_ids) >= MAX_TRACES:
                break
            q = f'{{ resource.service.name = "{svc}" }}'
            try:
                found = tempo_search(q, t0, t1, limit=10)
                trace_ids.update(found)
                query_log.append({"signal": "traces", "api": "tempo/search", "query": q, "result_count": len(found)})
            except httpx.HTTPError as e:
                log(f"  tempo search service={svc} failed: {e}")
    resolved = sorted(trace_ids)[:MAX_TRACES]
    log(f"  traces: {len(resolved)} resolved (order_ids={len(order_ids)})")

    # 2) Fetch full traces.
    traces = []
    for tid in resolved:
        try:
            traces.append(normalize_trace(tid, tempo_trace(tid)))
        except httpx.HTTPError as e:
            log(f"  tempo trace {tid} fetch failed: {e}")

    # 3) Logs: the exact in-trace set (trace_id is a Loki label) + per-service blast radius.
    logs: list[dict] = []
    if resolved:
        sel = "|".join(resolved)
        q = f'{{service_namespace="{NAMESPACE}", trace_id=~"{sel}"}}'
        try:
            rows = loki_query(q, ln0, ln1, limit=3000)
            logs += rows
            query_log.append({"signal": "logs", "api": "loki/query_range", "query": q, "result_count": len(rows)})
        except httpx.HTTPError as e:
            log(f"  loki in-trace query failed: {e}")
    for svc in affected:
        q = f'{{service_name="{svc}"}}'
        try:
            rows = loki_query(q, ln0, ln1, limit=500)
            logs += rows
            query_log.append({"signal": "logs", "api": "loki/query_range", "query": q, "result_count": len(rows)})
        except httpx.HTTPError as e:
            log(f"  loki service={svc} query failed: {e}")
    logs = dedupe_logs(logs)
    events = extract_events(logs)
    log(f"  logs: {len(logs)}  events: {len(events)}")

    # 4) Metrics: the exemplar histogram (count + 5m rate) + exemplars (metric↔trace join).
    exemplar_metric = corr.get("exemplar_metric")
    metric_series = []
    exemplars = []
    if exemplar_metric:
        for name, q in (
            ("count_total", f"{exemplar_metric}_count"),
            ("rate_5m", f"sum by (service_name) (rate({exemplar_metric}_count[5m]))"),
        ):
            try:
                res = prom_range(q, m0, m1)[:25]
                metric_series.append({"name": name, "query": q, "result": res})
                query_log.append({"signal": "metrics", "api": "prom/query_range", "query": q, "result_count": len(res)})
            except httpx.HTTPError as e:
                log(f"  prom {name} failed: {e}")
        exemplars = prom_exemplars(f"{exemplar_metric}_bucket", m0, m1)
        query_log.append({"signal": "metrics", "api": "prom/query_exemplars",
                          "query": f"{exemplar_metric}_bucket", "result_count": len(exemplars)})
    log(f"  metrics: {len(metric_series)} series, {len(exemplars)} exemplars")

    # 5) Evidence — execute the record's authored symptom pointers verbatim.
    symptoms = []
    event_names_seen = {e["name"] for e in events}
    for sym in rec.get("expected_symptoms", []) or []:
        sig, where = sym.get("signal"), sym.get("where", "")
        base = {"signal": sig, "service": sym.get("service"),
                "description": sym.get("description"), "where": where}
        try:
            if sig == "metrics":
                res = prom_range(where, m0, m1)
                symptoms.append({**base, "executed": True, "result_count": len(res), "sample": res[:1]})
                query_log.append({"signal": "metrics", "api": "prom/query_range", "query": where, "result_count": len(res)})
            elif sig == "logs":
                rows = loki_query(where, ln0, ln1, limit=200)
                symptoms.append({**base, "executed": True, "result_count": len(rows),
                                 "sample": [r["body"] for r in rows[:3]]})
                query_log.append({"signal": "logs", "api": "loki/query_range", "query": where, "result_count": len(rows)})
            elif sig == "traces":
                tids = tempo_search(where, t0, t1, limit=50)
                symptoms.append({**base, "executed": True, "result_count": len(tids), "sample": tids[:3]})
                query_log.append({"signal": "traces", "api": "tempo/search", "query": where, "result_count": len(tids)})
            elif sig == "events":
                # event.name = "X" is not a standalone query; resolve from extracted events.
                m = re.search(r'event\.name\s*=\s*"([^"]+)"', where)
                want = m.group(1) if m else None
                cnt = sum(1 for e in events if e["name"] == want) if want else 0
                symptoms.append({**base, "executed": False, "resolved_from": "signals.events",
                                 "event_name": want, "result_count": cnt,
                                 "present": want in event_names_seen})
            else:
                symptoms.append({**base, "executed": False, "note": "unknown signal"})
        except httpx.HTTPError as e:
            symptoms.append({**base, "executed": False, "error": str(e)[:200]})

    example = {
        "export_schema": EXPORT_SCHEMA,
        "incident_id": iid,
        "scenario_id": rec.get("scenario_id"),
        "title": rec.get("title"),
        "label": {
            "root_cause": rec.get("root_cause"),
            "remediation": rec.get("remediation"),
            "severity": rec.get("severity"),
            "fault": rec.get("fault"),
            "affected_services": affected,
            "signals_touched": rec.get("signals_touched"),
        },
        "time_window": tw,
        "query_window": {
            "logs_events": {"start_unix": ln0 // 1_000_000_000, "end_unix": ln1 // 1_000_000_000, "strict": True},
            "traces": {"start_unix": t0, "end_unix": t1, "strict": True},
            "metrics": {"start_unix": m0, "end_unix": m1, "pad_s": METRIC_PAD_S},
        },
        "correlation": {
            "resource_selector": corr.get("resource_selector"),
            "exemplar_metric": exemplar_metric,
            "order_ids": order_ids,
            "trace_ids": resolved,  # backfilled from order.id where the record had none
        },
        "signals": {
            "traces": traces,
            "logs": logs,
            "events": events,
            "metrics": {"exemplar_metric": exemplar_metric, "series": metric_series, "exemplars": exemplars},
        },
        "evidence": {"symptoms": symptoms},
        "extraction": {
            "tool_version": TOOL_VERSION,
            "extracted_at": now_iso(),
            "bundle": {"tempo": TEMPO_URL, "loki": LOKI_URL, "prometheus": PROM_URL},
            "counts": {
                "traces": len(traces),
                "spans": sum(t["span_count"] for t in traces),
                "logs": len(logs),
                "events": len(events),
                "metric_series": sum(len(s["result"]) for s in metric_series),
                "exemplars": len(exemplars),
            },
            "queries": query_log,
        },
    }
    return example


# ── Dataset assembly ───────────────────────────────────────────────────────────
def load_records(only: str | None) -> list[dict]:
    recs = []
    for f in sorted(INCIDENTS_DIR.glob("incident-*.yaml")):
        rec = yaml.safe_load(f.read_text(encoding="utf-8"))
        if not rec or "incident_id" not in rec:
            continue
        if only and rec["incident_id"] != only and f.stem != only:
            continue
        recs.append(rec)
    return recs


def write_dataset(examples: list[dict]) -> tuple[Path, Path]:
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    examples.sort(key=lambda e: e["incident_id"])
    dataset_path = EXPORTS_DIR / "dataset.jsonl"
    manifest_path = EXPORTS_DIR / "manifest.json"

    lines, index = [], []
    totals = {"traces": 0, "spans": 0, "logs": 0, "events": 0, "metric_series": 0, "exemplars": 0}
    for i, ex in enumerate(examples, start=1):
        line = json.dumps(ex, ensure_ascii=False, sort_keys=True)
        lines.append(line)
        c = ex["extraction"]["counts"]
        for k in totals:
            totals[k] += c.get(k, 0)
        index.append({
            "incident_id": ex["incident_id"],
            "scenario_id": ex.get("scenario_id"),
            "line": i,
            "time_window": ex["time_window"],
            "counts": c,
            "extracted_at": ex["extraction"]["extracted_at"],
            "sha256": hashlib.sha256(line.encode("utf-8")).hexdigest(),
        })
    dataset_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    manifest = {
        "export_schema": EXPORT_SCHEMA,
        "tool_version": TOOL_VERSION,
        "generated_at": now_iso(),
        "bundle": {"tempo": TEMPO_URL, "loki": LOKI_URL, "prometheus": PROM_URL},
        "dataset_file": "dataset.jsonl",
        "incidents": index,
        "totals": {"incidents": len(examples), **totals},
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return dataset_path, manifest_path


def main() -> int:
    ap = argparse.ArgumentParser(description="Export labeled incidents → trainable MELT dataset (JSONL).")
    ap.add_argument("incident", nargs="?", help="Export only this incident id (e.g. incident-0002). Default: all.")
    args = ap.parse_args()

    recs = load_records(args.incident)
    if not recs:
        log(f"no incident records found in {INCIDENTS_DIR}" + (f" matching {args.incident}" if args.incident else ""))
        return 1
    log(f"exporting {len(recs)} incident(s) from {INCIDENTS_DIR}")

    examples = []
    for rec in recs:
        try:
            examples.append(export_incident(rec))
        except Exception as e:  # one bad record must not sink the run
            log(f"  {rec.get('incident_id')} FAILED: {e}")

    if not examples:
        log("no examples produced")
        return 1

    dataset_path, manifest_path = write_dataset(examples)
    log(f"wrote {dataset_path.relative_to(REPO)} ({len(examples)} examples)")
    log(f"wrote {manifest_path.relative_to(REPO)}")
    for ex in examples:
        c = ex["extraction"]["counts"]
        log(f"  {ex['incident_id']}: traces={c['traces']} spans={c['spans']} "
            f"logs={c['logs']} events={c['events']} metric_series={c['metric_series']} exemplars={c['exemplars']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
