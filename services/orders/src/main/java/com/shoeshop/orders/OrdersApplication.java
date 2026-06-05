package com.shoeshop.orders;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * Orders — the checkout saga orchestrator (ADR-0003). Boots Spring (config,
 * datasource, JdbcClient), then a {@code SmartLifecycle} bean starts the gRPC
 * front door (CreateOrder/GetOrder) and the NATS JetStream saga consumer.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class OrdersApplication {
    public static void main(String[] args) {
        SpringApplication.run(OrdersApplication.class, args);
    }
}
