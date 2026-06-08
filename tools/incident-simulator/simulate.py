#!/usr/bin/env python3
"""Shoe Shop incident simulator (v0).

Runs ONE labeled, reproducible reliability scenario end-to-end:

    manifest  ->  inject  ->  load  ->  recover  ->  schema-v0 label record

A scenario manifest (scenarios/<name>.yaml) declares the fault to inject, the
load to drive, and the *static* parts of the label (root cause, expected
symptoms, remediation). This script captures the *runtime* parts — the real
time window the fault was active and the order ids it produced — and writes a
well-formed incident record to docs/dataset/incidents/ per
docs/dataset/incident-schema.md. The LGTM bundle is ephemeral, so the record
is what makes the telemetry inside that window trainable later (project 2).

Design notes
------------
* Runs *in a container* (see Dockerfile) with the host Docker socket and the
  repo mounted at /work, so it drives the real Compose stack the same way a
  human would (`docker compose ... up -d --force-recreate payment`) — no
  bespoke control plane. This is the "Python-in-container" runtime decision.
* Injection is Compose-native. For `env-knob` faults we write an ephemeral
  override file (compose.incident.gen.yaml) carrying the knob, recreate just
  the target container, and on recovery drop the override and recreate it back
  to defaults. Payment reads its knobs once at startup (decision::Config::
  from_env), so a recreate — not a plain restart — is what actually applies
  them.
* Load is the real storefront path through the BFF: clear cart -> add item ->
  checkout, against the seeded demo shopper. That exercises the whole saga
  (orders -> inventory -> payment over NATS) so the injected fault actually
  manifests across all four MELT signals.
"""

from __future__ import annotations

import argparse
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
# Seeded demo shopper (services/users/app/seed.sql — ada@shoeshop.test).
USER_ID = os.environ.get("SHOPPER_ID", "11111111-1111-1111-1111-111111111111")

# The checkout overlay's compose layering (matches `task up:checkout`).
COMPOSE_FILES = [
    COMPOSE_DIR / "compose.yaml",
    COMPOSE_DIR / "compose.core.yaml",
    COMPOSE_DIR / "compose.checkout.yaml",
]


def log(msg: str) -> None:
    print(f"[incident-simulator] {msg}", flush=True)


def now_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def rfc3339(t: dt.datetime) -> str:
    return t.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ── Compose plumbing ─────────────────────────────────────────────────────────
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


def recreate(service: str, extra_files: list[Path] | None = None) -> None:
    """Force-recreate a single container so env/config changes take effect.

    --no-build / --no-deps keep this surgical: we never rebuild images or touch
    other services, just swap the one container for a fresh one.
    """
    cmd = compose_cmd(extra_files) + [
        "up", "-d", "--no-build", "--no-deps", "--force-recreate", service
    ]
    log(f"$ {' '.join(cmd)}")
    subprocess.run(cmd, cwd=str(REPO), check=True)


# ── Fault injection / recovery ───────────────────────────────────────────────
def inject(fault: dict) -> None:
    method = fault["injection_method"]
    target = fault["target_service"]
    params = fault.get("parameters", {}) or {}

    if method == "env-knob":
        # Write an ephemeral Compose override carrying the knob(s), then recreate
        # the target so it re-reads its env at startup. We also shorten the
        # target's OTLP metric export interval for the duration of the fault: the
        # default periodic reader flushes every 60s, but an incident window is
        # often shorter than that, so without this the metric signal would never
        # leave the (soon-recreated) process. Scenario params win if they set it.
        env = {"OTEL_METRIC_EXPORT_INTERVAL": "10000"}
        env.update({k: str(v) for k, v in params.items()})
        override = {"services": {target: {"environment": env}}}
        GEN_OVERRIDE.write_text(yaml.safe_dump(override, sort_keys=False))
        log(f"inject env-knob on '{target}': {params}")
        recreate(target, extra_files=[GEN_OVERRIDE])
    else:
        # compose-stop / resource-limit / load are designed (see incident-schema
        # injection_method enum) but only env-knob is wired in v0.
        raise NotImplementedError(
            f"injection_method '{method}' is not implemented in v0 (only 'env-knob')"
        )


def recover(fault: dict) -> None:
    method = fault["injection_method"]
    target = fault["target_service"]
    if method == "env-knob":
        if GEN_OVERRIDE.exists():
            GEN_OVERRIDE.unlink()
        log(f"recover '{target}': dropping override, recreating with defaults")
        recreate(target)  # no override -> back to the committed (default) env


# ── Health + load ────────────────────────────────────────────────────────────
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


def drive_load(count: int, pause_s: float = 1.0) -> list[dict]:
    orders: list[dict] = []
    with httpx.Client(timeout=15) as client:
        for i in range(count):
            order = place_order(client)
            if order:
                log(f"order {i + 1}/{count}: {order['id']} ({order['status']})")
                orders.append(order)
            time.sleep(pause_s)
    return orders


# ── Label record ─────────────────────────────────────────────────────────────
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


def write_record(scenario: dict, fault: dict, window: tuple[dt.datetime, dt.datetime],
                 orders: list[dict]) -> Path:
    incident_id = next_incident_id()
    label = scenario["label"]
    correlation = dict(label["correlation"])
    # Order ids are the runtime anchor: every order span carries `order.id`, so a
    # labeled window resolves to its traces in Tempo even before trace_ids are
    # backfilled. (See correlation-contract.md.)
    correlation["order_ids"] = [o["id"] for o in orders if o.get("id")]
    correlation.setdefault("trace_ids", [])

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
        "notes": (
            f"Captured run of scenario '{scenario['scenario_id']}'. "
            f"{len(orders)} order(s) placed against the seeded shopper {USER_ID}. "
            "trace_ids backfillable from Tempo by order.id span attribute."
        ),
    }

    INCIDENTS_DIR.mkdir(parents=True, exist_ok=True)
    out = INCIDENTS_DIR / f"{incident_id}-{scenario['scenario_id']}.yaml"
    header = (
        "# Captured incident label record (schema v0) — produced by\n"
        "# tools/incident-simulator. Real time_window + order ids from a live run\n"
        "# against the checkout stack; the static label fields come from the\n"
        f"# scenario manifest scenarios/{scenario['scenario_id']}.yaml.\n\n"
    )
    out.write_text(header + yaml.safe_dump(record, sort_keys=False, width=88))
    return out


# ── Orchestration ────────────────────────────────────────────────────────────
def run(scenario_name: str) -> int:
    path = SCENARIOS_DIR / f"{scenario_name}.yaml"
    if not path.exists():
        log(f"no such scenario: {path}")
        log(f"available: {', '.join(sorted(p.stem for p in SCENARIOS_DIR.glob('*.yaml')))}")
        return 2
    scenario = yaml.safe_load(path.read_text())
    fault = dict(scenario["fault"])
    fault["target_service"] = scenario["target_service"]
    load_cfg = scenario.get("load", {})
    orders_n = int(load_cfg.get("orders", 5))
    settle_s = int(load_cfg.get("settle_s", 20))

    log(f"=== scenario '{scenario_name}' — {scenario['title']} ===")

    # The incident window opens at injection and closes at recovery: the fault is
    # active for exactly this span, and that is what the label slices telemetry to.
    window_start = now_utc()
    inject(fault)

    target = fault["target_service"]
    if not wait_healthy(f"http://{target}:8080/healthz"):
        log(f"WARNING: {target} did not report healthy after recreate; continuing anyway")

    if not wait_healthy(f"{BFF_URL}/healthz", timeout_s=30):
        log("WARNING: BFF not healthy; load may fail")

    log(f"driving load: {orders_n} checkout(s)")
    orders = drive_load(orders_n)

    log(f"settling {settle_s}s so the async saga completes and telemetry flushes")
    time.sleep(settle_s)
    window_end = now_utc()

    recover(fault)

    out = write_record(scenario, fault, (window_start, window_end), orders)
    log(f"wrote label record: {out.relative_to(REPO)}")
    log(f"time_window: {rfc3339(window_start)} .. {rfc3339(window_end)}")
    log("=== done ===")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Run a Shoe Shop incident scenario.")
    ap.add_argument("scenario", help="scenario name (file stem under scenarios/)")
    args = ap.parse_args()
    try:
        return run(args.scenario)
    except subprocess.CalledProcessError as e:
        log(f"compose command failed (exit {e.returncode})")
        return 1


if __name__ == "__main__":
    sys.exit(main())
