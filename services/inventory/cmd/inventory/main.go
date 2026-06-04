// Command inventory is the Shoe Shop stock service. It exposes the
// InventoryService gRPC read path (availability) backed by PostgreSQL, runs the
// inventory side of the checkout saga over NATS JetStream (reserve/release →
// reserved/rejected), and emits the four correlated OpenTelemetry signals (MELT)
// over OTLP/gRPC — including trace context propagated across NATS messages so the
// asynchronous saga is one trace (ADR-0003).
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/exaring/otelpgx"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	"go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc"
	noopmetric "go.opentelemetry.io/otel/metric/noop"
	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"
	"google.golang.org/grpc/stats"

	inventoryv1 "github.com/shoeshop/shoe-shop/proto/gen/go/inventory/v1"
	"github.com/shoeshop/shoe-shop/services/inventory/internal/config"
	"github.com/shoeshop/shoe-shop/services/inventory/internal/inventory"
	"github.com/shoeshop/shoe-shop/services/inventory/internal/saga"
	"github.com/shoeshop/shoe-shop/services/inventory/internal/store"
	"github.com/shoeshop/shoe-shop/services/inventory/internal/telemetry"
)

func main() {
	// Minimal stdout logger until the MELT stack is wired; replaced below.
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))
	if err := run(); err != nil {
		slog.Error("inventory exited", "err", err)
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

	pool, err := newPool(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	if err := waitForDB(ctx, pool); err != nil {
		return fmt.Errorf("wait for database: %w", err)
	}
	if err := store.Migrate(ctx, pool); err != nil {
		return fmt.Errorf("apply migrations: %w", err)
	}
	slog.Info("database ready and migrated")

	queries := store.New(pool)

	// ── NATS JetStream: the async checkout saga (reserve/release) ─────
	nc, err := nats.Connect(cfg.NATSURL, nats.Name(cfg.ServiceName))
	if err != nil {
		return fmt.Errorf("connect nats: %w", err)
	}
	defer func() { _ = nc.Drain() }()
	js, err := jetstream.New(nc)
	if err != nil {
		return fmt.Errorf("jetstream: %w", err)
	}
	consumer := saga.NewConsumer(js, pool, queries)
	if err := consumer.Start(ctx); err != nil {
		return fmt.Errorf("start saga consumer: %w", err)
	}
	defer consumer.Stop()
	slog.Info("inventory saga consumer started", "stream", saga.StreamName, "nats", cfg.NATSURL)

	// ── gRPC server (sync availability read path) ────────────────────
	// otelgrpc StatsHandler provides the server spans; its built-in metrics are
	// disabled (no-op meter) so inventory's own interceptor owns the RED metrics
	// with controlled buckets and trace_id exemplars. The filter drops health-probe
	// RPCs from traces (and thus derived span-metrics), matching the RED skip.
	grpcServer := grpc.NewServer(
		grpc.StatsHandler(otelgrpc.NewServerHandler(
			otelgrpc.WithMeterProvider(noopmetric.NewMeterProvider()),
			otelgrpc.WithFilter(func(info *stats.RPCTagInfo) bool {
				return !telemetry.IsHealthMethod(info.FullMethodName)
			}),
		)),
		grpc.ChainUnaryInterceptor(tel.UnaryInterceptor),
	)
	inventoryv1.RegisterInventoryServiceServer(grpcServer, inventory.NewServer(queries))

	healthSrv := health.NewServer()
	healthSrv.SetServingStatus("", healthpb.HealthCheckResponse_SERVING)
	healthSrv.SetServingStatus(cfg.ServiceName, healthpb.HealthCheckResponse_SERVING)
	healthpb.RegisterHealthServer(grpcServer, healthSrv)
	reflection.Register(grpcServer)

	lis, err := net.Listen("tcp", cfg.GRPCAddr)
	if err != nil {
		return fmt.Errorf("listen on %s: %w", cfg.GRPCAddr, err)
	}

	go func() {
		<-ctx.Done()
		slog.Info("shutdown signal received; stopping saga consumer and gRPC server")
		consumer.Stop()
		grpcServer.GracefulStop()
	}()

	slog.Info("inventory gRPC server started", "addr", cfg.GRPCAddr, "service", cfg.ServiceName)
	if err := grpcServer.Serve(lis); err != nil && !errors.Is(err, grpc.ErrServerStopped) {
		return fmt.Errorf("serve: %w", err)
	}
	return nil
}

func newPool(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	pgxCfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	// Instrument every query as a span, parented to the active gRPC request or
	// the saga consume span — so reservation SQL appears inside the saga trace.
	pgxCfg.ConnConfig.Tracer = otelpgx.NewTracer()
	pool, err := pgxpool.NewWithConfig(ctx, pgxCfg)
	if err != nil {
		return nil, fmt.Errorf("create pgx pool: %w", err)
	}
	return pool, nil
}

func waitForDB(ctx context.Context, pool *pgxpool.Pool) error {
	deadline := time.Now().Add(30 * time.Second)
	for {
		err := pool.Ping(ctx)
		if err == nil {
			return nil
		}
		if time.Now().After(deadline) {
			return err
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Second):
		}
	}
}
