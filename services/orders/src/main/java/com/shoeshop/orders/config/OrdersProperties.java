package com.shoeshop.orders.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Runtime configuration bound from the {@code orders.*} environment/properties
 * (see application.yml). The OTLP exporter is configured separately by the
 * OpenTelemetry Java agent directly from the standard OTEL_* variables.
 */
@ConfigurationProperties(prefix = "orders")
public record OrdersProperties(Grpc grpc, Nats nats) {

    public record Grpc(int port) {}

    public record Nats(String url) {}
}
