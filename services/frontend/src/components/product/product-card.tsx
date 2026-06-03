"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Plus } from "lucide-react";
import type { Product } from "@/lib/types";
import { ProductMedia } from "./product-media";
import { useCart } from "@/components/cart/cart-provider";
import { formatPrice } from "@/lib/utils";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export function ProductCard({
  product,
  index = 0,
}: {
  product: Product;
  index?: number;
}) {
  const { add } = useCart();

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, ease: EASE, delay: (index % 4) * 0.06 }}
    >
      <Link href={`/products/${product.id}`} className="group block">
        <div className="relative aspect-square overflow-hidden rounded-card border border-border bg-surface">
          <ProductMedia
            product={product}
            className="h-full w-full transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
          <span className="absolute left-3 top-3 rounded-card bg-bg/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-fg backdrop-blur">
            {product.tags[0]}
          </span>
          <button
            onClick={(e) => {
              e.preventDefault();
              void add(product.id);
            }}
            aria-label={`Add ${product.name} to bag`}
            className="absolute bottom-3 right-3 flex h-11 w-11 translate-y-2 items-center justify-center rounded-full bg-accent text-accent-fg opacity-0 shadow-lg transition-all duration-300 hover:scale-110 group-hover:translate-y-0 group-hover:opacity-100"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              {product.brand}
            </p>
            <h3 className="mt-1 truncate font-display text-lg text-fg">
              {product.name}
            </h3>
          </div>
          <p className="shrink-0 font-display text-lg text-fg">
            {formatPrice(product.priceCents, product.currency)}
          </p>
        </div>
      </Link>
    </motion.article>
  );
}
