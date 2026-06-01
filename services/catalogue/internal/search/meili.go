// Package search is a thin Meilisearch client built on net/http. Using the REST
// API directly (rather than a vendored SDK) keeps the dependency surface small
// and lets us instrument every call with otelhttp, so each search shows up as a
// child span under the originating gRPC request.
package search

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

// Doc is a product as stored in and returned by the search index. JSON tags
// match the documents indexed in Meilisearch.
type Doc struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Brand       string `json:"brand"`
	PriceCents  int64  `json:"price_cents"`
	Currency    string `json:"currency"`
	ImageURL    string `json:"image_url"`
	Tags        string `json:"tags"`
}

// Client talks to a single Meilisearch instance and index.
type Client struct {
	baseURL string
	apiKey  string
	index   string
	http    *http.Client
}

// New returns a Meilisearch client targeting the "products" index.
func New(baseURL, apiKey string) *Client {
	return &Client{
		baseURL: baseURL,
		apiKey:  apiKey,
		index:   "products",
		http: &http.Client{
			Timeout:   10 * time.Second,
			Transport: otelhttp.NewTransport(http.DefaultTransport),
		},
	}
}

func (c *Client) do(ctx context.Context, method, path string, body, out any) error {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(raw)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusMultipleChoices {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
		return fmt.Errorf("meilisearch %s %s: status %d: %s", method, path, resp.StatusCode, string(msg))
	}
	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}

// Index upserts product documents. Meilisearch infers the "id" primary key.
func (c *Client) Index(ctx context.Context, docs []Doc) error {
	if len(docs) == 0 {
		return nil
	}
	path := fmt.Sprintf("/indexes/%s/documents?primaryKey=id", url.PathEscape(c.index))
	return c.do(ctx, http.MethodPost, path, docs, nil)
}

type searchResponse struct {
	Hits               []Doc `json:"hits"`
	EstimatedTotalHits int   `json:"estimatedTotalHits"`
}

// Search runs a full-text query and returns matching products plus
// Meilisearch's estimate of the total matches.
func (c *Client) Search(ctx context.Context, query string, limit int) ([]Doc, int, error) {
	path := fmt.Sprintf("/indexes/%s/search", url.PathEscape(c.index))
	body := map[string]any{"q": query, "limit": limit}

	var sr searchResponse
	if err := c.do(ctx, http.MethodPost, path, body, &sr); err != nil {
		return nil, 0, err
	}
	return sr.Hits, sr.EstimatedTotalHits, nil
}
