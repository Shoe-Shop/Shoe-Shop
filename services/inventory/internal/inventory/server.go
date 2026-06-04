// Package inventory implements the InventoryService gRPC server — the SYNC read
// path for stock availability, backed by PostgreSQL (via sqlc). The WRITE path
// (reserve/release during checkout) is asynchronous over NATS and lives in the
// saga package, not here (ADR-0003).
package inventory

import (
	"context"
	"errors"
	"log/slog"

	"github.com/jackc/pgx/v5"
	"go.opentelemetry.io/otel/attribute"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	inventoryv1 "github.com/shoeshop/shoe-shop/proto/gen/go/inventory/v1"
	"github.com/shoeshop/shoe-shop/services/inventory/internal/store"
	"github.com/shoeshop/shoe-shop/services/inventory/internal/telemetry"
)

// Server implements inventoryv1.InventoryServiceServer.
type Server struct {
	inventoryv1.UnimplementedInventoryServiceServer
	queries *store.Queries
}

// NewServer builds an inventory server over the given store.
func NewServer(queries *store.Queries) *Server {
	return &Server{queries: queries}
}

// GetStock returns the stock position for a single product, or NotFound.
func (s *Server) GetStock(ctx context.Context, req *inventoryv1.GetStockRequest) (*inventoryv1.GetStockResponse, error) {
	if req.GetProductId() == "" {
		return nil, status.Error(codes.InvalidArgument, "product_id is required")
	}
	row, err := s.queries.GetStock(ctx, req.GetProductId())
	if errors.Is(err, pgx.ErrNoRows) {
		slog.WarnContext(ctx, "stock not found", "product.id", req.GetProductId())
		return nil, status.Errorf(codes.NotFound, "no stock for product %q", req.GetProductId())
	}
	if err != nil {
		slog.ErrorContext(ctx, "get stock failed", "product.id", req.GetProductId(), "err", err)
		return nil, status.Errorf(codes.Internal, "get stock: %v", err)
	}

	telemetry.Event(ctx, "inventory.stock.viewed",
		attribute.String("product.id", row.ProductID),
		attribute.Int("available", int(available(row))),
		attribute.Int("reserved", int(row.Reserved)),
	)
	return &inventoryv1.GetStockResponse{Stock: toProto(row)}, nil
}

// BatchGetStock returns stock for a set of products (e.g. a shop page). Unknown
// ids are simply absent from the response rather than an error.
func (s *Server) BatchGetStock(ctx context.Context, req *inventoryv1.BatchGetStockRequest) (*inventoryv1.BatchGetStockResponse, error) {
	ids := req.GetProductIds()
	if len(ids) == 0 {
		return &inventoryv1.BatchGetStockResponse{Stock: []*inventoryv1.StockLevel{}}, nil
	}
	rows, err := s.queries.ListStockByIDs(ctx, ids)
	if err != nil {
		slog.ErrorContext(ctx, "batch get stock failed", "requested", len(ids), "err", err)
		return nil, status.Errorf(codes.Internal, "batch get stock: %v", err)
	}
	out := make([]*inventoryv1.StockLevel, 0, len(rows))
	for _, r := range rows {
		out = append(out, toProto(r))
	}

	slog.InfoContext(ctx, "batch stock lookup", "requested", len(ids), "found", len(rows))
	telemetry.Event(ctx, "inventory.stock.batch_viewed",
		attribute.Int("requested", len(ids)),
		attribute.Int("found", len(rows)),
	)
	return &inventoryv1.BatchGetStockResponse{Stock: out}, nil
}

// available is the sellable quantity (on_hand - reserved), clamped at zero.
func available(s store.Stock) int32 {
	if a := s.OnHand - s.Reserved; a > 0 {
		return a
	}
	return 0
}

func toProto(s store.Stock) *inventoryv1.StockLevel {
	return &inventoryv1.StockLevel{
		ProductId: s.ProductID,
		Available: available(s),
		Reserved:  s.Reserved,
	}
}
