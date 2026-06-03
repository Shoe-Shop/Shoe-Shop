"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/types";
import { ProductMedia } from "./product-media";

// PDP shows up to three angles derived from the catalogue image:
//   /img/<slug>.png  +  -side.png  +  -top.png
// Missing angles fall back to the branded placeholder, so partial uploads work.
export function PdpGallery({ product }: { product: Product }) {
  const items = useMemo(() => {
    const primary = { label: "3/4", src: product.imageUrl };
    const base = product.imageUrl.replace(/\.png$/i, "");
    if (!product.imageUrl || base === product.imageUrl) return [primary];
    return [
      primary,
      { label: "Side", src: `${base}-side.png` },
      { label: "Top", src: `${base}-top.png` },
    ];
  }, [product.imageUrl]);

  const [active, setActive] = useState(0);
  const current = items[active] ?? items[0];

  return (
    <div className="flex flex-col-reverse gap-4 lg:flex-row">
      <div className={cn("flex gap-3 lg:flex-col", items.length < 2 && "hidden")}>
        {items.map((item, i) => (
          <button
            key={item.label}
            onClick={() => setActive(i)}
            aria-label={`View ${item.label}`}
            className={cn(
              "relative h-20 w-20 shrink-0 overflow-hidden rounded-card border transition-colors",
              active === i ? "border-accent" : "border-border hover:border-fg",
            )}
          >
            <ProductMedia product={product} src={item.src} sizes="80px" className="h-full w-full" />
          </button>
        ))}
      </div>
      <div className="relative aspect-square flex-1 overflow-hidden rounded-card border border-border bg-surface">
        <ProductMedia
          product={product}
          src={current.src}
          priority
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="h-full w-full"
        />
      </div>
    </div>
  );
}
