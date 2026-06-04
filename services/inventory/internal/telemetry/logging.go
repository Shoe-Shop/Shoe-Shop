package telemetry

import (
	"context"
	"log/slog"
	"os"

	"go.opentelemetry.io/contrib/bridges/otelslog"
	sdklog "go.opentelemetry.io/otel/sdk/log"
)

// newLogger returns an slog.Logger that fans out every record to two sinks:
//
//   - a JSON handler on stdout, so `task logs -- inventory` still works; and
//   - the OTel slog bridge, which converts records to OTLP logs and (when the
//     record is emitted with a request context) stamps the active trace_id and
//     span_id — the trace ↔ log join key from the correlation contract.
//
// Use the *Context logging methods (slog.InfoContext, …) inside request handlers
// and inside the NATS saga handler (whose context carries the consume span) so
// the trace context propagates to the bridge. The bridge is scoped
// `shoeshop/inventory` (scopeName) so the service's own logs share the scope with
// its meter and events (ARCHITECTURE.md §9 convention).
func newLogger(lp *sdklog.LoggerProvider) *slog.Logger {
	stdout := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})
	bridge := otelslog.NewHandler(scopeName, otelslog.WithLoggerProvider(lp))
	return slog.New(fanoutHandler{handlers: []slog.Handler{stdout, bridge}})
}

// fanoutHandler dispatches each record to every underlying handler. slog ships
// no multi-handler, so this small one keeps human-readable container logs and
// correlated OTLP logs in sync from a single logging call.
type fanoutHandler struct {
	handlers []slog.Handler
}

func (h fanoutHandler) Enabled(ctx context.Context, level slog.Level) bool {
	for _, sub := range h.handlers {
		if sub.Enabled(ctx, level) {
			return true
		}
	}
	return false
}

func (h fanoutHandler) Handle(ctx context.Context, r slog.Record) error {
	var err error
	for _, sub := range h.handlers {
		if !sub.Enabled(ctx, r.Level) {
			continue
		}
		// Each handler may mutate the record, so hand it a clone.
		if e := sub.Handle(ctx, r.Clone()); e != nil {
			err = e
		}
	}
	return err
}

func (h fanoutHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	next := make([]slog.Handler, len(h.handlers))
	for i, sub := range h.handlers {
		next[i] = sub.WithAttrs(attrs)
	}
	return fanoutHandler{handlers: next}
}

func (h fanoutHandler) WithGroup(name string) slog.Handler {
	next := make([]slog.Handler, len(h.handlers))
	for i, sub := range h.handlers {
		next[i] = sub.WithGroup(name)
	}
	return fanoutHandler{handlers: next}
}
