//! The deterministic decision engine (ADR-0003 §6). Payment has no real PSP — it
//! decides authorize vs decline by reproducible, env-tunable rules so the saga can
//! generate *labeled, repeatable* payment incidents for the corpus. The default
//! configuration authorizes everything, so the happy path works out of the box.
//!
//! Rule precedence (first match wins):
//!   1. amount band   — decline when amount_cents ∈ [DECLINE_MIN, DECLINE_MAX]
//!   2. failure rate  — decline a deterministic fraction keyed on order_id
//!   3. otherwise     — authorize
//!
//! Determinism: the failure-rate roll hashes the order_id (not a RNG), so the same
//! order always gets the same outcome across restarts — essential for replayable
//! incidents.

use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct Config {
    pub decline_min_cents: Option<i64>,
    pub decline_max_cents: Option<i64>,
    pub failure_rate: f64,
    pub latency_ms: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Outcome {
    Authorized,
    Declined(String), // reason
}

impl Config {
    pub fn from_env() -> Self {
        let parse_i64 = |k: &str| std::env::var(k).ok().and_then(|v| v.trim().parse::<i64>().ok());
        let failure_rate = std::env::var("PAYMENT_FAILURE_RATE")
            .ok()
            .and_then(|v| v.trim().parse::<f64>().ok())
            .unwrap_or(0.0)
            .clamp(0.0, 1.0);
        let latency_ms = std::env::var("PAYMENT_LATENCY_MS")
            .ok()
            .and_then(|v| v.trim().parse::<u64>().ok())
            .unwrap_or(0);
        Self {
            decline_min_cents: parse_i64("PAYMENT_DECLINE_MIN_CENTS"),
            decline_max_cents: parse_i64("PAYMENT_DECLINE_MAX_CENTS"),
            failure_rate,
            latency_ms,
        }
    }

    /// Decide the outcome for an order. Pure + deterministic given (order_id, amount).
    pub fn decide(&self, order_id: &Uuid, amount_cents: i64) -> Outcome {
        // 1. Amount band (both bounds must be configured to arm the rule).
        if let (Some(min), Some(max)) = (self.decline_min_cents, self.decline_max_cents) {
            if amount_cents >= min && amount_cents <= max {
                return Outcome::Declined("insufficient_funds".to_string());
            }
        }
        // 2. Deterministic failure injection keyed on the order id.
        if self.failure_rate > 0.0 && order_fraction(order_id) < self.failure_rate {
            return Outcome::Declined("do_not_honor".to_string());
        }
        // 3. Authorize.
        Outcome::Authorized
    }
}

/// Map an order id to a stable fraction in [0, 1) using its first 8 bytes.
fn order_fraction(order_id: &Uuid) -> f64 {
    let b = order_id.as_bytes();
    let mut n: u64 = 0;
    for i in 0..8 {
        n = (n << 8) | b[i] as u64;
    }
    (n as f64) / (u64::MAX as f64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authorizes_by_default() {
        let cfg = Config { decline_min_cents: None, decline_max_cents: None, failure_rate: 0.0, latency_ms: 0 };
        assert_eq!(cfg.decide(&Uuid::new_v4(), 12_345), Outcome::Authorized);
    }

    #[test]
    fn declines_in_band() {
        let cfg = Config { decline_min_cents: Some(50_000), decline_max_cents: Some(60_000), failure_rate: 0.0, latency_ms: 0 };
        assert!(matches!(cfg.decide(&Uuid::new_v4(), 55_000), Outcome::Declined(_)));
        assert_eq!(cfg.decide(&Uuid::new_v4(), 49_999), Outcome::Authorized);
    }

    #[test]
    fn failure_rate_is_deterministic() {
        let cfg = Config { decline_min_cents: None, decline_max_cents: None, failure_rate: 1.0, latency_ms: 0 };
        let id = Uuid::new_v4();
        assert_eq!(cfg.decide(&id, 100), cfg.decide(&id, 100)); // same id → same outcome
        assert!(matches!(cfg.decide(&id, 100), Outcome::Declined(_))); // rate 1.0 → always decline
    }
}
