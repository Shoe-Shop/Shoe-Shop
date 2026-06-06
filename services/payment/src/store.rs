//! Postgres persistence (sqlx runtime query API — no compile-time macros, so the
//! image builds with no live DB). One row per saga decision; UNIQUE(order_id) makes
//! `record_decision` idempotent: a redelivered `payment.authorize` re-publishes the
//! prior decision instead of charging twice. DB calls run inside an OTel span so
//! they appear as child query spans in the saga trace (parity with Orders' JDBC /
//! Inventory's pgx spans).

use anyhow::Result;
use opentelemetry::trace::Tracer;
use opentelemetry::global;
use sqlx::postgres::PgPoolOptions;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::decision::Outcome;
use crate::telemetry::SCOPE;

pub async fn connect(url: &str) -> Result<PgPool> {
    let pool = PgPoolOptions::new().max_connections(5).connect(url).await?;
    Ok(pool)
}

/// Create the schema (idempotent — CREATE TABLE IF NOT EXISTS).
pub async fn migrate(pool: &PgPool) -> Result<()> {
    sqlx::query(include_str!("../schema.sql")).execute(pool).await?;
    Ok(())
}

/// The persisted decision for an order (the freshly inserted one, or the existing
/// one on a redelivery).
pub struct Persisted {
    pub authorization_id: Uuid,
    pub outcome: Outcome,
}

/// Insert this order's decision idempotently. On conflict (the order was already
/// decided), return the existing row so the saga reply is replayed consistently.
pub async fn record_decision(
    pool: &PgPool,
    order_id: Uuid,
    amount_cents: i64,
    currency: &str,
    outcome: &Outcome,
) -> Result<Persisted> {
    let (status, reason): (&str, Option<&str>) = match outcome {
        Outcome::Authorized => ("AUTHORIZED", None),
        Outcome::Declined(r) => ("DECLINED", Some(r.as_str())),
    };
    let new_auth = Uuid::new_v4();

    let tracer = global::tracer(SCOPE);
    let mut span = tracer.start("db.payments.record_decision");

    let row = sqlx::query(
        "INSERT INTO payments (authorization_id, order_id, amount_cents, currency, status, reason)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (order_id) DO NOTHING
         RETURNING authorization_id, status, reason",
    )
    .bind(new_auth)
    .bind(order_id)
    .bind(amount_cents)
    .bind(currency)
    .bind(status)
    .bind(reason)
    .fetch_optional(pool)
    .await?;

    let persisted = match row {
        Some(r) => from_row(&r),
        None => {
            // Conflict: a decision already exists — read and replay it.
            let r = sqlx::query("SELECT authorization_id, status, reason FROM payments WHERE order_id = $1")
                .bind(order_id)
                .fetch_one(pool)
                .await?;
            from_row(&r)
        }
    };
    opentelemetry::trace::Span::end(&mut span);
    Ok(persisted)
}

fn from_row(r: &sqlx::postgres::PgRow) -> Persisted {
    let authorization_id: Uuid = r.get("authorization_id");
    let status: String = r.get("status");
    let reason: Option<String> = r.get("reason");
    let outcome = match status.as_str() {
        "AUTHORIZED" => Outcome::Authorized,
        _ => Outcome::Declined(reason.unwrap_or_else(|| "declined".to_string())),
    };
    Persisted { authorization_id, outcome }
}
