# BFF service image.
# Build context is the REPO ROOT (see compose.core.yaml) so the Catalogue
# .proto is available to copy in for the runtime gRPC client.
#
#   docker build -f services/bff/Dockerfile -t shoeshop/bff:dev .
# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY services/bff/package.json services/bff/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY services/bff/tsconfig.json ./
COPY services/bff/src ./src
RUN npm run build

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY services/bff/package.json services/bff/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM gcr.io/distroless/nodejs22-debian12:nonroot
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Downstream contracts for the runtime gRPC clients (loaded by proto-loader).
COPY proto/catalogue ./proto/catalogue
COPY proto/cart ./proto/cart
COPY proto/users ./proto/users
ENV CATALOGUE_PROTO=/app/proto/catalogue/v1/catalogue.proto
ENV CART_PROTO=/app/proto/cart/v1/cart.proto
ENV USERS_PROTO=/app/proto/users/v1/users.proto
EXPOSE 8080
# distroless nodejs entrypoint is `node`; these are its args.
CMD ["-r", "./dist/telemetry.js", "./dist/index.js"]
