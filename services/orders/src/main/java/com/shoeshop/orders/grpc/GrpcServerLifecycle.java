package com.shoeshop.orders.grpc;

import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;

import com.shoeshop.orders.config.OrdersProperties;

import io.grpc.Server;
import io.grpc.ServerBuilder;
import io.grpc.protobuf.services.ProtoReflectionServiceV1;
import io.grpc.protobuf.services.HealthStatusManager;

/**
 * Owns the gRPC server lifecycle, tied to the Spring context (start on refresh,
 * graceful stop on shutdown). A dedicated non-daemon thread blocks on
 * {@code awaitTermination()} so this non-web Spring Boot app stays alive while the
 * server runs. The OpenTelemetry Java agent instruments the server automatically;
 * reflection + health are registered for grpcurl/debugging (the container
 * healthcheck is a plain TCP probe, so it adds no telemetry noise).
 */
@Component
public class GrpcServerLifecycle implements SmartLifecycle {

    private static final Logger log = LoggerFactory.getLogger(GrpcServerLifecycle.class);

    private final OrdersGrpcService service;
    private final int port;
    private Server server;
    private Thread awaitThread;
    private volatile boolean running;

    public GrpcServerLifecycle(OrdersGrpcService service, OrdersProperties props) {
        this.service = service;
        this.port = props.grpc().port();
    }

    @Override
    public void start() {
        HealthStatusManager health = new HealthStatusManager();
        try {
            server = ServerBuilder.forPort(port)
                    .addService(service)
                    .addService(health.getHealthService())
                    .addService(ProtoReflectionServiceV1.newInstance())
                    .build()
                    .start();
        } catch (Exception e) {
            throw new IllegalStateException("failed to start gRPC server on port " + port, e);
        }
        running = true;
        awaitThread = new Thread(() -> {
            try {
                server.awaitTermination();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }, "grpc-await");
        awaitThread.setDaemon(false); // keep the JVM alive while serving
        awaitThread.start();
        log.info("orders gRPC server started on port {}", port);
    }

    @Override
    public void stop() {
        if (server != null) {
            log.info("shutting down orders gRPC server");
            server.shutdown();
            try {
                if (!server.awaitTermination(10, TimeUnit.SECONDS)) {
                    server.shutdownNow();
                }
            } catch (InterruptedException e) {
                server.shutdownNow();
                Thread.currentThread().interrupt();
            }
        }
        running = false;
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    @Override
    public int getPhase() {
        // Start after the saga consumers and other beans; stop first.
        return Integer.MAX_VALUE;
    }
}
