"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { Product } from "@/lib/types";
import { productAccent } from "@/lib/product-style";
import { cn } from "@/lib/utils";

/**
 * Product imagery with a graceful, on-brand fallback. Real PNGs (when present
 * in /public/img) render through next/image; until then — and on any load
 * failure — we paint an intentional accent-tinted placeholder rather than a
 * broken image. One image per product (no variants), per the data model.
 */
export function ProductMedia({
  product,
  src,
  className,
  sizes = "(max-width: 768px) 100vw, 33vw",
  priority = false,
}: {
  product: Product;
  /** Override the image source (e.g. a PDP angle); defaults to the catalogue image. */
  src?: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const source = src ?? product.imageUrl;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  const showImage = Boolean(source) && !failed;

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {showImage ? (
        <Image
          key={source}
          src={source}
          alt={product.name}
          fill
          sizes={sizes}
          priority={priority}
          onError={() => setFailed(true)}
          className="object-contain"
        />
      ) : (
        <PlaceholderShoe product={product} />
      )}
    </div>
  );
}

function PlaceholderShoe({ product }: { product: Product }) {
  const { from, to } = productAccent(product.id);
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{
        background: `radial-gradient(120% 120% at 30% 20%, ${from}26, transparent 60%), radial-gradient(120% 120% at 80% 90%, ${to}1f, transparent 55%)`,
      }}
      aria-hidden
    >
      {/* Stylised sneaker mark — a deliberate placeholder, not a broken image. */}
      <svg
        viewBox="0 0 120 60"
        className="w-2/3 max-w-[260px] drop-shadow-xl"
        style={{ color: from }}
      >
        <path
          fill="currentColor"
          fillOpacity="0.92"
          d="M6 40c0-6 4-8 12-8h22c6 0 12-2 20-6 10-5 22-8 32-4 12 5 20 8 22 16 1 5-2 8-8 8H14c-5 0-8-2-8-6Z"
        />
        <path
          fill="#000"
          fillOpacity="0.18"
          d="M6 41h108c0 5-3 7-8 7H14c-5 0-8-3-8-7Z"
        />
      </svg>
      <span className="pointer-events-none absolute bottom-3 left-4 font-display text-[11px] uppercase tracking-[0.25em] text-fg/45">
        {product.brand}
      </span>
    </div>
  );
}
