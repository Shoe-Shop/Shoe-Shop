"use client";

import { useEffect, useState } from "react";
import { getProduct } from "@/lib/api";
import type { CartItem, Product } from "@/lib/types";
import { useCart } from "./cart-provider";

export interface ResolvedLine extends CartItem {
  product?: Product;
}

/** Joins cart line items (id + qty) to their product details + computes totals. */
export function useResolvedCart() {
  const { cart } = useCart();
  const [products, setProducts] = useState<Record<string, Product>>({});

  useEffect(() => {
    const missing = (cart?.items ?? [])
      .map((i) => i.productId)
      .filter((id) => !products[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(missing.map((id) => getProduct(id).catch(() => null))).then(
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
  }, [cart, products]);

  const items: ResolvedLine[] = (cart?.items ?? []).map((i) => ({
    ...i,
    product: products[i.productId],
  }));
  const subtotalCents = items.reduce(
    (sum, i) => sum + (i.product ? Number(i.product.priceCents) * i.quantity : 0),
    0,
  );
  const currency = items.find((i) => i.product)?.product?.currency ?? "USD";

  return { items, subtotalCents, currency };
}
