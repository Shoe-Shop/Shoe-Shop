# Cart service image.
# Build context is the REPO ROOT (see compose.core.yaml) so the Cart .proto can
# be copied in for the runtime gRPC server.
#
#   docker build -f services/cart/Dockerfile -t shoeshop/cart:dev .
# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY services/cart/package.json services/cart/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY services/cart/tsconfig.json ./
COPY services/cart/src ./src
RUN npm run build

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY services/cart/package.json services/cart/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM gcr.io/distroless/nodejs22-debian12:nonroot
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY proto/cart ./proto/cart
ENV CART_PROTO=/app/proto/cart/v1/cart.proto
EXPOSE 9090 8080
CMD ["-r", "./dist/telemetry.js", "./dist/index.js"]
