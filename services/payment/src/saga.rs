//! The payment saga handler. Consumes `payment.authorize` on the PAYMENT stream,
//! runs the deterministic decision, persists it idempotently, and publishes
//! `payment.authorized` / `payment.declined` back for the Orders orchestrator —
//! all inside one CONSUMER span parented to the remote producer, so the whole hop
//! is part of the single saga trace (ADR-0003 §5). The reply uses the shared JSON
//! envelope (§4); `traceparent` rides the headers.
//!
//! Async correlation: the work runs inside `FutureExt::with_context(cx)`, which
//! re-attaches the OTel context on every poll. This is required (not optional) —
//! a plain thread-local `Context::attach()` guard does NOT survive `.await`
//! thread-hops under tokio's multi-thread runtime, so logs/events emitted after an
//! await would otherwise lose the saga trace_id.

use std::time::{Duration, Instant};

use anyhow::{anyhow, Result};
use async_nats::jetstream::{AckKind, Context as JetStream, Message};
use opentelemetry::trace::{FutureExt, Status, TraceContextExt};
use opentelemetry::{Context, KeyValue};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::decision::Outcome;
use crate::natstrace;
use crate::store;
use crate::{decision::Config, telemetry::Metrics};

/// Handle one consumed message. Opens the CONSUMER span, runs the work with that
/// context attached across all awaits, then ends the span. Returns Err only on a
/// transient failure the caller should Nak for redelivery.
pub async fn handle(
    js: &JetStream,
    pool: &sqlx::PgPool,
    cfg: &Config,
    metrics: &Metrics,
    msg: &Message,
) -> Result<()> {
    let subject = msg.subject.to_string();
    let cx = natstrace::start_consume(msg.headers.as_ref(), &subject);
    let res = process(js, pool, cfg, metrics, msg, subject)
        .with_context(cx.clone())
        .await;
    natstrace::end(&cx);
    res
}

async fn process(
    js: &JetStream,
    pool: &sqlx::PgPool,
    cfg: &Config,
    metrics: &Metrics,
    msg: &Message,
    subject: String,
) -> Result<()> {
    let t0 = Instant::now();

    // Parse the ADR-0003 envelope. An undecodable body will never succeed → Term.
    let env: Value = match serde_json::from_slice(&msg.payload) {
        Ok(v) => v,
        Err(e) => {
            Context::current().span().set_status(Status::error("bad envelope"));
            tracing::error!(target: "shoeshop/payment", error = %e, subject = %subject,
                "undecodable payment command; terminating");
            let _ = msg.ack_with(AckKind::Term).await;
            return Ok(());
        }
    };
    let order_id = match env.get("order_id").and_then(Value::as_str).map(Uuid::parse_str) {
        Some(Ok(id)) => id,
        _ => {
            tracing::error!(target: "shoeshop/payment", subject = %subject,
                "payment command missing/invalid order_id; terminating");
            let _ = msg.ack_with(AckKind::Term).await;
            return Ok(());
        }
    };
    let data = env.get("data").cloned().unwrap_or(Value::Null);
    let amount_cents = data.get("amount_cents").and_then(Value::as_i64).unwrap_or(0);
    let currency = data.get("currency").and_then(Value::as_str).unwrap_or("USD").to_string();

    {
        let cur = Context::current();
        let span = cur.span();
        span.set_attribute(KeyValue::new("order.id", order_id.to_string()));
        span.set_attribute(KeyValue::new("payment.amount_cents", amount_cents));
    }
    tracing::info!(target: "shoeshop/payment", order_id = %order_id, amount_cents,
        currency = %currency, "authorizing payment");

    // Inject deterministic processing latency (latency-spike incidents).
    if cfg.latency_ms > 0 {
        tokio::time::sleep(Duration::from_millis(cfg.latency_ms)).await;
    }

    // Decide, then persist idempotently (a redelivery replays the stored decision).
    let outcome = cfg.decide(&order_id, amount_cents);
    let persisted = store::record_decision(pool, order_id, amount_cents, &currency, &outcome)
        .await
        .map_err(|e| anyhow!("persist decision: {e}"))?;

    // Publish the reply event for the Orders orchestrator.
    let (reply_subject, reply_data, result_label) = match &persisted.outcome {
        Outcome::Authorized => (
            "payment.authorized",
            json!({ "authorization_id": persisted.authorization_id.to_string() }),
            "authorized",
        ),
        Outcome::Declined(reason) => ("payment.declined", json!({ "reason": reason }), "declined"),
    };
    publish_reply(js, reply_subject, order_id, reply_data)
        .await
        .map_err(|e| anyhow!("publish {reply_subject}: {e}"))?;

    // Domain events (scope shoeshop/payment; OTel EventName via `name:`, and the
    // event name is also the log body — matching the other services' convention).
    match &persisted.outcome {
        Outcome::Authorized => tracing::info!(
            name: "payment.authorized", target: "shoeshop/payment",
            order_id = %order_id, authorization_id = %persisted.authorization_id,
            amount_cents, currency = %currency, "payment.authorized"),
        Outcome::Declined(reason) => tracing::warn!(
            name: "payment.declined", target: "shoeshop/payment",
            order_id = %order_id, amount_cents, reason = %reason, "payment.declined"),
    }

    // RED.
    let attrs = [
        KeyValue::new("subject", subject.clone()),
        KeyValue::new("result", result_label),
    ];
    metrics.requests.add(1, &attrs);
    metrics.duration.record(t0.elapsed().as_secs_f64(), &attrs);

    msg.ack().await.map_err(|e| anyhow!("ack: {e}"))?;
    Ok(())
}

/// Publish a reply event wrapped in the ADR-0003 envelope, with `traceparent`
/// injected into the headers (PRODUCER span child of the current consume span).
async fn publish_reply(js: &JetStream, subject: &str, order_id: Uuid, data: Value) -> Result<()> {
    let env = json!({
        "event_id": Uuid::new_v4().to_string(),
        "type": subject,
        "occurred_at": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        "order_id": order_id.to_string(),
        "data": data,
    });
    let headers = natstrace::publish_headers(&Context::current(), subject);
    let payload: bytes::Bytes = serde_json::to_vec(&env)?.into();
    js.publish_with_headers(subject.to_string(), headers, payload)
        .await?
        .await?;
    Ok(())
}
