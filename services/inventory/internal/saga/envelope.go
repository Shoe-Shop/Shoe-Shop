// Package saga runs the inventory side of the checkout saga over NATS JetStream:
// it consumes reserve/release commands and publishes reserved/rejected reply
// events that the Orders orchestrator awaits (ADR-0003). Trace context rides the
// NATS message headers (telemetry.InjectTrace / StartConsumeSpan) so the whole
// asynchronous saga is one correlated trace.
package saga

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Stream + subject names for the INVENTORY stream (ADR-0003 §3). Inventory
// CONSUMES the command subjects and PUBLISHES the reply-event subjects; Orders
// consumes the replies.
const (
	StreamName = "INVENTORY"

	SubjectReserve  = "inventory.reserve"  // command  (consumed)
	SubjectRelease  = "inventory.release"  // command  (consumed, compensation)
	SubjectReserved = "inventory.reserved" // event    (published → Orders)
	SubjectRejected = "inventory.rejected" // event    (published → Orders)
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

// Item is a single line of an order: a product and how many units.
type Item struct {
	ProductID string `json:"product_id"`
	Quantity  int32  `json:"quantity"`
}

// ItemsData is the payload for both inventory.reserve and inventory.release.
type ItemsData struct {
	Items []Item `json:"items"`
}

// RejectedData is the inventory.rejected payload.
type RejectedData struct {
	Reason    string `json:"reason"`
	ProductID string `json:"product_id"`
}

// newEnvelope builds a reply envelope of the given type for an order.
func newEnvelope(typ, orderID string, data any) (Envelope, error) {
	b, err := json.Marshal(data)
	if err != nil {
		return Envelope{}, err
	}
	return Envelope{
		EventID:    uuid.NewString(),
		Type:       typ,
		OccurredAt: time.Now().UTC(),
		OrderID:    orderID,
		Data:       b,
	}, nil
}
