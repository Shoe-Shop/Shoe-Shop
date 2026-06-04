import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for a slim distroless-style runtime image.
  output: "standalone",
  reactStrictMode: true,

  // gRPC and OTel exporters use dynamic require() paths that webpack cannot
  // statically analyse. Mark them as external so Next.js loads them from
  // node_modules at runtime rather than attempting to bundle them. Without
  // this the build fails with "Cannot find module '@grpc/grpc-js'" or similar
  // module-not-found errors in the server bundle.
  serverExternalPackages: [
    "@opentelemetry/exporter-trace-otlp-grpc",
    "@opentelemetry/exporter-metrics-otlp-grpc",
    "@opentelemetry/exporter-logs-otlp-grpc",
    "@opentelemetry/auto-instrumentations-node",
    "@opentelemetry/sdk-node",
    "@grpc/grpc-js",
  ],
};

export default nextConfig;
