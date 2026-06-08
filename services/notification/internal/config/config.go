package config

import "os"

// Config holds the notification service's runtime configuration, sourced from the
// environment with sensible local-compose defaults. Notification is a pure NATS
// subscriber: no gRPC port, no database — only NATS and a health surface.
type Config struct {
	ServiceName string
	HealthAddr  string
	NATSURL     string
}

// Load reads configuration from the environment. The OTLP exporter is configured
// separately by the OpenTelemetry SDK directly from the standard OTEL_* variables.
func Load() Config {
	return Config{
		ServiceName: getenv("OTEL_SERVICE_NAME", "notification"),
		HealthAddr:  getenv("NOTIFICATION_HEALTH_ADDR", ":8080"),
		NATSURL:     getenv("NATS_URL", "nats://nats:4222"),
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
