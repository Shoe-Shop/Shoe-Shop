package com.shoeshop.orders.saga;

/**
 * JetStream streams and subjects for the checkout saga (ADR-0003 §3). Streams are
 * grouped by owning domain. Orders OWNS the ORDERS stream (lifecycle events it
 * publishes), PUBLISHES commands onto the INVENTORY and PAYMENT streams, and
 * CONSUMES the reply events those domains publish back.
 */
public final class Subjects {

    private Subjects() {}

    // Streams.
    public static final String STREAM_ORDERS = "ORDERS";
    public static final String STREAM_INVENTORY = "INVENTORY";
    public static final String STREAM_PAYMENT = "PAYMENT";

    // ORDERS — lifecycle events Orders publishes (Notification + analytics subscribe).
    public static final String ORDERS_PLACED = "orders.placed";
    public static final String ORDERS_CONFIRMED = "orders.confirmed";
    public static final String ORDERS_CANCELLED = "orders.cancelled";

    // INVENTORY — commands Orders publishes; events Orders consumes.
    public static final String INVENTORY_RESERVE = "inventory.reserve";
    public static final String INVENTORY_RELEASE = "inventory.release";
    public static final String INVENTORY_RESERVED = "inventory.reserved";
    public static final String INVENTORY_REJECTED = "inventory.rejected";

    // PAYMENT — commands Orders publishes; events Orders consumes.
    public static final String PAYMENT_AUTHORIZE = "payment.authorize";
    public static final String PAYMENT_VOID = "payment.void";
    public static final String PAYMENT_AUTHORIZED = "payment.authorized";
    public static final String PAYMENT_DECLINED = "payment.declined";
}
