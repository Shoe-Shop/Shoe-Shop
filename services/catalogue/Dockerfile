# Catalogue service image.
# Build context is the REPO ROOT (see deploy/compose/compose.core.yaml) so the
# generated proto module (proto/gen/go), referenced via a replace directive,
# is available to the build.
#
#   docker build -f services/catalogue/Dockerfile -t shoeshop/catalogue:dev .
# syntax=docker/dockerfile:1

FROM golang:1.25-bookworm AS build
WORKDIR /src

# Generated gRPC stubs (depended on via `replace ../../proto/gen/go`).
COPY proto/gen/go/ ./proto/gen/go/
# Catalogue module sources.
COPY services/catalogue/ ./services/catalogue/

WORKDIR /src/services/catalogue
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go mod download
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -trimpath -o /out/catalogue ./cmd/catalogue

# Static gRPC health probe for the container healthcheck.
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOBIN=/out go install github.com/grpc-ecosystem/grpc-health-probe@v0.4.34

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /
COPY --from=build /out/catalogue /catalogue
COPY --from=build /out/grpc-health-probe /grpc-health-probe
EXPOSE 9090
USER nonroot:nonroot
ENTRYPOINT ["/catalogue"]
