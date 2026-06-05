package com.shoeshop.orders.saga;

import java.io.IOException;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.shoeshop.orders.config.OrdersProperties;

import io.nats.client.Connection;
import io.nats.client.JetStream;
import io.nats.client.JetStreamManagement;
import io.nats.client.Nats;
import io.nats.client.Options;

/**
 * NATS / JetStream wiring. Provides the shared connection plus the JetStream
 * publish and management handles used by the saga. Stream provisioning and the
 * durable consumers live in {@link SagaConsumer} (started after the beans are
 * wired).
 */
@Configuration
public class NatsConfig {

    /** The shared NATS connection; drained on context shutdown. */
    @Bean(destroyMethod = "close")
    public Connection natsConnection(OrdersProperties props) throws IOException, InterruptedException {
        Options options = Options.builder()
                .server(props.nats().url())
                .connectionName("orders")
                .build();
        return Nats.connect(options);
    }

    @Bean
    public JetStream jetStream(Connection connection) throws IOException {
        return connection.jetStream();
    }

    @Bean
    public JetStreamManagement jetStreamManagement(Connection connection) throws IOException {
        return connection.jetStreamManagement();
    }
}
