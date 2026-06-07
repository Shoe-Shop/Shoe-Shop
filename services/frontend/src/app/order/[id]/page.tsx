"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import {
  Check,
  CreditCard,
  Boxes,
  ShoppingBag,
  PartyPopper,
  XCircle,
  Loader2,
} from "lucide-react";
import { getOrder, getProduct, BffError } from "@/lib/api";
import type { Order, OrderStatus, Product } from "@/lib/types";
import { formatPrice } from "@/lib/utils";
import { ProductMedia } from "@/components/product/product-media";

// The happy-path saga stages, in order. The order's status maps onto these; a
// CANCELLED order is rendered separately (it can fail at reserve or authorize).
const STAGES: { rank: number; label: string; hint: string; icon: typeof Check }[] = [
  { rank: 1, label: "Order placed", hint: "We received your order", icon: ShoppingBag },
  { rank: 2, label: "Reserving stock", hint: "Holding your items", icon: Boxes },
  { rank: 3, label: "Authorizing payment", hint: "Confirming payment", icon: CreditCard },
  { rank: 4, label: "Confirmed", hint: "Your order is placed", icon: PartyPopper },
];

const RANK: Record<OrderStatus, number> = {
  ORDER_STATUS_UNSPECIFIED: 0,
  ORDER_STATUS_PENDING: 1,
  ORDER_STATUS_RESERVING: 2,
  ORDER_STATUS_AUTHORIZING: 3,
  ORDER_STATUS_CONFIRMED: 4,
  ORDER_STATUS_CANCELLED: 99,
};

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function OrderStatusPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [order, setOrder] = useState<Order | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [polling, setPolling] = useState(true);
  const [products, setProducts] = useState<Record<string, Product>>({});

  // Poll the order until it reaches a terminal state (CONFIRMED / CANCELLED).
  useEffect(() => {
    if (!id) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let polls = 0;

    const tick = async () => {
      try {
        const o = await getOrder(id);
        if (!active) return;
        setOrder(o);
        setNotFound(false);
        const terminal =
          o.status === "ORDER_STATUS_CONFIRMED" ||
          o.status === "ORDER_STATUS_CANCELLED";
        polls += 1;
        if (!terminal && polls < 60) {
          timer = setTimeout(tick, 700);
        } else {
          setPolling(false);
        }
      } catch (e) {
        if (!active) return;
        if (e instanceof BffError && e.status === 404) setNotFound(true);
        polls += 1;
        if (polls < 60) timer = setTimeout(tick, 1000);
        else setPolling(false);
      }
    };

    void tick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id]);

  // Resolve product details for the order line items (image + name).
  useEffect(() => {
    const missing = (order?.items ?? [])
      .map((i) => i.productId)
      .filter((pid) => !products[pid]);
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(missing.map((pid) => getProduct(pid).catch(() => null))).then(
      (resolved) => {
        if (cancelled) return;
        setProducts((prev) => {
          const next = { ...prev };
          for (const p of resolved) if (p) next[p.id] = p;
          return next;
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [order, products]);

  const shortId = useMemo(() => id?.slice(0, 8) ?? "", [id]);
  const status = order?.status ?? "ORDER_STATUS_PENDING";
  const currentRank = RANK[status];
  const cancelled = status === "ORDER_STATUS_CANCELLED";
  const confirmed = status === "ORDER_STATUS_CONFIRMED";

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-5 pb-24 pt-28 sm:px-10 sm:pt-36">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted">
          Order #{shortId}
        </p>
        {polling && !notFound && (
          <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            Live
          </span>
        )}
      </div>

      <h1 className="mt-3 font-display text-5xl text-fg sm:text-6xl">
        {notFound
          ? "Order not found"
          : cancelled
            ? "Order cancelled"
            : confirmed
              ? "Order confirmed"
              : "Placing your order…"}
      </h1>

      {notFound ? (
        <div className="mt-10 rounded-card border border-border bg-surface p-8 text-center">
          <p className="text-muted">
            We couldn&apos;t find that order. It may have expired with the local
            environment.
          </p>
          <Link
            href="/shop"
            className="mt-6 inline-block rounded-card bg-accent px-7 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-accent-fg"
          >
            Back to shop
          </Link>
        </div>
      ) : (
        <>
          {/* Saga progress */}
          {cancelled ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE }}
              className="mt-10 flex items-start gap-4 rounded-card border border-amber-500/40 bg-amber-500/5 p-6"
            >
              <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-amber-500" />
              <div>
                <p className="font-display text-xl text-fg">
                  This order couldn&apos;t be completed
                </p>
                <p className="mt-1 text-sm text-muted">
                  Payment was declined or an item went out of stock, so the order
                  was cancelled and any held stock released. You haven&apos;t been
                  charged.
                </p>
              </div>
            </motion.div>
          ) : (
            <ol className="mt-12 space-y-1">
              {STAGES.map((stage, idx) => {
                const done = currentRank > stage.rank;
                const active = currentRank === stage.rank;
                const Icon = done ? Check : stage.icon;
                const isLast = idx === STAGES.length - 1;
                return (
                  <li key={stage.rank} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <motion.span
                        initial={false}
                        animate={{
                          backgroundColor: done || active ? "var(--accent)" : "transparent",
                          borderColor: done || active ? "var(--accent)" : "var(--border)",
                          scale: active ? 1.08 : 1,
                        }}
                        transition={{ duration: 0.35, ease: EASE }}
                        className="flex h-11 w-11 items-center justify-center rounded-full border"
                      >
                        {active && !done ? (
                          <Loader2 className="h-5 w-5 animate-spin text-accent-fg" />
                        ) : (
                          <Icon
                            className={
                              done || active ? "h-5 w-5 text-accent-fg" : "h-5 w-5 text-muted"
                            }
                          />
                        )}
                      </motion.span>
                      {!isLast && (
                        <span
                          className={`my-1 w-px flex-1 ${
                            done ? "bg-accent" : "bg-border"
                          }`}
                          style={{ minHeight: 28 }}
                        />
                      )}
                    </div>
                    <div className={`pb-6 pt-2 ${done || active ? "" : "opacity-50"}`}>
                      <p className="font-display text-lg text-fg">{stage.label}</p>
                      <p className="text-sm text-muted">{stage.hint}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {/* Order summary */}
          {order && (
            <div className="mt-6 rounded-card border border-border bg-surface p-6">
              <h2 className="font-display text-2xl text-fg">Order summary</h2>
              <ul className="mt-5 divide-y divide-border border-y border-border">
                {order.items.map((line) => {
                  const product = products[line.productId];
                  return (
                    <li key={line.productId} className="flex items-center gap-4 py-4">
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-card border border-border bg-bg">
                        {product && <ProductMedia product={product} sizes="64px" />}
                      </div>
                      <div className="flex-1">
                        <p className="font-display text-base text-fg">
                          {product?.name ?? line.productId}
                        </p>
                        <p className="text-xs text-muted">Qty {line.quantity}</p>
                      </div>
                      <p className="font-display text-base text-fg">
                        {formatPrice(
                          Number(line.unitPriceCents) * line.quantity,
                          order.currency,
                        )}
                      </p>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-5 flex items-center justify-between">
                <span className="font-display text-lg text-fg">Total</span>
                <span className="font-display text-lg text-fg">
                  {formatPrice(Number(order.totalCents), order.currency)}
                </span>
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            <Link
              href="/shop"
              className="rounded-card bg-accent px-7 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-accent-fg"
            >
              Continue shopping
            </Link>
            <Link
              href="/account"
              className="text-xs uppercase tracking-[0.16em] text-muted hover:text-fg"
            >
              View account
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
