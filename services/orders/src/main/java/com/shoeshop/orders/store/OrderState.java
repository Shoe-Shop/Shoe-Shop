package com.shoeshop.orders.store;

import com.shoeshop.orders.grpc.OrderStatus;

/**
 * The order lifecycle / saga state (ADR-0003 §2). PENDING/RESERVING/AUTHORIZING
 * are in-flight; CONFIRMED and CANCELLED are terminal. Persisted as its name()
 * (e.g. "RESERVING") and mapped to the proto {@link OrderStatus} on the wire.
 */
public enum OrderState {
    PENDING,
    RESERVING,
    AUTHORIZING,
    CONFIRMED,
    CANCELLED;

    /** Map to the proto enum (proto values are prefixed ORDER_STATUS_). */
    public OrderStatus toProto() {
        return switch (this) {
            case PENDING -> OrderStatus.ORDER_STATUS_PENDING;
            case RESERVING -> OrderStatus.ORDER_STATUS_RESERVING;
            case AUTHORIZING -> OrderStatus.ORDER_STATUS_AUTHORIZING;
            case CONFIRMED -> OrderStatus.ORDER_STATUS_CONFIRMED;
            case CANCELLED -> OrderStatus.ORDER_STATUS_CANCELLED;
        };
    }
}
