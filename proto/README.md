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
├── cart/v1/            # CartService contract
├── users/v1/           # UsersService contract
├── gen/go/             # GENERATED Go stubs (committed; linguist-generated)
└── gen/python/         # GENERATED Python stubs (committed; linguist-generated)
```

Generated stubs are **committed** so the monorepo builds on a fresh clone with
no codegen step. Go stubs (`gen/go/`) carry a hand-maintained `go.mod` consumed
by Go services through a `replace` directive (see `services/catalogue/go.mod`).
Python stubs (`gen/python/`) are imported by Python services by putting that
directory on `PYTHONPATH` (see `services/users/Dockerfile`).

Stubs are generated per language only for the contracts a given language
consumes (e.g. Go stubs for `catalogue`, Python stubs for `users`), not for
every contract in every language.

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

### Python stubs

Python stubs are generated with `grpcio-tools` (same ecosystem as the runtime
`grpcio`/`protobuf`, so the generated-code version guard always matches the
installed runtime), scoped to the contracts Python services consume. From the
**repo root**:

```bash
docker run --rm -v "$PWD:/src" -w /src python:3.12-slim sh -c "\
  pip install --quiet grpcio-tools==1.68.1 && \
  python -m grpc_tools.protoc -Iproto \
    --python_out=proto/gen/python \
    --grpc_python_out=proto/gen/python \
    --pyi_out=proto/gen/python \
    proto/users/v1/users.proto"
```

Commit the regenerated files. CI verifies that `buf generate` produces no diff.

## Conventions (enforced by `buf lint`, `STANDARD` ruleset)

- Package ends in a version suffix: `catalogue.v1`.
- Package path matches directory: `catalogue/v1/`.
- Services end in `Service`; RPC request/response types are
  `<Method>Request` / `<Method>Response`.
