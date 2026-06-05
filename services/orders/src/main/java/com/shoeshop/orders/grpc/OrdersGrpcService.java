package com.shoeshop.orders.grpc;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.shoeshop.orders.saga.SagaOrchestrator;
import com.shoeshop.orders.store.OrderRepository;
import com.shoeshop.orders.store.OrderRow;
import com.shoeshop.orders.store.OrderRow.OrderItemRow;
import com.shoeshop.orders.store.OrderState;

import io.grpc.Status;
import io.grpc.stub.StreamObserver;

/**
 * The synchronous gRPC front door to checkout (ADR-0003 §1). CreateOrder persists
 * a PENDING order, kicks off the async saga, and returns immediately; GetOrder is
 * a status read. The OpenTelemetry Java agent instruments grpc-netty, so each RPC
 * is a SERVER span (child of the BFF client span) and the saga publishes started
 * here join that one trace.
 */
@Component
public class OrdersGrpcService extends OrdersServiceGrpc.OrdersServiceImplBase {

    private static final Logger log = LoggerFactory.getLogger(OrdersGrpcService.class);

    private final OrderRepository orders;
    private final SagaOrchestrator orchestrator;

    public OrdersGrpcService(OrderRepository orders, SagaOrchestrator orchestrator) {
        this.orders = orders;
        this.orchestrator = orchestrator;
    }

    @Override
    public void createOrder(CreateOrderRequest req, StreamObserver<CreateOrderResponse> obs) {
        if (req.getUserId().isBlank()) {
            obs.onError(Status.INVALID_ARGUMENT.withDescription("user_id is required").asRuntimeException());
            return;
        }
        if (req.getItemsCount() == 0) {
            obs.onError(Status.INVALID_ARGUMENT.withDescription("order must have at least one item").asRuntimeException());
            return;
        }

        List<OrderItemRow> items = new ArrayList<>(req.getItemsCount());
        long total = 0;
        for (OrderItem it : req.getItemsList()) {
            if (it.getProductId().isBlank() || it.getQuantity() <= 0) {
                obs.onError(Status.INVALID_ARGUMENT
                        .withDescription("each item needs a product_id and quantity > 0").asRuntimeException());
                return;
            }
            items.add(new OrderItemRow(it.getProductId(), it.getQuantity(), it.getUnitPriceCents()));
            total += (long) it.getQuantity() * it.getUnitPriceCents();
        }

        String currency = req.getCurrency().isBlank() ? "USD" : req.getCurrency();
        Instant now = Instant.now();
        OrderRow order = new OrderRow(UUID.randomUUID(), req.getUserId(), OrderState.PENDING,
                total, currency, now, now, items);

        try {
            orders.insert(order);
            log.info("created order {} for user {} ({} items, {} {})",
                    order.id(), order.userId(), items.size(), total, currency);
            orchestrator.start(order);
        } catch (Exception e) {
            log.error("failed to start checkout for user {}: {}", req.getUserId(), e.getMessage(), e);
            obs.onError(Status.INTERNAL.withDescription("checkout failed to start").asRuntimeException());
            return;
        }

        obs.onNext(CreateOrderResponse.newBuilder().setOrder(toProto(order)).build());
        obs.onCompleted();
    }

    @Override
    public void getOrder(GetOrderRequest req, StreamObserver<GetOrderResponse> obs) {
        UUID id;
        try {
            id = UUID.fromString(req.getOrderId());
        } catch (IllegalArgumentException e) {
            obs.onError(Status.INVALID_ARGUMENT.withDescription("order_id must be a UUID").asRuntimeException());
            return;
        }
        orders.findById(id).ifPresentOrElse(order -> {
            obs.onNext(GetOrderResponse.newBuilder().setOrder(toProto(order)).build());
            obs.onCompleted();
        }, () -> obs.onError(Status.NOT_FOUND.withDescription("order not found").asRuntimeException()));
    }

    private static Order toProto(OrderRow o) {
        Order.Builder b = Order.newBuilder()
                .setId(o.id().toString())
                .setUserId(o.userId())
                .setStatus(o.status().toProto())
                .setTotalCents(o.totalCents())
                .setCurrency(o.currency())
                .setCreatedAt(o.createdAt().toString())
                .setUpdatedAt(o.updatedAt().toString());
        for (OrderItemRow it : o.items()) {
            b.addItems(OrderItem.newBuilder()
                    .setProductId(it.productId())
                    .setQuantity(it.quantity())
                    .setUnitPriceCents(it.unitPriceCents())
                    .build());
        }
        return b.build();
    }
}
