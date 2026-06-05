package com.shoeshop.orders.store;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.shoeshop.orders.store.OrderRow.OrderItemRow;

/**
 * Order persistence over Spring's {@link JdbcClient} (explicit SQL, no ORM — low
 * memory, predictable behaviour for the incident corpus). Saga state transitions
 * are <b>conditional</b> updates (WHERE status = :from) so a duplicate/late saga
 * reply is a no-op — idempotency keyed on order_id, per ADR-0003 §3.
 */
@Repository
public class OrderRepository {

    private final JdbcClient db;

    public OrderRepository(JdbcClient db) {
        this.db = db;
    }

    /** Insert the order header and all its lines in one transaction. */
    @Transactional
    public void insert(OrderRow o) {
        db.sql("""
                INSERT INTO orders (id, user_id, status, total_cents, currency, created_at, updated_at)
                VALUES (:id, :userId, :status, :totalCents, :currency, :createdAt, :updatedAt)
                """)
                .param("id", o.id())
                .param("userId", o.userId())
                .param("status", o.status().name())
                .param("totalCents", o.totalCents())
                .param("currency", o.currency())
                .param("createdAt", OffsetDateTime.ofInstant(o.createdAt(), java.time.ZoneOffset.UTC))
                .param("updatedAt", OffsetDateTime.ofInstant(o.updatedAt(), java.time.ZoneOffset.UTC))
                .update();

        for (OrderItemRow it : o.items()) {
            db.sql("""
                    INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents)
                    VALUES (:orderId, :productId, :quantity, :unitPriceCents)
                    """)
                    .param("orderId", o.id())
                    .param("productId", it.productId())
                    .param("quantity", it.quantity())
                    .param("unitPriceCents", it.unitPriceCents())
                    .update();
        }
    }

    /** Load an order and its lines, or empty if unknown. */
    @Transactional(readOnly = true)
    public Optional<OrderRow> findById(UUID id) {
        Optional<OrderRow> header = db.sql("""
                SELECT id, user_id, status, total_cents, currency, created_at, updated_at
                FROM orders WHERE id = :id
                """)
                .param("id", id)
                .query((rs, n) -> new OrderRow(
                        rs.getObject("id", UUID.class),
                        rs.getString("user_id"),
                        OrderState.valueOf(rs.getString("status")),
                        rs.getLong("total_cents"),
                        rs.getString("currency"),
                        rs.getObject("created_at", OffsetDateTime.class).toInstant(),
                        rs.getObject("updated_at", OffsetDateTime.class).toInstant(),
                        java.util.List.of()))
                .optional();
        if (header.isEmpty()) {
            return Optional.empty();
        }
        var items = db.sql("""
                SELECT product_id, quantity, unit_price_cents
                FROM order_items WHERE order_id = :id ORDER BY product_id
                """)
                .param("id", id)
                .query((rs, n) -> new OrderItemRow(
                        rs.getString("product_id"),
                        rs.getInt("quantity"),
                        rs.getLong("unit_price_cents")))
                .list();
        OrderRow h = header.get();
        return Optional.of(new OrderRow(h.id(), h.userId(), h.status(), h.totalCents(),
                h.currency(), h.createdAt(), h.updatedAt(), items));
    }

    /**
     * Conditionally move an order from {@code from} to {@code to}. Returns true if a
     * row was updated (the order was in the expected state); false if not — which is
     * how a duplicate or out-of-order saga reply becomes a safe no-op.
     */
    @Transactional
    public boolean transition(UUID id, OrderState from, OrderState to) {
        int rows = db.sql("""
                UPDATE orders SET status = :to, updated_at = now()
                WHERE id = :id AND status = :from
                """)
                .param("to", to.name())
                .param("from", from.name())
                .param("id", id)
                .update();
        return rows > 0;
    }
}
