package com.shoeshop.orders.saga;

import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.shoeshop.orders.store.OrderRepository;
import com.shoeshop.orders.store.OrderRow;
import com.shoeshop.orders.store.OrderState;
import com.shoeshop.orders.telemetry.Events;

import io.opentelemetry.api.common.Attributes;

/**
 * The checkout saga state machine (ADR-0003 §2) — the only saga authority. Drives
 * an order through PENDING → RESERVING → AUTHORIZING → CONFIRMED, compensating to
 * CANCELLED on rejection/decline.
 *
 * <p>Each step uses a <b>conditional</b> {@link OrderRepository#transition} as its
 * atomic dedup guard: only the delivery that actually moves the state runs the
 * side effects, so duplicate/late JetStream replies are safe no-ops (idempotency
 * keyed on order_id). Downstream commands are likewise idempotent on order_id.
 * Every method runs inside the saga's consume/request span, so its publishes,
 * logs, events and JDBC spans all join the one saga trace.
 */
@Component
public class SagaOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(SagaOrchestrator.class);

    private final OrderRepository orders;
    private final SagaMessaging out;

    public SagaOrchestrator(OrderRepository orders, SagaMessaging out) {
        this.orders = orders;
        this.out = out;
    }

    /**
     * Kick off the saga for a freshly-persisted PENDING order: announce it
     * (orders.placed) and command stock reservation (inventory.reserve), then move
     * to RESERVING. Called synchronously inside CreateOrder so the whole saga shares
     * that request's trace.
     */
    public void start(OrderRow order) {
        String id = order.id().toString();

        ObjectNode placed = out.data();
        placed.put("user_id", order.userId());
        placed.put("total_cents", order.totalCents());
        placed.put("currency", order.currency());
        out.publish(Subjects.ORDERS_PLACED, id, placed);

        ObjectNode reserve = out.data();
        ArrayNode items = reserve.putArray("items");
        for (OrderRow.OrderItemRow it : order.items()) {
            ObjectNode line = items.addObject();
            line.put("product_id", it.productId());
            line.put("quantity", it.quantity());
        }
        out.publish(Subjects.INVENTORY_RESERVE, id, reserve);

        orders.transition(order.id(), OrderState.PENDING, OrderState.RESERVING);
        log.info("saga started for order {} ({} items, {} {})",
                id, order.items().size(), order.totalCents(), order.currency());
        Events.emit("orders.placed", Attributes.builder()
                .put("order.id", id)
                .put("order.total_cents", order.totalCents())
                .put("order.items", order.items().size())
                .build());
    }

    /** inventory.reserved → authorize payment (RESERVING → AUTHORIZING). */
    public void onInventoryReserved(UUID id) {
        if (!orders.transition(id, OrderState.RESERVING, OrderState.AUTHORIZING)) {
            log.info("ignoring inventory.reserved for order {} (not RESERVING)", id);
            return;
        }
        OrderRow order = orders.findById(id).orElseThrow();
        ObjectNode authorize = out.data();
        authorize.put("amount_cents", order.totalCents());
        authorize.put("currency", order.currency());
        out.publish(Subjects.PAYMENT_AUTHORIZE, id.toString(), authorize);
        log.info("stock reserved for order {}; authorizing payment of {} {}",
                id, order.totalCents(), order.currency());
        Events.emit("orders.reserved", Attributes.builder()
                .put("order.id", id.toString())
                .put("order.total_cents", order.totalCents())
                .build());
    }

    /** inventory.rejected → cancel; no payment attempted (RESERVING → CANCELLED). */
    public void onInventoryRejected(UUID id, String reason) {
        if (!orders.transition(id, OrderState.RESERVING, OrderState.CANCELLED)) {
            log.info("ignoring inventory.rejected for order {} (not RESERVING)", id);
            return;
        }
        publishCancelled(id, "inventory_" + reason);
        log.warn("order {} cancelled: inventory rejected ({})", id, reason);
        Events.emit("orders.cancelled", Attributes.builder()
                .put("order.id", id.toString())
                .put("cancel.reason", "inventory_" + reason)
                .build());
    }

    /** payment.authorized → confirm (AUTHORIZING → CONFIRMED). */
    public void onPaymentAuthorized(UUID id) {
        if (!orders.transition(id, OrderState.AUTHORIZING, OrderState.CONFIRMED)) {
            log.info("ignoring payment.authorized for order {} (not AUTHORIZING)", id);
            return;
        }
        OrderRow order = orders.findById(id).orElseThrow();
        ObjectNode confirmed = out.data();
        confirmed.put("user_id", order.userId());
        confirmed.put("total_cents", order.totalCents());
        confirmed.put("currency", order.currency());
        out.publish(Subjects.ORDERS_CONFIRMED, id.toString(), confirmed);
        log.info("order {} CONFIRMED", id);
        Events.emit("orders.confirmed", Attributes.builder()
                .put("order.id", id.toString())
                .put("order.total_cents", order.totalCents())
                .build());
    }

    /** payment.declined → release stock then cancel (AUTHORIZING → CANCELLED). */
    public void onPaymentDeclined(UUID id, String reason) {
        if (!orders.transition(id, OrderState.AUTHORIZING, OrderState.CANCELLED)) {
            log.info("ignoring payment.declined for order {} (not AUTHORIZING)", id);
            return;
        }
        OrderRow order = orders.findById(id).orElseThrow();
        // Compensation: hand the reserved units back to availability.
        ObjectNode release = out.data();
        ArrayNode items = release.putArray("items");
        for (OrderRow.OrderItemRow it : order.items()) {
            ObjectNode line = items.addObject();
            line.put("product_id", it.productId());
            line.put("quantity", it.quantity());
        }
        out.publish(Subjects.INVENTORY_RELEASE, id.toString(), release);
        publishCancelled(id, "payment_" + reason);
        log.warn("order {} cancelled: payment declined ({}); stock released", id, reason);
        Events.emit("orders.cancelled", Attributes.builder()
                .put("order.id", id.toString())
                .put("cancel.reason", "payment_" + reason)
                .build());
    }

    private void publishCancelled(UUID id, String reason) {
        OrderRow order = orders.findById(id).orElseThrow();
        ObjectNode cancelled = out.data();
        cancelled.put("user_id", order.userId());
        cancelled.put("total_cents", order.totalCents());
        cancelled.put("currency", order.currency());
        cancelled.put("reason", reason);
        out.publish(Subjects.ORDERS_CANCELLED, id.toString(), cancelled);
    }
}
