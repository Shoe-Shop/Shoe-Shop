// Package notify runs the Notification side of the checkout saga over NATS
// JetStream: a PURE subscriber on the ORDERS stream's terminal lifecycle events
// (orders.confirmed / orders.cancelled). It "sends" a confirmation/cancellation
// notice — modeled here as an emitted notification.sent domain Event plus a
// structured log — demonstrating fan-out off the saga (ADR-0003 §3/§7). No new
// transport, no datastore: it publishes nothing back to NATS and persists nothing.
// Trace context rides the NATS message headers (telemetry.StartConsumeSpan) so
// each notification joins the one checkout trace.
package notify

import (
	"encoding/json"
	"time"
)

// Stream + subject names. Notification CONSUMES the terminal lifecycle events on
// the ORDERS stream (ADR-0003 §3); Orders OWNS and publishes them.
const (
	StreamName = "ORDERS"

	SubjectConfirmed = "orders.confirmed" // event (consumed)
	SubjectCancelled = "orders.cancelled" // event (consumed)
)

// Envelope is the JSON message envelope shared by every saga subject
// (ADR-0003 §4). The W3C traceparent rides NATS headers, never this body.
type Envelope struct {
	EventID    string          `json:"event_id"`
	Type       string          `json:"type"`
	OccurredAt time.Time       `json:"occurred_at"`
	OrderID    string          `json:"order_id"`
	Data       json.RawMessage `json:"data"`
}

// OrderData is the payload Orders publishes on orders.confirmed / orders.cancelled
// (SagaOrchestrator): the shopper, the amount, and — for cancellations — the
// reason (e.g. "payment_declined", "inventory_insufficient_stock").
type OrderData struct {
	UserID     string `json:"user_id"`
	TotalCents int64  `json:"total_cents"`
	Currency   string `json:"currency"`
	Reason     string `json:"reason,omitempty"`
}
