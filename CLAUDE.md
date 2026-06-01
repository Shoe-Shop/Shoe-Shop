# CLAUDE.md — session bootstrap

Claude Code loads this file automatically at the start of every session.
**Read [`ARCHITECTURE.md`](ARCHITECTURE.md) first** — it is the engineering
ground truth (status, decisions, conventions). This file is the short version.

## What Shoe Shop is
A polyglot (6-language, ~11-service) e-commerce platform built as a hands-on
learning playground for observability + reliability. Only **Catalogue** (Go)
and the 5 infra containers are real today; all other services are
`traefik/whoami` stubs. See ARCHITECTURE.md §2 for the authoritative status.

## Hard rules
- **No hallucination.** Verify against the code/registry before claiming things.
  Build/test in Docker and let the compiler/`buf lint`/`docker build` be ground
  truth rather than guessing library APIs or versions.
- **Commits:** Conventional Commits + DCO sign-off (`git commit -s`).
  **Author name only — never add `Co-Authored-By` trailers.**
- **Git:** remote is `git@github.com:Shoe-Shop/Shoe-Shop.git`, branch `main`.
  Solo repo — the user wants `origin/main` kept current, so push after
  committing. Use `--force-with-lease` only for intentional history fixes.
- **Don't write to** `deploy/compose/.env` expectations: `.env` is gitignored
  (default creds); `.env.example` is the committed template.

## Environment
- Windows + Docker Desktop (WSL2, ~8 GB). Use **PowerShell** for git/docker/task.
- `task` CLI is installed (winget). Go / buf / sqlc / protoc are **NOT** installed
  locally — run all codegen and Go builds inside Docker images.
- PowerShell PATH for `task` may need refreshing in a fresh shell:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')`

## Day-to-day
- Bring up: `task up:core` · status: `task ps` · logs: `task logs -- <svc>` ·
  down: `task down`.
- Codegen: `buf` (proto→Go) and `sqlc` (SQL→Go) via Docker; commit the output.
- New services follow the Catalogue pattern (ARCHITECTURE.md §9): otelgrpc +
  otelpgx + otelhttp so every request is a multi-span trace in Tempo.

## Current focus
v0.2 read path — ✅ Catalogue and ✅ BFF are real (cross-service trace
`bff → catalogue` validated). Next real service: **Cart** (Redis) or **Users**
(Postgres). Incident/chaos framework comes *after* enough real services exist.
