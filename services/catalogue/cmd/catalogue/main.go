// Command catalogue is the Shoe Shop product catalogue service. It exposes the
// CatalogueService gRPC API backed by PostgreSQL and Meilisearch, and emits the
// four correlated OpenTelemetry signals (MELT) over OTLP/gRPC.
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
	"go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc"
	noopmetric "go.opentelemetry.io/otel/metric/noop"
	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"
	"google.golang.org/grpc/stats"

	cataloguev1 "github.com/shoeshop/shoe-shop/proto/gen/go/catalogue/v1"
	"github.com/shoeshop/shoe-shop/services/catalogue/internal/catalogue"
	"github.com/shoeshop/shoe-shop/services/catalogue/internal/config"
	"github.com/shoeshop/shoe-shop/services/catalogue/internal/search"
	"github.com/shoeshop/shoe-shop/services/catalogue/internal/store"
	"github.com/shoeshop/shoe-shop/services/catalogue/internal/telemetry"
)

func main() {
	// Minimal stdout logger until the MELT stack is wired; replaced below.
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))
	if err := run(); err != nil {
		slog.Error("catalogue exited", "err", err)
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
	searcher := search.New(cfg.MeiliURL, cfg.MeiliKey)
	if err := indexCatalogue(ctx, queries, searcher); err != nil {
		slog.Warn("initial search indexing failed; search may be degraded", "err", err)
	} else {
		slog.Info("search index populated")
	}

	// otelgrpc StatsHandler provides the server spans; its built-in metrics are
	// disabled (no-op meter) so the catalogue's own interceptor owns the RED
	// metrics with controlled buckets and trace_id exemplars. The filter drops
	// health-probe RPCs from traces (and thus the derived span-metrics), matching
	// the RED interceptor's skip — so neither signal is polluted by healthchecks.
	grpcServer := grpc.NewServer(
		grpc.StatsHandler(otelgrpc.NewServerHandler(
			otelgrpc.WithMeterProvider(noopmetric.NewMeterProvider()),
			otelgrpc.WithFilter(func(info *stats.RPCTagInfo) bool {
				return !telemetry.IsHealthMethod(info.FullMethodName)
			}),
		)),
		grpc.ChainUnaryInterceptor(tel.UnaryInterceptor),
	)
	cataloguev1.RegisterCatalogueServiceServer(grpcServer, catalogue.NewServer(queries, searcher))

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
		slog.Info("shutdown signal received; stopping gRPC server")
		grpcServer.GracefulStop()
	}()

	slog.Info("catalogue gRPC server started", "addr", cfg.GRPCAddr, "service", cfg.ServiceName)
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
	// Instrument every query as a span, parented to the active gRPC request.
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

func indexCatalogue(ctx context.Context, q *store.Queries, s *search.Client) error {
	products, err := q.ListAllProducts(ctx)
	if err != nil {
		return err
	}
	docs := make([]search.Doc, 0, len(products))
	for _, p := range products {
		docs = append(docs, search.Doc{
			ID:          p.ID,
			Name:        p.Name,
			Description: p.Description,
			Brand:       p.Brand,
			PriceCents:  p.PriceCents,
			Currency:    p.Currency,
			ImageURL:    p.ImageUrl,
			Tags:        p.Tags,
		})
	}
	return s.Index(ctx, docs)
}
