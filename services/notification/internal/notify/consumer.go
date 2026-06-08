package notify

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/nats-io/nats.go/jetstream"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"

	"github.com/shoeshop/shoe-shop/services/notification/internal/telemetry"
)

// Consumer is the notification subscriber. It runs a durable consumer on the
// ORDERS stream filtered to the terminal lifecycle events and "sends" a customer
// notice for each. It owns no stream and publishes nothing.
type Consumer struct {
	js      jetstream.JetStream
	metrics *telemetry.MessageMetrics
	cc      jetstream.ConsumeContext
}

// NewConsumer builds the subscriber.
func NewConsumer(js jetstream.JetStream, metrics *telemetry.MessageMetrics) *Consumer {
	return &Consumer{js: js, metrics: metrics}
}

// Start ensures the ORDERS stream exists, then begins consuming the terminal
// lifecycle events asynchronously. Call Stop to halt.
//
// Orders OWNS the ORDERS stream, but CreateOrUpdateStream here (idempotent, with
// config matching Orders') makes Notification self-sufficient regardless of
// startup order — it never depends on Orders having provisioned the stream first.
// MaxDeliver bounds redelivery; AckExplicit removes a message only once handled.
func (c *Consumer) Start(ctx context.Context) error {
	stream, err := c.js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:      StreamName,
		Subjects:  []string{"orders.>"},
		Storage:   jetstream.FileStorage,
		Retention: jetstream.LimitsPolicy,
	})
	if err != nil {
		return err
	}
	cons, err := stream.CreateOrUpdateConsumer(ctx, jetstream.ConsumerConfig{
		Durable:        "notification-worker",
		FilterSubjects: []string{SubjectConfirmed, SubjectCancelled},
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
// (continuing the producer's trace via headers), "sends" the notice, records RED
// and acks. Undecodable messages are terminated (never redelivered); malformed
// payloads are dropped (acked) — neither will fix on redelivery.
func (c *Consumer) handle(msg jetstream.Msg) {
	ctx, span := telemetry.StartConsumeSpan(msg.Headers(), msg.Subject())
	defer span.End()
	start := time.Now()
	subject := msg.Subject()

	var env Envelope
	if err := json.Unmarshal(msg.Data(), &env); err != nil {
		slog.ErrorContext(ctx, "notification: undecodable order event; terminating",
			"subject", subject, "err", err)
		span.RecordError(err)
		span.SetStatus(codes.Error, "bad envelope")
		c.metrics.Record(ctx, subject, "error", time.Since(start))
		_ = msg.Term()
		return
	}
	span.SetAttributes(
		attribute.String("order.id", env.OrderID),
		attribute.String("saga.subject", subject),
	)

	var data OrderData
	if err := json.Unmarshal(env.Data, &data); err != nil {
		slog.WarnContext(ctx, "notification: malformed order payload; dropping",
			"order.id", env.OrderID, "err", err)
		c.metrics.Record(ctx, subject, "error", time.Since(start))
		_ = msg.Ack()
		return
	}

	result := "sent"
	switch subject {
	case SubjectConfirmed:
		c.notify(ctx, env.OrderID, data, "confirmed", "Your order is confirmed and on its way.")
	case SubjectCancelled:
		c.notify(ctx, env.OrderID, data, "cancelled", "Your order was cancelled.")
	default:
		// FilterSubjects should prevent this, but stay defensive.
		slog.WarnContext(ctx, "notification: unexpected subject; acking", "subject", subject)
		result = "ignored"
	}

	c.metrics.Record(ctx, subject, result, time.Since(start))
	_ = msg.Ack()
}

// notify "sends" the customer notice for a terminal order. With no real channel
// wired (no new transport — ADR-0003 §7), sending is modeled by a structured log
// plus a notification.sent domain Event carrying the saga trace_id and the order /
// user / status — the fan-out the corpus records.
func (c *Consumer) notify(ctx context.Context, orderID string, data OrderData, status, message string) {
	attrs := []attribute.KeyValue{
		attribute.String("order.id", orderID),
		attribute.String("user.id", data.UserID),
		attribute.String("order.status", status),
		attribute.Int64("order.total_cents", data.TotalCents),
		attribute.String("notification.channel", "email"),
	}
	if data.Reason != "" {
		attrs = append(attrs, attribute.String("cancel.reason", data.Reason))
	}

	slog.InfoContext(ctx, "notification: sent "+status+" notice",
		"order.id", orderID, "user.id", data.UserID, "status", status, "message", message)
	telemetry.Event(ctx, "notification.sent", attrs...)
}
