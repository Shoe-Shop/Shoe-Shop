# Payment service image (Rust · Axum · async-nats). The deterministic payment
# simulator for the v0.3 checkout saga (ADR-0003 §6). NATS-only saga participant
# (no gRPC/proto), so the build context is services/payment — no repo-root proto
# dependency, unlike the Go/Java services.
#
#   docker build -f services/payment/Dockerfile -t shoeshop/payment:dev services/payment
# syntax=docker/dockerfile:1

FROM rust:1-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY schema.sql ./schema.sql
COPY src ./src
# Cache the cargo registry and target dir across builds; copy the binary OUT of
# the (ephemeral) target cache mount within the same RUN so it survives the layer.
# --locked: build exactly the committed Cargo.lock (reproducible).
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    cargo build --release --locked && mkdir -p /out && cp target/release/payment /out/payment

# distroless/cc carries glibc + libgcc (the dynamically-linked Rust binary needs
# them); rustls everywhere means no OpenSSL. No shell — the container healthcheck
# uses the binary's own `healthcheck` subcommand, not wget/curl.
FROM gcr.io/distroless/cc-debian12:nonroot
WORKDIR /
COPY --from=build /out/payment /payment
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/payment"]
