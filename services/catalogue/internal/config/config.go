package config

import "os"

// Config holds the catalogue service's runtime configuration, sourced from the
// environment with sensible local-compose defaults.
type Config struct {
	ServiceName string
	GRPCAddr    string
	DatabaseURL string
	MeiliURL    string
	MeiliKey    string
}

// Load reads configuration from the environment. The OTLP exporter is
// configured separately by the OpenTelemetry SDK directly from the standard
// OTEL_* environment variables.
func Load() Config {
	return Config{
		ServiceName: getenv("OTEL_SERVICE_NAME", "catalogue"),
		GRPCAddr:    getenv("CATALOGUE_GRPC_ADDR", ":9090"),
		DatabaseURL: getenv("CATALOGUE_DATABASE_URL", "postgres://postgres:postgres@postgres:5432/catalogue?sslmode=disable"),
		MeiliURL:    getenv("MEILI_URL", "http://meilisearch:7700"),
		MeiliKey:    getenv("MEILI_MASTER_KEY", "shoeshop-dev-master-key"),
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
