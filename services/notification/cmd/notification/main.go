// Command notification is the Shoe Shop notification service. It is a PURE NATS
// JetStream subscriber on the checkout saga's terminal order lifecycle events
// (orders.confirmed / orders.cancelled on the ORDERS stream): for each it "sends" a
// customer notice — modeled as a notification.sent domain Event plus a structured
// log — demonstrating fan-out off the saga (ADR-0003 §3/§7). It has no gRPC surface
// and no datastore. It emits the four correlated OpenTelemetry signals (MELT) over
// OTLP/gRPC — including trace context continued across the NATS message so each
// notice is part of the one checkout trace.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"

	"github.com/shoeshop/shoe-shop/services/notification/internal/config"
	"github.com/shoeshop/shoe-shop/services/notification/internal/notify"
	"github.com/shoeshop/shoe-shop/services/notification/internal/telemetry"
)

func main() {
	// Health-probe subcommand: the container healthcheck runs THIS binary with
	// "healthcheck" (the distroless image has no shell/curl), which GETs the local
	// /healthz and maps the result to an exit code. Mirrors Payment's pattern.
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck(config.Load().HealthAddr))
	}

	// Minimal stdout logger until the MELT stack is wired; replaced below.
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))
	if err := run(); err != nil {
		slog.Error("notification exited", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg := config.Load()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	tel, err := telemetry.Setup(ctx, cfg.ServiceName)
	if err != nil {
		return fmt.Errorf("otel setup: %w", err)
	}
	// From here on, logs fan out to stdout AND to Loki with trace_id/span_id.
	slog.SetDefault(tel.Logger)
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = tel.Shutdown(shutdownCtx)
	}()

	// ── NATS JetStream: subscribe to terminal order lifecycle events ──
	nc, err := nats.Connect(cfg.NATSURL, nats.Name(cfg.ServiceName))
	if err != nil {
		return fmt.Errorf("connect nats: %w", err)
	}
	defer func() { _ = nc.Drain() }()
	js, err := jetstream.New(nc)
	if err != nil {
		return fmt.Errorf("jetstream: %w", err)
	}
	consumer := notify.NewConsumer(js, tel.Messages)
	if err := consumer.Start(ctx); err != nil {
		return fmt.Errorf("start notification consumer: %w", err)
	}
	defer consumer.Stop()
	slog.Info("notification subscriber started", "stream", notify.StreamName, "nats", cfg.NATSURL)

	// ── Health surface (container probe) ─────────────────────────────
	// A tiny /healthz HTTP server is the only listener: Notification has no gRPC
	// port, so this is its liveness/readiness surface for the compose healthcheck.
	healthSrv := newHealthServer(cfg.HealthAddr)
	go func() {
		if err := healthSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("health server failed", "err", err)
		}
	}()
	slog.Info("notification health server started", "addr", cfg.HealthAddr, "service", cfg.ServiceName)

	<-ctx.Done()
	slog.Info("shutdown signal received; stopping subscriber and health server")
	consumer.Stop()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = healthSrv.Shutdown(shutdownCtx)
	return nil
}

// newHealthServer builds the minimal /healthz HTTP server.
func newHealthServer(addr string) *http.Server {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	return &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
}

// healthcheck dials the local /healthz and returns a process exit code (0 healthy,
// 1 otherwise). It always dials 127.0.0.1 (IPv4) so it works whether the server
// binds ":8080" or "0.0.0.0:8080".
func healthcheck(addr string) int {
	_, port, err := net.SplitHostPort(addr)
	if err != nil || port == "" {
		port = "8080"
	}
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://127.0.0.1:" + port + "/healthz")
	if err != nil {
		return 1
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}
