package config

import "os"

// Config holds the inventory service's runtime configuration, sourced from the
// environment with sensible local-compose defaults.
type Config struct {
	ServiceName string
	GRPCAddr    string
	DatabaseURL string
	NATSURL     string
}

// Load reads configuration from the environment. The OTLP exporter is configured
// separately by the OpenTelemetry SDK directly from the standard OTEL_* variables.
func Load() Config {
	return Config{
		ServiceName: getenv("OTEL_SERVICE_NAME", "inventory"),
		GRPCAddr:    getenv("INVENTORY_GRPC_ADDR", ":9090"),
		DatabaseURL: getenv("INVENTORY_DATABASE_URL", "postgres://postgres:postgres@postgres:5432/inventory?sslmode=disable"),
		NATSURL:     getenv("NATS_URL", "nats://nats:4222"),
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
