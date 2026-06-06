//! Payment — the deterministic payment simulator for the v0.3 checkout saga
//! (ADR-0003 §6). A NATS-only saga participant: consumes `payment.authorize` on
//! the PAYMENT JetStream stream, decides authorize/decline by reproducible rules,
//! persists the decision (Postgres), and publishes `payment.authorized` /
//! `payment.declined` back for the Orders orchestrator — keeping the whole saga one
//! correlated trace via traceparent-in-headers. Born MELT-complete (see telemetry).

mod decision;
mod health;
mod natstrace;
mod saga;
mod store;
mod telemetry;

use anyhow::Result;
use async_nats::jetstream::consumer::{pull, AckPolicy};
use async_nats::jetstream::{stream, AckKind};
use futures::StreamExt;

struct Config {
    database_url: String,
    nats_url: String,
    health_addr: String,
}

impl Config {
    fn from_env() -> Self {
        Self {
            database_url: std::env::var("PAYMENT_DATABASE_URL")
                .expect("PAYMENT_DATABASE_URL must be set"),
            nats_url: std::env::var("NATS_URL").unwrap_or_else(|_| "nats://nats:4222".to_string()),
            health_addr: std::env::var("PAYMENT_HEALTH_ADDR")
                .unwrap_or_else(|_| "0.0.0.0:8080".to_string()),
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    // Container healthcheck path: `payment healthcheck` (distroless has no shell).
    if std::env::args().nth(1).as_deref() == Some("healthcheck") {
        return health::probe().await;
    }

    let _telemetry = telemetry::init()?;
    let cfg = Config::from_env();
    let decision_cfg = decision::Config::from_env();

    let pool = store::connect(&cfg.database_url).await?;
    store::migrate(&pool).await?;

    let client = async_nats::connect(&cfg.nats_url).await?;
    let js = async_nats::jetstream::new(client);

    // Ensure the PAYMENT stream (idempotent — Orders may have created it first; the
    // service that consumes commands owns it, ADR-0003 §3).
    js.get_or_create_stream(stream::Config {
        name: "PAYMENT".to_string(),
        subjects: vec!["payment.>".to_string()],
        ..Default::default()
    })
    .await?;

    let payment_stream = js.get_stream("PAYMENT").await?;
    let consumer = payment_stream
        .get_or_create_consumer(
            "payment-authorize-worker",
            pull::Config {
                durable_name: Some("payment-authorize-worker".to_string()),
                filter_subject: "payment.authorize".to_string(),
                ack_policy: AckPolicy::Explicit,
                max_deliver: 5,
                ..Default::default()
            },
        )
        .await?;

    tokio::spawn(health::serve(cfg.health_addr.clone()));

    let metrics = telemetry::Metrics::new();
    tracing::info!(target: "shoeshop/payment", nats = %cfg.nats_url,
        "payment simulator started; consuming payment.authorize");

    let mut messages = consumer.messages().await?;
    while let Some(next) = messages.next().await {
        let msg = match next {
            Ok(m) => m,
            Err(e) => {
                tracing::error!(target: "shoeshop/payment", error = %e, "consume stream error");
                continue;
            }
        };
        if let Err(e) = saga::handle(&js, &pool, &decision_cfg, &metrics, &msg).await {
            tracing::error!(target: "shoeshop/payment", error = %e, "payment handler failed; nak");
            let _ = msg.ack_with(AckKind::Nak(None)).await;
        }
    }
    Ok(())
}
