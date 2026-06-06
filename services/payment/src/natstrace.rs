//! Trace-context propagation over NATS (ADR-0003 §5) — the Rust mirror of the Go
//! reference `inventory/telemetry/nats.go` and the Java `orders NatsTracing`. The
//! W3C `traceparent` rides NATS message *headers* (never the JSON body), so the
//! whole async saga is ONE correlated trace:
//!
//!   * consume: extract `traceparent` from headers, open a CONSUMER-kind span as a
//!     child of the remote producer span; attach its context so every log/event/DB
//!     span in the handler carries the saga trace_id.
//!   * publish: open a PRODUCER-kind span, inject the active context into the
//!     outgoing headers so the next consumer (Orders) parents to it.

use async_nats::HeaderMap;
use opentelemetry::propagation::{Extractor, Injector};
use opentelemetry::trace::{SpanKind, TraceContextExt, Tracer};
use opentelemetry::Context;

use crate::telemetry::SCOPE;

struct HeaderInjector<'a>(&'a mut HeaderMap);
impl<'a> Injector for HeaderInjector<'a> {
    fn set(&mut self, key: &str, value: String) {
        self.0.insert(key, value.as_str());
    }
}

struct HeaderExtractor<'a>(&'a HeaderMap);
impl<'a> Extractor for HeaderExtractor<'a> {
    fn get(&self, key: &str) -> Option<&str> {
        self.0.get(key).map(|v| v.as_str())
    }
    fn keys(&self) -> Vec<&str> {
        // The W3C TraceContext propagator extracts by explicit key (traceparent/
        // tracestate) and does not iterate keys, so an empty list is sufficient.
        Vec::new()
    }
}

/// Extract the remote span context carried in the message headers (if any).
fn extract(headers: Option<&HeaderMap>) -> Context {
    match headers {
        Some(h) => opentelemetry::global::get_text_map_propagator(|p| p.extract(&HeaderExtractor(h))),
        None => Context::current(),
    }
}

/// Inject the active context into outgoing headers as `traceparent`.
fn inject(cx: &Context, headers: &mut HeaderMap) {
    opentelemetry::global::get_text_map_propagator(|p| p.inject_context(cx, &mut HeaderInjector(headers)));
}

/// Open a CONSUMER span parented to the remote producer (from `headers`) and return
/// the context that carries it. Attach the returned context (`cx.clone().attach()`)
/// for the duration of the handler so logs/events/DB spans inherit the trace_id;
/// end the span with `end(&cx)` when done.
pub fn start_consume(headers: Option<&HeaderMap>, subject: &str) -> Context {
    let parent = extract(headers);
    let tracer = opentelemetry::global::tracer(SCOPE);
    let span = tracer
        .span_builder(format!("consume {subject}"))
        .with_kind(SpanKind::Consumer)
        .start_with_context(&tracer, &parent);
    parent.with_span(span)
}

/// Open a PRODUCER span (child of `cx`), inject its context into fresh headers, and
/// return them ready to publish; the span is ended before returning.
pub fn publish_headers(cx: &Context, subject: &str) -> HeaderMap {
    let tracer = opentelemetry::global::tracer(SCOPE);
    let span = tracer
        .span_builder(format!("publish {subject}"))
        .with_kind(SpanKind::Producer)
        .start_with_context(&tracer, cx);
    let pub_cx = cx.with_span(span);
    let mut headers = HeaderMap::new();
    inject(&pub_cx, &mut headers);
    pub_cx.span().end();
    headers
}

/// End the span carried by a context (e.g. the consume span).
pub fn end(cx: &Context) {
    cx.span().end();
}
