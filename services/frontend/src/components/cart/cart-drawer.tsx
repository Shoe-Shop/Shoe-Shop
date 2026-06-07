"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { useCart } from "./cart-provider";
import { PlaceOrderButton } from "./place-order-button";
import { getProduct } from "@/lib/api";
import type { Product } from "@/lib/types";
import { ProductMedia } from "@/components/product/product-media";
import { formatPrice } from "@/lib/utils";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export function CartDrawer() {
  const { cart, open, setOpen, add, remove, clear } = useCart();
  const [products, setProducts] = useState<Record<string, Product>>({});

  // Resolve product details for the line items (cart stores only id + qty).
  useEffect(() => {
    const ids = cart?.items.map((i) => i.productId) ?? [];
    const missing = ids.filter((id) => !products[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(
      missing.map((id) => getProduct(id).catch(() => null)),
    ).then((resolved) => {
      if (cancelled) return;
      setProducts((prev) => {
        const next = { ...prev };
        for (const p of resolved) if (p) next[p.id] = p;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [cart, products]);

  const items = cart?.items ?? [];
  const subtotalCents = items.reduce((sum, item) => {
    const p = products[item.productId];
    return sum + (p ? Number(p.priceCents) * item.quantity : 0);
  }, 0);
  const currency = items.length
    ? products[items[0].productId]?.currency ?? "USD"
    : "USD";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90]"
          initial="hidden"
          animate="shown"
          exit="hidden"
        >
          {/* Scrim */}
          <motion.button
            aria-label="Close cart"
            onClick={() => setOpen(false)}
            variants={{ hidden: { opacity: 0 }, shown: { opacity: 1 } }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          {/* Panel */}
          <motion.aside
            variants={{ hidden: { x: "100%" }, shown: { x: 0 } }}
            transition={{ duration: 0.45, ease: EASE }}
            className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-border bg-bg shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-5">
              <h2 className="font-display text-xl uppercase tracking-[0.12em] text-fg">
                Your Bag ({items.length})
              </h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-fg transition-opacity hover:opacity-60"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {items.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
                <ShoppingBag className="h-10 w-10 text-muted" />
                <p className="font-display text-2xl text-fg">Your bag is empty</p>
                <Link
                  href="/shop"
                  onClick={() => setOpen(false)}
                  className="mt-2 rounded-card bg-accent px-6 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-accent-fg"
                >
                  Start shopping
                </Link>
              </div>
            ) : (
              <>
                <ul className="flex-1 divide-y divide-border overflow-y-auto px-6">
                  {items.map((item) => {
                    const p = products[item.productId];
                    return (
                      <li key={item.productId} className="flex gap-4 py-5">
                        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-card border border-border bg-surface">
                          {p && <ProductMedia product={p} sizes="80px" />}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[10px] uppercase tracking-[0.18em] text-muted">
                                {p?.brand ?? ""}
                              </p>
                              <p className="truncate font-display text-base text-fg">
                                {p?.name ?? item.productId}
                              </p>
                            </div>
                            <button
                              onClick={() => remove(item.productId)}
                              aria-label="Remove"
                              className="text-muted transition-colors hover:text-accent"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="mt-auto flex items-center justify-between">
                            <div className="flex items-center gap-3 rounded-card border border-border px-2 py-1">
                              <button
                                onClick={() => remove(item.productId)}
                                aria-label="Decrease"
                                className="text-fg/70 hover:text-fg"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="min-w-4 text-center text-sm text-fg">
                                {item.quantity}
                              </span>
                              <button
                                onClick={() => add(item.productId)}
                                aria-label="Increase"
                                className="text-fg/70 hover:text-fg"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <p className="font-display text-base text-fg">
                              {p
                                ? formatPrice(
                                    Number(p.priceCents) * item.quantity,
                                    p.currency,
                                  )
                                : "—"}
                            </p>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="border-t border-border px-6 py-6">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm text-muted">Subtotal</span>
                    <span className="font-display text-xl text-fg">
                      {formatPrice(subtotalCents, currency)}
                    </span>
                  </div>
                  <p className="mb-5 text-xs text-muted">
                    Shipping &amp; taxes calculated at checkout.
                  </p>
                  {/* v0.3 checkout saga: place the order, then route to live status. */}
                  <div className="mb-3">
                    <PlaceOrderButton />
                  </div>
                  <button
                    onClick={() => clear()}
                    className="w-full text-xs uppercase tracking-[0.18em] text-muted transition-colors hover:text-accent"
                  >
                    Clear bag
                  </button>
                </div>
              </>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
