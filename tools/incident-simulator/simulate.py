#!/usr/bin/env python3
"""Shoe Shop incident simulator (v0).

Runs ONE labeled, reproducible reliability scenario end-to-end:

    manifest  ->  inject  ->  load  ->  recover  ->  schema-v0 label record

A scenario manifest (scenarios/<name>.yaml) declares the fault to inject, the
load to drive, and the *static* parts of the label (root cause, expected
symptoms, remediation). This script captures the *runtime* parts — the real
time window the fault was active and the orders / request stats it produced —
and writes a well-formed incident record to docs/dataset/incidents/ per
docs/dataset/incident-schema.md. It also drops a Grafana region annotation over
the window so the incident is visible on the dashboards.

Runtime — Python-in-container (see Dockerfile): runs with the host Docker socket
and the repo mounted at /work, so it drives the real Compose stack the way a
human would, plus the real storefront path through the BFF. The four injection
methods map onto Compose-native primitives:

    env-knob        set a service env var + --force-recreate the one container
                    (knobs read at startup, e.g. Payment's decision config)
    compose-stop    `docker compose stop` a service (service-down / silent fail)
    resource-limit  `docker update --cpus` a container LIVE (no recreate, so no
                    connection-drop confound) to starve it
    load            no inject — the load itself is the fault (traffic spike)
"""

from __future__ import annotations

import argparse
import concurrent.futures as futures
import datetime as dt
import os
import subprocess
import sys
import time
from pathlib import Path

import httpx
import yaml

# ── Environment (overridable; defaults match the in-container mounts) ────────
REPO = Path(os.environ.get("REPO_DIR", "/work"))
COMPOSE_DIR = REPO / "deploy" / "compose"
INCIDENTS_DIR = REPO / "docs" / "dataset" / "incidents"
SCENARIOS_DIR = Path(__file__).resolve().parent / "scenarios"
GEN_OVERRIDE = COMPOSE_DIR / "compose.incident.gen.yaml"

BFF_URL = os.environ.get("BFF_URL", "http://bff:8080")
GRAFANA_URL = os.environ.get("GRAFANA_URL", "http://otel-lgtm:3000")
GRAFANA_AUTH = tuple(os.environ.get("GRAFANA_AUTH", "admin:admin").split(":", 1))
# Seeded demo shopper (services/users/app/seed.sql — ada@shoeshop.test).
USER_ID = os.environ.get("SHOPPER_ID", "11111111-1111-1111-1111-111111111111")

# The checkout overlay's compose layering (matches `task up:checkout`).
COMPOSE_FILES = [
    COMPOSE_DIR / "compose.yaml",
    COMPOSE_DIR / "compose.core.yaml",
    COMPOSE_DIR / "compose.checkout.yaml",
]
SEARCH_TERMS = ["court", "runner", "trail", "classic", "leather", "knit", "sole"]


def log(msg: str) -> None:
    print(f"[incident-simulator] {msg}", flush=True)


def now_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def rfc3339(t: dt.datetime) -> str:
    return t.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def epoch_ms(t: dt.datetime) -> int:
    return int(t.timestamp() * 1000)


def container_of(service: str) -> str:
    """Compose service name -> container name (all use the shoeshop-<svc> form)."""
    return f"shoeshop-{service}"


# ── Compose / docker plumbing ────────────────────────────────────────────────
def compose_cmd(extra_files: list[Path] | None = None) -> list[str]:
    """Build the `docker compose` prefix matching the running checkout stack.

    The top-level `name: shoe-shop` in compose.yaml pins the project name, so
    these commands target the already-running containers regardless of cwd.
    """
    cmd = ["docker", "compose"]
    env_file = COMPOSE_DIR / ".env"
    if env_file.exists():
        cmd += ["--env-file", str(env_file)]
    for f in COMPOSE_FILES + (extra_files or []):
        cmd += ["-f", str(f)]
    return cmd


def run(cmd: list[str]) -> None:
    log(f"$ {' '.join(cmd)}")
    subprocess.run(cmd, cwd=str(REPO), check=True)


def recreate(service: str, extra_files: list[Path] | None = None) -> None:
    """Force-recreate a single container so env/config changes take effect.

    --no-build / --no-deps keep this surgical: we never rebuild images or touch
    other services, just swap the one container for a fresh one.
    """
    run(compose_cmd(extra_files) + ["up", "-d", "--no-build", "--no-deps", "--force-recreate", service])


# ── Fault injection / recovery (dispatch on injection_method) ────────────────
def inject(fault: dict) -> None:
    method = fault["injection_method"]
    target = fault["target_service"]
    params = fault.get("parameters", {}) or {}

    if method == "env-knob":
        # Ephemeral Compose override carrying the knob(s); recreate so the target
        # re-reads its env at startup. We also shorten the OTLP metric export
        # interval for the duration: the default periodic reader flushes every
        # 60s, but an incident window is often shorter, so without this the
        # target's metric signal would never leave the (soon-recreated) process.
        env = {"OTEL_METRIC_EXPORT_INTERVAL": "10000"}
        env.update({k: str(v) for k, v in params.items()})
        override = {"services": {target: {"environment": env}}}
        GEN_OVERRIDE.write_text(yaml.safe_dump(override, sort_keys=False))
        log(f"inject env-knob on '{target}': {params}")
        recreate(target, extra_files=[GEN_OVERRIDE])

    elif method == "compose-stop":
        # Service-down. The container is stopped, not removed, so recovery can
        # `start` the same one and (for a durable NATS consumer) drain the backlog.
        log(f"inject compose-stop on '{target}'")
        run(compose_cmd() + ["stop", target])

    elif method == "resource-limit":
        # CPU starvation via an ephemeral override + recreate (same plumbing as
        # env-knob). We use the LEGACY top-level `cpus:` — not the deploy.resources
        # form — because the base services set legacy `mem_limit`, and compose
        # refuses to mix `mem_limit` with `deploy.resources.limits` on one service.
        # `docker update --cpus` was rejected too (it sets NanoCpus, which cannot
        # be cleared again — `--cpus 0` is ignored); recreating WITHOUT the
        # override restores NanoCpus=0 by construction. Mirrors a Kubernetes
        # `kubectl set resources` recreate of a CPU-capped pod.
        cpus = float(params.get("cpus", "0.1"))
        override = {"services": {target: {"cpus": cpus}}}
        GEN_OVERRIDE.write_text(yaml.safe_dump(override, sort_keys=False))
        log(f"inject resource-limit on '{target}': cpus={cpus} (recreate)")
        recreate(target, extra_files=[GEN_OVERRIDE])

    elif method == "load":
        # The load itself is the fault (traffic spike) — nothing to inject.
        log(f"inject load: no container change (the load drives the incident)")

    else:
        raise NotImplementedError(f"unknown injection_method '{method}'")


def recover(fault: dict) -> None:
    method = fault["injection_method"]
    target = fault["target_service"]

    if method == "env-knob":
        if GEN_OVERRIDE.exists():
            GEN_OVERRIDE.unlink()
        log(f"recover '{target}': dropping override, recreating with defaults")
        recreate(target)
    elif method == "compose-stop":
        log(f"recover '{target}': starting service (durable consumer drains backlog)")
        run(compose_cmd() + ["start", target])
    elif method == "resource-limit":
        if GEN_OVERRIDE.exists():
            GEN_OVERRIDE.unlink()
        log(f"recover '{target}': dropping CPU cap, recreating with defaults")
        recreate(target)
    elif method == "load":
        log("recover: nothing to undo")


# ── Health + load flows ──────────────────────────────────────────────────────
def wait_healthy(url: str, timeout_s: int = 90) -> bool:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            if httpx.get(url, timeout=3).status_code == 200:
                return True
        except httpx.HTTPError:
            pass
        time.sleep(2)
    return False


def wait_container_healthy(container: str, timeout_s: int = 90) -> bool:
    """Wait on Docker's healthcheck — for non-HTTP targets (e.g. postgres) after
    a throttled recreate, where there is no /healthz to poll."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            out = subprocess.run(
                ["docker", "inspect", "--format", "{{.State.Health.Status}}", container],
                cwd=str(REPO), capture_output=True, text=True, check=True,
            ).stdout.strip()
            if out == "healthy":
                return True
        except subprocess.CalledProcessError:
            pass
        time.sleep(3)
    return False


def place_order(client: httpx.Client) -> dict | None:
    """One storefront checkout: clear cart -> add a real product -> checkout."""
    client.delete(f"{BFF_URL}/api/cart/{USER_ID}")
    products = client.get(f"{BFF_URL}/api/products", params={"pageSize": 10}).json()
    items = products.get("products") or []
    if not items:
        log("no products returned from catalogue; cannot place order")
        return None
    product_id = items[0]["id"]
    client.post(f"{BFF_URL}/api/cart/{USER_ID}/items", json={"productId": product_id, "quantity": 1})
    resp = client.post(f"{BFF_URL}/api/checkout/{USER_ID}")
    if resp.status_code != 201:
        log(f"checkout failed: {resp.status_code} {resp.text[:160]}")
        return None
    order = resp.json().get("order", {})
    return {"id": order.get("id"), "status": order.get("status")}


def browse_once(client: httpx.Client, i: int) -> httpx.Response:
    return client.get(f"{BFF_URL}/api/products", params={"page": (i % 3) + 1, "pageSize": 20})


def search_once(client: httpx.Client, i: int) -> httpx.Response:
    return client.get(f"{BFF_URL}/api/search", params={"q": SEARCH_TERMS[i % len(SEARCH_TERMS)]})


def drive_sequential(count: int, pause_s: float = 1.0) -> list[dict]:
    """Sequential checkout flow — one order at a time (payment scenarios)."""
    orders: list[dict] = []
    with httpx.Client(timeout=15) as client:
        for i in range(count):
            order = place_order(client)
            if order:
                log(f"order {i + 1}/{count}: {order['id']} ({order['status']})")
                orders.append(order)
            time.sleep(pause_s)
    return orders


def drive_concurrent(flow: str, workers: int, duration_s: int) -> dict:
    """Read-only concurrent load for a fixed duration (saturation / DB throttle).

    Read flows only (browse/search): they are safe under high concurrency,
    whereas the per-user cart makes concurrent checkout race on one shopper.
    """
    deadline = time.monotonic() + duration_s

    def worker() -> tuple[int, int, list[float]]:
        ok = err = 0
        lat: list[float] = []
        i = 0
        with httpx.Client(timeout=20) as client:
            while time.monotonic() < deadline:
                t0 = time.monotonic()
                try:
                    if flow == "search":
                        r = search_once(client, i)
                    elif flow == "mixed":
                        r = browse_once(client, i) if i % 2 == 0 else search_once(client, i)
                    else:
                        r = browse_once(client, i)
                    lat.append((time.monotonic() - t0) * 1000)
                    ok += 1 if r.status_code < 500 else 0
                    err += 1 if r.status_code >= 500 else 0
                except httpx.HTTPError:
                    err += 1
                i += 1
        return ok, err, lat

    log(f"driving concurrent '{flow}' load: {workers} workers x {duration_s}s")
    ok = err = 0
    lat: list[float] = []
    with futures.ThreadPoolExecutor(max_workers=workers) as pool:
        for w_ok, w_err, w_lat in [f.result() for f in [pool.submit(worker) for _ in range(workers)]]:
            ok += w_ok
            err += w_err
            lat += w_lat

    lat.sort()
    def pct(p: float) -> float:
        return round(lat[min(len(lat) - 1, int(p * len(lat)))], 1) if lat else 0.0
    stats = {
        "requests": ok + err, "ok": ok, "errors": err,
        "p50_ms": pct(0.50), "p95_ms": pct(0.95), "p99_ms": pct(0.99),
        "rps": round((ok + err) / duration_s, 1),
    }
    log(f"load done: {stats}")
    return stats


# ── Label record + annotation ────────────────────────────────────────────────
def next_incident_id() -> str:
    """Monotonic id across both the design fixtures (examples/) and captures."""
    max_n = 0
    for d in (INCIDENTS_DIR, REPO / "docs" / "dataset" / "examples"):
        if not d.exists():
            continue
        for f in d.glob("incident-*.yaml"):
            digits = f.stem.split("-")[1]
            if digits.isdigit():
                max_n = max(max_n, int(digits))
    return f"incident-{max_n + 1:04d}"


def post_annotation(incident_id: str, scenario: dict, window: tuple[dt.datetime, dt.datetime]) -> None:
    """Best-effort Grafana region annotation so the window is visible on dashboards."""
    body = {
        "text": f"{incident_id}: {scenario['title']}",
        "tags": ["incident-simulator", scenario["scenario_id"], incident_id],
        "time": epoch_ms(window[0]),
        "timeEnd": epoch_ms(window[1]),
    }
    try:
        r = httpx.post(f"{GRAFANA_URL}/api/annotations", json=body, auth=GRAFANA_AUTH, timeout=8)
        if r.status_code < 300:
            log(f"grafana annotation posted (id={r.json().get('id')}) tags={body['tags']}")
        else:
            log(f"grafana annotation failed: {r.status_code} {r.text[:120]}")
    except httpx.HTTPError as e:
        log(f"grafana annotation error (non-fatal): {e}")


def write_record(scenario: dict, fault: dict, window: tuple[dt.datetime, dt.datetime],
                 incident_id: str, orders: list[dict], load_stats: dict | None) -> Path:
    label = scenario["label"]
    correlation = dict(label["correlation"])
    # Order ids anchor write-path incidents (every order span carries `order.id`),
    # capped so a high-volume run does not bloat the record.
    order_ids = [o["id"] for o in orders if o.get("id")]
    if order_ids:
        correlation["order_ids"] = order_ids[:20]
    correlation.setdefault("trace_ids", [])

    note = f"Captured run of scenario '{scenario['scenario_id']}'. "
    if orders:
        note += f"{len(orders)} order(s) placed against seeded shopper {USER_ID}. "
    if load_stats:
        note += (f"Load: {load_stats['requests']} reqs, {load_stats['errors']} errs, "
                 f"p95={load_stats['p95_ms']}ms p99={load_stats['p99_ms']}ms "
                 f"@ {load_stats['rps']} rps. ")
    note += "trace_ids backfillable from Tempo by order.id / time window."

    record = {
        "schema_version": "v0",
        "incident_id": incident_id,
        "title": scenario["title"],
        "scenario_id": scenario["scenario_id"],
        "severity": scenario.get("severity"),
        "time_window": {"start": rfc3339(window[0]), "end": rfc3339(window[1])},
        "fault": {
            "type": fault["type"],
            "target_service": fault["target_service"],
            "injection_method": fault["injection_method"],
            "parameters": fault.get("parameters", {}),
        },
        "root_cause": label["root_cause"],
        "affected_services": label["affected_services"],
        "signals_touched": {"metrics": True, "events": True, "logs": True, "traces": True},
        "expected_symptoms": label["expected_symptoms"],
        "correlation": correlation,
        "remediation": label["remediation"],
        "labeler": "incident-simulator/v0",
        "notes": note,
    }

    INCIDENTS_DIR.mkdir(parents=True, exist_ok=True)
    out = INCIDENTS_DIR / f"{incident_id}-{scenario['scenario_id']}.yaml"
    header = (
        "# Captured incident label record (schema v0) — produced by\n"
        "# tools/incident-simulator. Real time_window from a live run against the\n"
        "# checkout stack; the static label fields come from the scenario manifest\n"
        f"# scenarios/{scenario['scenario_id']}.yaml.\n\n"
    )
    out.write_text(header + yaml.safe_dump(record, sort_keys=False, width=88))
    return out


# ── Orchestration ────────────────────────────────────────────────────────────
def run_scenario(scenario_name: str) -> int:
    path = SCENARIOS_DIR / f"{scenario_name}.yaml"
    if not path.exists():
        log(f"no such scenario: {path}")
        log(f"available: {', '.join(sorted(p.stem for p in SCENARIOS_DIR.glob('*.yaml')))}")
        return 2
    scenario = yaml.safe_load(path.read_text())
    fault = dict(scenario["fault"])
    fault["target_service"] = scenario["target_service"]
    load_cfg = scenario.get("load", {})
    mode = load_cfg.get("mode", "sequential")

    log(f"=== scenario '{scenario_name}' — {scenario['title']} ===")

    # The incident window opens at injection and closes at recovery: the fault is
    # active for exactly this span, and that is what the label slices telemetry to.
    window_start = now_utc()
    inject(fault)

    if fault["injection_method"] == "env-knob":
        wait_healthy(f"http://{fault['target_service']}:8080/healthz")
    elif fault["injection_method"] == "resource-limit":
        wait_container_healthy(container_of(fault["target_service"]))
    if not wait_healthy(f"{BFF_URL}/healthz", timeout_s=30):
        log("WARNING: BFF not healthy; load may fail")

    orders: list[dict] = []
    load_stats: dict | None = None
    if mode == "concurrent":
        load_stats = drive_concurrent(
            load_cfg.get("flow", "browse"),
            int(load_cfg.get("workers", 8)),
            int(load_cfg.get("duration_s", 80)),
        )
        log("settling 10s so traces/metrics flush")
        time.sleep(10)
    else:
        orders = drive_sequential(int(load_cfg.get("orders", 5)))
        settle = int(load_cfg.get("settle_s", 30))
        log(f"settling {settle}s so the async saga completes and telemetry flushes")
        time.sleep(settle)

    window_end = now_utc()
    recover(fault)

    incident_id = next_incident_id()
    out = write_record(scenario, fault, (window_start, window_end), incident_id, orders, load_stats)
    post_annotation(incident_id, scenario, (window_start, window_end))
    log(f"wrote label record: {out.relative_to(REPO)}")
    log(f"time_window: {rfc3339(window_start)} .. {rfc3339(window_end)}")
    log("=== done ===")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Run a Shoe Shop incident scenario.")
    ap.add_argument("scenario", help="scenario name (file stem under scenarios/)")
    args = ap.parse_args()
    try:
        return run_scenario(args.scenario)
    except subprocess.CalledProcessError as e:
        log(f"command failed (exit {e.returncode})")
        return 1


if __name__ == "__main__":
    sys.exit(main())
