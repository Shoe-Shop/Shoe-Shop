package com.shoeshop.orders.store;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** An order aggregate as persisted: the order header plus its immutable lines. */
public record OrderRow(
        UUID id,
        String userId,
        OrderState status,
        long totalCents,
        String currency,
        Instant createdAt,
        Instant updatedAt,
        List<OrderItemRow> items) {

    /** A single order line. */
    public record OrderItemRow(String productId, int quantity, long unitPriceCents) {}
}
