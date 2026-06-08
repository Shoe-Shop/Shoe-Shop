# Captured incident records

Schema-v0 label records produced by **`tools/incident-simulator/`** from real
runs against the checkout stack — one YAML per captured incident window.

These are distinct from [`../examples/`](../examples/), which holds hand-authored
**design fixtures**. Records here are **captured**: their `time_window`,
`order_ids`, and injected `parameters` come from an actual live run, so the
telemetry inside the window is real and (while the ephemeral LGTM bundle retains
it) reconstructable.

- **Schema:** [`../incident-schema.md`](../incident-schema.md)
- **Correlation keys:** [`../correlation-contract.md`](../correlation-contract.md)
- **Produce one:** `task up:checkout` then `task chaos:run -- <scenario>`
  (e.g. `payment-hard-decline`). `task chaos:list` shows the scenarios.

Ids are monotonic across both directories (the design fixtures occupy the low
numbers); each run mints the next free `incident-NNNN`.
