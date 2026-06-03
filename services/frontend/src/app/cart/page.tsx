"use client";

import Link from "next/link";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { useCart } from "@/components/cart/cart-provider";
import { useResolvedCart } from "@/components/cart/use-resolved-cart";
import { ProductMedia } from "@/components/product/product-media";
import { formatPrice } from "@/lib/utils";

export default function CartPage() {
  const { add, remove, clear, loading } = useCart();
  const { items, subtotalCents, currency } = useResolvedCart();

  return (
    <div className="mx-auto min-h-screen max-w-[1600px] px-5 pb-24 pt-28 sm:px-10 sm:pt-36">
      <h1 className="mb-10 font-display text-5xl text-fg sm:text-7xl">Your Bag</h1>

      {loading ? (
        <p className="text-muted">Loading your bag…</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-28 text-center">
          <ShoppingBag className="h-12 w-12 text-muted" />
          <p className="font-display text-3xl text-fg">Your bag is empty</p>
          <p className="max-w-sm text-muted">
            Looks like you haven&apos;t added anything yet.
          </p>
          <Link
            href="/shop"
            className="mt-2 rounded-card bg-accent px-7 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-accent-fg"
          >
            Start shopping
          </Link>
        </div>
      ) : (
        <div className="grid gap-12 lg:grid-cols-[1.6fr_1fr]">
          {/* Line items */}
          <ul className="divide-y divide-border border-t border-border">
            {items.map((line) => (
              <li key={line.productId} className="flex gap-5 py-6">
                <Link
                  href={`/products/${line.productId}`}
                  className="relative h-28 w-28 shrink-0 overflow-hidden rounded-card border border-border bg-surface"
                >
                  {line.product && (
                    <ProductMedia product={line.product} sizes="112px" />
                  )}
                </Link>
                <div className="flex flex-1 flex-col">
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted">
                        {line.product?.brand ?? ""}
                      </p>
                      <Link
                        href={`/products/${line.productId}`}
                        className="font-display text-xl text-fg hover:text-accent"
                      >
                        {line.product?.name ?? line.productId}
                      </Link>
                    </div>
                    <button
                      onClick={() => remove(line.productId)}
                      aria-label="Remove item"
                      className="text-muted transition-colors hover:text-accent"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-4">
                    <div className="flex items-center gap-4 rounded-card border border-border px-3 py-2">
                      <button onClick={() => remove(line.productId)} aria-label="Decrease" className="text-fg/70 hover:text-fg">
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="min-w-5 text-center text-sm text-fg">{line.quantity}</span>
                      <button onClick={() => add(line.productId)} aria-label="Increase" className="text-fg/70 hover:text-fg">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="font-display text-xl text-fg">
                      {line.product
                        ? formatPrice(Number(line.product.priceCents) * line.quantity, line.product.currency)
                        : "—"}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Summary */}
          <aside className="h-fit rounded-card border border-border bg-surface p-6 lg:sticky lg:top-28">
            <h2 className="font-display text-2xl text-fg">Order Summary</h2>
            <dl className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd className="text-fg">{formatPrice(subtotalCents, currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Shipping</dt>
                <dd className="text-fg">Calculated at checkout</dd>
              </div>
            </dl>
            <div className="mt-6 flex justify-between border-t border-border pt-6">
              <span className="font-display text-lg text-fg">Total</span>
              <span className="font-display text-lg text-fg">
                {formatPrice(subtotalCents, currency)}
              </span>
            </div>
            {/* Checkout requires the v0.3 write path — boundary only. */}
            <button
              disabled
              className="mt-6 w-full cursor-not-allowed rounded-card bg-accent py-4 text-sm font-semibold uppercase tracking-[0.12em] text-accent-fg opacity-60"
            >
              Checkout — coming soon
            </button>
            <div className="mt-4 flex items-center justify-between">
              <Link href="/shop" className="text-xs uppercase tracking-[0.16em] text-muted hover:text-fg">
                Continue shopping
              </Link>
              <button onClick={() => clear()} className="text-xs uppercase tracking-[0.16em] text-muted hover:text-accent">
                Clear bag
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
