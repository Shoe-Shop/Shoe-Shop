# Contributing to Shoe Shop

Thanks for your interest in Shoe Shop — a modern, polyglot microservices
reference platform for observability and reliability engineering. This guide
covers how to get a local environment running and how to propose changes.

By participating, you agree to uphold our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## Prerequisites

| Tool | Why | Notes |
|------|-----|-------|
| **Docker Desktop** (WSL2 backend on Windows) | Runs the whole stack | Reference budget: 8 GB allocated to WSL2 — see [ADR-0001](docs/adr/ADR-0001-local-dev-and-resource-constraints.md) |
| **[Task](https://taskfile.dev)** (`task` CLI) | The single command interface | `winget install Task.Task` / `brew install go-task` |
| **Git** | Version control | Configure your name + email before committing |

Per-language toolchains (Go, Node, Java, Rust, Python, Kotlin) are only needed
if you run a specific service **natively** in hybrid mode. The containerized
path needs nothing but Docker.

Run `task doctor` to confirm Docker is reachable.

---

## Quickstart

```bash
git clone https://github.com/<your-org>/shoe-shop.git
cd shoe-shop

task setup        # creates deploy/compose/.env and pre-pulls images
task up:core      # platform backbone + the 6 core services
task ps           # see what is running
task obs          # print Grafana + endpoint URLs
```

Then open Grafana at <http://localhost:3000>. Tear down with `task down`
(keeps data) or `task nuke` (also deletes data volumes).

---

## The two development paths

Shoe Shop ships a **Dual-Path** workflow (see [ADR-0001](docs/adr/ADR-0001-local-dev-and-resource-constraints.md)):

| Path | Command | When |
|------|---------|------|
| **Hybrid** | `task dev` | Daily work. Infra + observability run in Docker; you run the one service you are editing natively for fast reloads. |
| **Full compose** | `task up:core` / `up:full` | CI parity, demos, and reliability scenarios — everything containerized. |

### Topology profiles (the RAM dial)

| Profile | Command | Services |
|---------|---------|----------|
| `core` *(default)* | `task up:core` | frontend, bff, catalogue, cart, orders, payment |
| `full` | `task up:full` | all 11 + Zitadel auth |
| `lean-jvm` | `task up:lean-jvm` | full, with Orders/Shipping heaps capped |

---

## How the service stubs work

Until a service has code, it runs a `traefik/whoami` placeholder so the
topology, ports, memory limits, and dependency graph are real and runnable.
To bring a real service online:

1. Add the implementation under `services/<name>/` with a `Dockerfile`.
2. In the matching Compose overlay, remove the `image:` line and uncomment
   the `build:` block already present for that service.
3. Switch its infra `depends_on` from `service_started` to `service_healthy`.

Nothing else in the topology changes.

---

## Proposing changes

### Architectural changes need an ADR first
Anything that changes a boundary, protocol, datastore, or a core tool gets a
short **Architecture Decision Record** under `docs/adr/NNNN-title.md` before
the implementation PR. The existing records in [`docs/adr/`](docs/adr/) are the template to follow.

### Commits — [Conventional Commits](https://www.conventionalcommits.org)
Format: `type(scope): summary`

- **types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`
- **scopes:** a service (`catalogue`, `orders`, …), or an area (`compose`,
  `observability`, `docs`, `proto`)

Example: `feat(catalogue): add product search via Meilisearch`

### Sign your work — DCO
Every commit must be signed off under the
[Developer Certificate of Origin](https://developercertificate.org):

```bash
git commit -s -m "feat(cart): add quantity validation"
```

This adds a `Signed-off-by:` line certifying you wrote the change or have the
right to submit it. We use the DCO, not a CLA.

### Code style
Formatting is enforced via `.editorconfig` plus each language's standard
formatter (`gofmt`, `rustfmt`, `ruff`/`black`, `prettier`, `ktlint`). Run your
service's formatter before opening a PR.

---

## Pull request checklist

- [ ] Branch is up to date with `main`
- [ ] Commits follow Conventional Commits and are DCO signed-off (`-s`)
- [ ] An ADR exists for any architectural change
- [ ] `task config` validates if you touched Compose files
- [ ] Docs updated if behavior or setup changed

---

## License

By contributing, you agree that your contributions are licensed under the
project's [Apache License 2.0](LICENSE).
