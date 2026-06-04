package saga

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"

	"github.com/shoeshop/shoe-shop/services/inventory/internal/store"
	"github.com/shoeshop/shoe-shop/services/inventory/internal/telemetry"
)

// Consumer is the inventory saga worker. It owns the INVENTORY JetStream stream,
// runs a durable consumer over the command subjects, and publishes reply events.
type Consumer struct {
	js      jetstream.JetStream
	pool    *pgxpool.Pool
	queries *store.Queries
	cc      jetstream.ConsumeContext
}

// NewConsumer builds the saga worker. pool is used to run an order's item
// reservations in one transaction (so a partial order never half-reserves).
func NewConsumer(js jetstream.JetStream, pool *pgxpool.Pool, queries *store.Queries) *Consumer {
	return &Consumer{js: js, pool: pool, queries: queries}
}

// Start ensures the INVENTORY stream + a durable consumer for the command
// subjects exist, then begins consuming asynchronously. Call Stop to halt.
//
// MaxDeliver bounds redelivery: a message that keeps failing is eventually
// stopped (a future dead-letter / stuck-saga incident) rather than looping
// forever. AckExplicit means a message is only removed once a handler succeeds.
func (c *Consumer) Start(ctx context.Context) error {
	stream, err := c.js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:      StreamName,
		Subjects:  []string{"inventory.>"},
		Storage:   jetstream.FileStorage,
		Retention: jetstream.LimitsPolicy,
	})
	if err != nil {
		return err
	}
	cons, err := stream.CreateOrUpdateConsumer(ctx, jetstream.ConsumerConfig{
		Durable:        "inventory-worker",
		FilterSubjects: []string{SubjectReserve, SubjectRelease},
		AckPolicy:      jetstream.AckExplicitPolicy,
		MaxDeliver:     5,
	})
	if err != nil {
		return err
	}
	cc, err := cons.Consume(c.handle)
	if err != nil {
		return err
	}
	c.cc = cc
	return nil
}

// Stop halts consumption (idempotent).
func (c *Consumer) Stop() {
	if c.cc != nil {
		c.cc.Stop()
	}
}

// handle is the JetStream message callback. It opens the saga consume span
// (continuing the producer's trace via headers), dispatches by subject, and
// acks/naks/terms appropriately.
func (c *Consumer) handle(msg jetstream.Msg) {
	ctx, span := telemetry.StartConsumeSpan(msg.Headers(), msg.Subject())
	defer span.End()

	var env Envelope
	if err := json.Unmarshal(msg.Data(), &env); err != nil {
		// Undecodable: never redeliver (it will never decode). Term + record.
		slog.ErrorContext(ctx, "inventory: undecodable saga message; terminating",
			"subject", msg.Subject(), "err", err)
		span.RecordError(err)
		span.SetStatus(codes.Error, "bad envelope")
		_ = msg.Term()
		return
	}
	span.SetAttributes(
		attribute.String("order.id", env.OrderID),
		attribute.String("saga.subject", msg.Subject()),
	)

	var err error
	switch msg.Subject() {
	case SubjectReserve:
		err = c.reserve(ctx, env)
	case SubjectRelease:
		err = c.release(ctx, env)
	default:
		slog.WarnContext(ctx, "inventory: unexpected subject; acking", "subject", msg.Subject())
	}
	if err != nil {
		// Transient/internal failure — nak for bounded redelivery.
		slog.ErrorContext(ctx, "inventory: saga handler failed; will redeliver",
			"order.id", env.OrderID, "subject", msg.Subject(), "err", err)
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		_ = msg.Nak()
		return
	}
	_ = msg.Ack()
}

// reserve holds stock for every item of an order in ONE transaction. If any item
// lacks sellable stock the whole transaction rolls back and the saga is rejected
// (terminal — Orders will cancel the order); transient DB errors are returned so
// the message is redelivered.
func (c *Consumer) reserve(ctx context.Context, env Envelope) error {
	var d ItemsData
	if err := json.Unmarshal(env.Data, &d); err != nil {
		// Malformed payload won't fix on redelivery — reject the order.
		slog.WarnContext(ctx, "inventory: malformed reserve payload; rejecting", "order.id", env.OrderID, "err", err)
		return c.publishRejected(ctx, env.OrderID, "malformed_request", "")
	}

	tx, err := c.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	q := c.queries.WithTx(tx)

	for _, it := range d.Items {
		_, err := q.ReserveStock(ctx, store.ReserveStockParams{Quantity: it.Quantity, ProductID: it.ProductID})
		if errors.Is(err, pgx.ErrNoRows) {
			// Insufficient stock: roll back (defer) and reject — no payment attempted.
			slog.WarnContext(ctx, "inventory: insufficient stock; rejecting reservation",
				"order.id", env.OrderID, "product.id", it.ProductID, "requested", it.Quantity)
			telemetry.Event(ctx, "inventory.reservation.rejected",
				attribute.String("order.id", env.OrderID),
				attribute.String("product.id", it.ProductID),
				attribute.String("reason", "insufficient_stock"),
			)
			return c.publishRejected(ctx, env.OrderID, "insufficient_stock", it.ProductID)
		}
		if err != nil {
			return err // transient DB error → redeliver
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}

	slog.InfoContext(ctx, "inventory: reserved stock for order", "order.id", env.OrderID, "items", len(d.Items))
	telemetry.Event(ctx, "inventory.reserved",
		attribute.String("order.id", env.OrderID),
		attribute.Int("items", len(d.Items)),
	)
	return c.publishReserved(ctx, env.OrderID)
}

// release is the compensation: it returns held units to availability. Clamped at
// zero in SQL, so a duplicate/late release is harmless (idempotent). No reply
// event — Orders proceeds to cancel regardless (ADR-0003 §3).
func (c *Consumer) release(ctx context.Context, env Envelope) error {
	var d ItemsData
	if err := json.Unmarshal(env.Data, &d); err != nil {
		slog.ErrorContext(ctx, "inventory: malformed release payload; dropping", "order.id", env.OrderID, "err", err)
		return nil // ack: nothing to do, won't fix on redelivery
	}
	for _, it := range d.Items {
		if _, err := c.queries.ReleaseStock(ctx, store.ReleaseStockParams{Quantity: it.Quantity, ProductID: it.ProductID}); err != nil {
			return err // transient → redeliver
		}
	}
	slog.InfoContext(ctx, "inventory: released stock for order", "order.id", env.OrderID, "items", len(d.Items))
	telemetry.Event(ctx, "inventory.released",
		attribute.String("order.id", env.OrderID),
		attribute.Int("items", len(d.Items)),
	)
	return nil
}

func (c *Consumer) publishReserved(ctx context.Context, orderID string) error {
	return c.publish(ctx, SubjectReserved, orderID, struct{}{})
}

func (c *Consumer) publishRejected(ctx context.Context, orderID, reason, productID string) error {
	return c.publish(ctx, SubjectRejected, orderID, RejectedData{Reason: reason, ProductID: productID})
}

// publish emits a reply event, injecting the active trace context into the NATS
// headers so Orders continues the same saga trace.
func (c *Consumer) publish(ctx context.Context, subject, orderID string, data any) error {
	env, err := newEnvelope(subject, orderID, data)
	if err != nil {
		return err
	}
	body, err := json.Marshal(env)
	if err != nil {
		return err
	}
	pubCtx, span := telemetry.StartPublishSpan(ctx, subject)
	defer span.End()

	msg := &nats.Msg{Subject: subject, Data: body, Header: nats.Header{}}
	telemetry.InjectTrace(pubCtx, msg)
	if _, err := c.js.PublishMsg(pubCtx, msg); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return err
	}
	return nil
}
