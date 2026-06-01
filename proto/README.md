# `proto/` — service contracts (single source of truth)

Protobuf/gRPC definitions for Shoe Shop services. Each service owns a
versioned package, e.g. `catalogue/v1/catalogue.proto` → package
`catalogue.v1`.

## Layout

```
proto/
├── buf.yaml            # buf module: lint + breaking-change config
├── buf.gen.yaml        # codegen: Go + Go-gRPC via buf remote plugins
├── catalogue/v1/       # CatalogueService contract
└── gen/go/             # GENERATED Go stubs (committed; linguist-generated)
```

The generated Go stubs under `gen/go/` are **committed**. They carry a
hand-maintained `go.mod` and are consumed by Go services through a `replace`
directive (see `services/catalogue/go.mod`), which keeps the monorepo
buildable on a fresh clone with no codegen step.

## Regenerate

No local toolchains required — everything runs in Docker. From the **repo
root** (paths below assume an absolute host path; adjust for your shell):

```bash
# 1) Lint + generate Go stubs into proto/gen/go
docker run --rm -v "$PWD/proto:/workspace" -w /workspace bufbuild/buf:latest lint
docker run --rm -v "$PWD/proto:/workspace" -w /workspace bufbuild/buf:latest generate

# 2) Tidy the generated module
docker run --rm -v "$PWD:/src" -w /src/proto/gen/go golang:1.25-bookworm go mod tidy
```

On Windows PowerShell, use the absolute path form, e.g.
`-v "E:/Shoe-Shop/proto:/workspace"`.

Commit the regenerated files. CI verifies that `buf generate` produces no diff.

## Conventions (enforced by `buf lint`, `STANDARD` ruleset)

- Package ends in a version suffix: `catalogue.v1`.
- Package path matches directory: `catalogue/v1/`.
- Services end in `Service`; RPC request/response types are
  `<Method>Request` / `<Method>Response`.
