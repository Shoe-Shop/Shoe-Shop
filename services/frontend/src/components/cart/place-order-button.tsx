"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useCart } from "./cart-provider";
import { useShippingAddress } from "@/components/account/shipping-address";
import { createCheckout, BffError } from "@/lib/api";

const DEFAULT_CLASS =
  "w-full rounded-card bg-accent py-4 text-sm font-semibold uppercase tracking-[0.12em] text-accent-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Places the current bag as an order (v0.3 checkout saga) and routes to the live
 * order-status page. Shared by the cart page and the slide-over drawer. Gated on a
 * saved shipping address (mock) so checkout feels real. The bag is cleared once the
 * order is captured (status PENDING); the saga then resolves to CONFIRMED/CANCELLED
 * asynchronously, which the order page polls.
 */
export function PlaceOrderButton({ className }: { className?: string }) {
  const { count, clear, setOpen } = useCart();
  const { hydrated, complete } = useShippingAddress();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocked = !complete;

  const placeOrder = async () => {
    if (submitting || count === 0 || blocked) return;
    setSubmitting(true);
    setError(null);
    try {
      const order = await createCheckout();
      // The order has captured the line items; empty the bag for a clean state.
      await clear().catch(() => {});
      setOpen(false);
      router.push(`/order/${order.id}`);
    } catch (e) {
      setError(
        e instanceof BffError
          ? e.message
          : "Couldn't place your order. Please try again.",
      );
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={placeOrder}
        disabled={submitting || count === 0 || !hydrated || blocked}
        className={className ?? DEFAULT_CLASS}
      >
        {submitting ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Placing order…
          </span>
        ) : (
          "Place order"
        )}
      </button>
      {hydrated && blocked && count > 0 && (
        <p className="mt-2 text-center text-xs text-muted">
          Add a{" "}
          <Link href="/cart" className="text-accent underline-offset-2 hover:underline" onClick={() => setOpen(false)}>
            shipping address
          </Link>{" "}
          to place your order.
        </p>
      )}
      {error && (
        <p className="mt-2 text-center text-xs text-red-500" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
