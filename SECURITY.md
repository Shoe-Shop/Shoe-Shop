# Security Policy

Shoe Shop is a reference platform intended for local development, demos, and
research. It is **not hardened for production or public internet exposure** —
default credentials and relaxed settings ship intentionally so the stack runs
with zero configuration. Please run it only on trusted networks.

## Supported versions

The project is pre-1.0 and moves quickly. Only the `main` branch receives
fixes. Pin to a tagged release for stability.

| Version | Supported |
|---------|-----------|
| `main`  | ✅ |
| tagged pre-releases | best effort |

## Reporting a concern

Please report suspected issues **privately** rather than in a public issue:

- Preferred: open a private report via GitHub's
  **Security → Report a vulnerability** (GitHub Security Advisories), or
- Email the maintainers at **security@shoe-shop.dev**
  *(replace with your project's real contact before publishing)*.

Please include affected component, version/commit, reproduction steps, and
impact. We aim to acknowledge within **72 hours** and to share a remediation
plan once the report is confirmed.

Kindly give us reasonable time to address a confirmed issue before any public
disclosure. We're happy to credit reporters who would like acknowledgment.

## Scope notes

Because this is a teaching platform, some "findings" are intentional:

- Default/sample credentials in `.env.example` and compose files.
- Relaxed TLS and auth settings for local convenience.
- The reliability-testing tooling, which deliberately disrupts the running
  system as part of its purpose.

Reports about these known, by-design traits are welcome as documentation
improvements, but they are expected behavior rather than defects.
