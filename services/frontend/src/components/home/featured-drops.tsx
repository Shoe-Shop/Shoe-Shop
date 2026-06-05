"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Plus } from "lucide-react";
import type { Product } from "@/lib/types";
import { productAccent } from "@/lib/product-style";
import { ProductMedia } from "@/components/product/product-media";
import { useCart } from "@/components/cart/cart-provider";
import { formatPrice } from "@/lib/utils";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/**
 * Editorial "Latest Drops" feature: one hero product on the left at large size,
 * two stacked products on the right. Painted entirely from semantic variables +
 * per-product accents, so it reads coherently across every skin (Dark / Light /
 * Colorful). The shop grid stays the canonical grid; this is the spotlight.
 */
export function FeaturedDrops({ products }: { products: Product[] }) {
  const [big, ...rest] = products.slice(0, 3);
  if (!big) return null;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <FeaturedBig product={big} className="lg:col-span-7" />
      <div className="grid grid-cols-1 gap-5 lg:col-span-5 lg:grid-rows-2">
        {rest.map((product, i) => (
          <FeaturedSmall key={product.id} product={product} index={i} />
        ))}
      </div>
    </div>
  );
}

function FeaturedBig({
  product,
  className,
}: {
  product: Product;
  className?: string;
}) {
  const { add } = useCart();
  const accent = productAccent(product.id);

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, ease: EASE }}
      className={className}
    >
      <Link
        href={`/products/${product.id}`}
        className="group relative block aspect-[4/3] h-full overflow-hidden rounded-card border border-border bg-surface lg:aspect-[16/11]"
      >
        {/* Per-product accent glow behind the shoe. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(60% 60% at 50% 42%, ${accent.from}33, transparent 70%)`,
          }}
        />

        <div className="absolute inset-0 flex items-center justify-center p-10 sm:p-14">
          <ProductMedia
            product={product}
            className="h-full w-full transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
            sizes="(max-width: 1024px) 100vw, 58vw"
          />
        </div>

        {/* Bottom scrim keeps the title legible over any imagery. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-surface via-surface/70 to-transparent" />

        <span className="absolute left-5 top-5 rounded-card bg-bg/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-fg backdrop-blur sm:left-7 sm:top-7">
          {product.tags[0]}
        </span>

        <button
          onClick={(e) => {
            e.preventDefault();
            void add(product.id);
          }}
          aria-label={`Add ${product.name} to bag`}
          className="absolute right-5 top-5 flex h-11 w-11 translate-y-2 items-center justify-center rounded-full bg-accent text-accent-fg opacity-0 shadow-lg transition-all duration-300 hover:scale-110 group-hover:translate-y-0 group-hover:opacity-100 sm:right-7 sm:top-7"
        >
          <Plus className="h-5 w-5" />
        </button>

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-6 sm:p-8">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              {product.brand}
            </p>
            <h3 className="mt-1 font-display text-3xl leading-[0.95] text-fg sm:text-5xl">
              {product.name}
            </h3>
          </div>
          <p className="shrink-0 font-display text-xl text-fg sm:text-3xl">
            {formatPrice(product.priceCents, product.currency)}
          </p>
        </div>
      </Link>
    </motion.article>
  );
}

function FeaturedSmall({
  product,
  index,
}: {
  product: Product;
  index: number;
}) {
  const { add } = useCart();
  const accent = productAccent(product.id);

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, ease: EASE, delay: 0.08 + index * 0.08 }}
    >
      <Link
        href={`/products/${product.id}`}
        className="group relative flex aspect-[16/9] h-full overflow-hidden rounded-card border border-border bg-surface lg:aspect-auto"
      >
        {/* Square image stage on the left. */}
        <div className="relative aspect-square h-full shrink-0">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(70% 70% at 50% 45%, ${accent.from}2e, transparent 72%)`,
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center p-5">
            <ProductMedia
              product={product}
              className="h-full w-full transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
              sizes="(max-width: 1024px) 45vw, 22vw"
            />
          </div>
          <span className="absolute left-3 top-3 rounded-card bg-bg/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-fg backdrop-blur">
            {product.tags[0]}
          </span>
        </div>

        {/* Copy on the right. */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            {product.brand}
          </p>
          <h3 className="truncate font-display text-xl text-fg sm:text-2xl">
            {product.name}
          </h3>
          <p className="mt-1 font-display text-lg text-fg">
            {formatPrice(product.priceCents, product.currency)}
          </p>
        </div>

        <button
          onClick={(e) => {
            e.preventDefault();
            void add(product.id);
          }}
          aria-label={`Add ${product.name} to bag`}
          className="absolute bottom-4 right-4 flex h-10 w-10 translate-y-2 items-center justify-center rounded-full bg-accent text-accent-fg opacity-0 shadow-lg transition-all duration-300 hover:scale-110 group-hover:translate-y-0 group-hover:opacity-100"
        >
          <Plus className="h-4 w-4" />
        </button>
      </Link>
    </motion.article>
  );
}
