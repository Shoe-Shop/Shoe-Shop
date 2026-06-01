// Package catalogue implements the CatalogueService gRPC server. Reads of a
// single product or the full list come from PostgreSQL (via sqlc); free-text
// search is delegated to Meilisearch.
package catalogue

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	cataloguev1 "github.com/shoeshop/shoe-shop/proto/gen/go/catalogue/v1"
	"github.com/shoeshop/shoe-shop/services/catalogue/internal/search"
	"github.com/shoeshop/shoe-shop/services/catalogue/internal/store"
)

const (
	defaultPageSize = 20
	maxPageSize     = 100
)

// Server implements cataloguev1.CatalogueServiceServer.
type Server struct {
	cataloguev1.UnimplementedCatalogueServiceServer
	queries *store.Queries
	search  *search.Client
}

// NewServer builds a catalogue server over the given store and search client.
func NewServer(queries *store.Queries, searcher *search.Client) *Server {
	return &Server{queries: queries, search: searcher}
}

// ListProducts returns a page of the catalogue, ordered by name.
func (s *Server) ListProducts(ctx context.Context, req *cataloguev1.ListProductsRequest) (*cataloguev1.ListProductsResponse, error) {
	all, err := s.queries.ListAllProducts(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "list products: %v", err)
	}

	pageSize := int(req.GetPageSize())
	if pageSize <= 0 || pageSize > maxPageSize {
		pageSize = defaultPageSize
	}
	page := int(req.GetPage())
	if page <= 0 {
		page = 1
	}

	start := (page - 1) * pageSize
	if start > len(all) {
		start = len(all)
	}
	end := start + pageSize
	if end > len(all) {
		end = len(all)
	}

	products := make([]*cataloguev1.Product, 0, end-start)
	for _, p := range all[start:end] {
		products = append(products, storeToProto(p))
	}
	return &cataloguev1.ListProductsResponse{
		Products: products,
		Total:    int32(len(all)),
	}, nil
}

// GetProduct returns a single product by id, or NotFound.
func (s *Server) GetProduct(ctx context.Context, req *cataloguev1.GetProductRequest) (*cataloguev1.GetProductResponse, error) {
	if req.GetId() == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}
	p, err := s.queries.GetProduct(ctx, req.GetId())
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, status.Errorf(codes.NotFound, "product %q not found", req.GetId())
	}
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get product: %v", err)
	}
	return &cataloguev1.GetProductResponse{Product: storeToProto(p)}, nil
}

// SearchProducts runs a full-text query against the Meilisearch index.
func (s *Server) SearchProducts(ctx context.Context, req *cataloguev1.SearchProductsRequest) (*cataloguev1.SearchProductsResponse, error) {
	limit := int(req.GetLimit())
	if limit <= 0 || limit > maxPageSize {
		limit = defaultPageSize
	}
	hits, total, err := s.search.Search(ctx, req.GetQuery(), limit)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "search products: %v", err)
	}
	products := make([]*cataloguev1.Product, 0, len(hits))
	for _, d := range hits {
		products = append(products, docToProto(d))
	}
	return &cataloguev1.SearchProductsResponse{
		Products:       products,
		EstimatedTotal: int32(total),
	}, nil
}

func storeToProto(p store.Product) *cataloguev1.Product {
	return &cataloguev1.Product{
		Id:          p.ID,
		Name:        p.Name,
		Description: p.Description,
		Brand:       p.Brand,
		PriceCents:  p.PriceCents,
		Currency:    p.Currency,
		ImageUrl:    p.ImageUrl,
		Tags:        splitTags(p.Tags),
	}
}

func docToProto(d search.Doc) *cataloguev1.Product {
	return &cataloguev1.Product{
		Id:          d.ID,
		Name:        d.Name,
		Description: d.Description,
		Brand:       d.Brand,
		PriceCents:  d.PriceCents,
		Currency:    d.Currency,
		ImageUrl:    d.ImageURL,
		Tags:        splitTags(d.Tags),
	}
}

func splitTags(s string) []string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	tags := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			tags = append(tags, t)
		}
	}
	return tags
}
