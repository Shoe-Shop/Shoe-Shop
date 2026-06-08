# Notification service image.
# Build context is services/notification (NOT the repo root): Notification is a
# pure NATS subscriber with no gRPC/proto dependency, so — unlike Orders/Inventory
# — it needs nothing from proto/gen/go. Mirrors Payment's self-contained context.
#
#   docker build -t shoeshop/notification:dev services/notification
# syntax=docker/dockerfile:1

FROM golang:1.25-bookworm AS build
WORKDIR /src

# Dependencies first, for layer caching.
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

# Service sources.
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -trimpath -o /out/notification ./cmd/notification

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /
COPY --from=build /out/notification /notification
EXPOSE 8080
USER nonroot:nonroot
# The healthcheck (compose) runs `/notification healthcheck` — no shell needed.
ENTRYPOINT ["/notification"]
