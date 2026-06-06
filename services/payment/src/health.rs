//! Tiny Axum liveness surface (`GET /healthz`) plus the container healthcheck
//! probe. distroless has no shell/curl, so the image's healthcheck runs the binary
//! itself with the `healthcheck` subcommand, which TCP-connects to the health port.

use axum::{routing::get, Router};

/// Serve `GET /healthz` on `addr` (e.g. 0.0.0.0:8080). Runs until the process exits.
pub async fn serve(addr: String) {
    let app = Router::new().route("/healthz", get(|| async { "ok" }));
    match tokio::net::TcpListener::bind(&addr).await {
        Ok(listener) => {
            if let Err(e) = axum::serve(listener, app).await {
                tracing::error!(error = %e, "health server stopped");
            }
        }
        Err(e) => tracing::error!(error = %e, addr = %addr, "failed to bind health server"),
    }
}

/// `payment healthcheck` — exit 0 if the health port is accepting connections.
pub async fn probe() -> anyhow::Result<()> {
    let port = std::env::var("PAYMENT_HEALTH_ADDR")
        .ok()
        .and_then(|a| a.rsplit(':').next().map(str::to_string))
        .unwrap_or_else(|| "8080".to_string());
    let addr = format!("127.0.0.1:{port}");
    match tokio::net::TcpStream::connect(&addr).await {
        Ok(_) => Ok(()),
        Err(e) => {
            eprintln!("payment health probe failed ({addr}): {e}");
            std::process::exit(1);
        }
    }
}
