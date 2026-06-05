"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Plus } from "lucide-react";
import type { Product } from "@/lib/types";
import { productAccent } from "@/lib/product-style";
import { formatPrice } from "@/lib/utils";
import { ProductMedia } from "@/components/product/product-media";
import { useCart } from "@/components/cart/cart-provider";

const AUTOPLAY_MS = 5000;
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

// Fixed orbit "slots" for the revolving hero (4 featured shoes). Each shoe
// animates between these as the carousel advances, so the secondary shoes sit
// small and far out in open space and grow as they come to the front — never
// overlapping or getting clipped by the centre shoe. x / y are percentages of
// the stage (negative y = up). The cycle a shoe travels is 0 → 3 → 2 → 1 → 0:
// front-centre → left → upper-left (farthest) → upper-right (incoming) → front.
const HERO_SLOTS = [
  { x: 0, y: 2, scale: 1, opacity: 1, z: 40 }, //   0 front — centre, full size
  { x: 46, y: -44, scale: 0.3, opacity: 0.72, z: 22 }, // 1 incoming — upper right
  { x: -20, y: -34, scale: 0.24, opacity: 0.5, z: 16 }, // 2 farthest — upper left
  { x: -50, y: -4, scale: 0.4, opacity: 0.82, z: 26 }, // 3 outgoing — left, mid
] as const;

export function Hero({ products }: { products: Product[] }) {
  const featured = products.slice(0, 4);
  const [index, setIndex] = useState(0);
  const { add } = useCart();

  const go = useCallback(
    (next: number) => setIndex(((next % featured.length) + featured.length) % featured.length),
    [featured.length],
  );

  useEffect(() => {
    if (featured.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % featured.length), AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [featured.length]);

  if (featured.length === 0) return null;
  const active = featured[index];
  const accent = productAccent(active.id);

  return (
    <section
      className="relative flex min-h-screen flex-col overflow-hidden bg-bg pt-16 sm:pt-20"
      style={
        {
          "--shoe-from": accent.from,
          "--shoe-to": accent.to,
        } as CSSProperties
      }
    >
      {/* Colorful skin only: full-background wash tinted by the featured shoe
          (gated + tweened in globals.css via [data-skin="brutalist"]). */}
      <div className="hero-wash pointer-events-none absolute inset-0" />

      {/* Accent glow — recolours per featured shoe. */}
      <AnimatePresence mode="popLayout">
        <motion.div
          key={`glow-${active.id}`}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 1.2, ease: EASE }}
          className="pointer-events-none absolute right-[-10%] top-1/2 h-[80vh] w-[80vh] -translate-y-1/2 rounded-full blur-[120px]"
          style={{ background: `radial-gradient(circle, ${accent.from}66, transparent 65%)` }}
        />
      </AnimatePresence>
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.4]" />

      <div className="relative mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 items-center gap-8 px-5 py-10 sm:px-10 lg:grid-cols-2">
        {/* Copy */}
        <div className="relative z-10 order-2 lg:order-1">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE }}
            className="mb-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-muted"
          >
            <span className="inline-block h-px w-10 bg-accent" />
            2026 Performance Index
          </motion.p>

          <div className="relative">
            <AnimatePresence mode="wait">
              <motion.h1
                key={active.id}
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.6, ease: EASE }}
                className="font-display text-[15vw] font-bold leading-[0.86] text-fg sm:text-[11vw] lg:text-[7.5vw]"
              >
                {active.name}
              </motion.h1>
            </AnimatePresence>
          </div>

          <AnimatePresence mode="wait">
            <motion.p
              key={`desc-${active.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mt-6 max-w-md text-base leading-relaxed text-muted"
            >
              {active.description}
            </motion.p>
          </AnimatePresence>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href={`/products/${active.id}`}
              className="group inline-flex items-center gap-3 rounded-card bg-fg px-7 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-bg transition-transform hover:scale-[1.02] active:scale-95"
            >
              View
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <button
              onClick={() => add(active.id)}
              className="inline-flex items-center gap-2 rounded-card border border-border px-7 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-fg transition-colors hover:border-accent hover:text-accent"
            >
              <Plus className="h-4 w-4" />
              Add — {formatPrice(active.priceCents, active.currency)}
            </button>
          </div>
        </div>

        {/* Product stage — every featured shoe orbits an ellipse; the front one
            is active. This "revolving" carousel is the storefront's signature
            moment. Shoes are visual only (pointer-events-none); navigation is the
            selector bar below + autoplay. */}
        <div className="pointer-events-none relative order-1 flex h-[42vh] items-center justify-center [perspective:1200px] lg:order-2 lg:h-[70vh]">
          {/* Colorful skin only: white spotlight lifts the front shoe off the wash. */}
          <div className="hero-spotlight pointer-events-none absolute inset-0" />
          {featured.map((p, i) => {
            const slot = (i - index + featured.length) % featured.length;
            const pos = HERO_SLOTS[slot] ?? HERO_SLOTS[0];
            return (
              <motion.div
                key={p.id}
                className="hero-shoe absolute inset-0 flex items-center justify-center"
                initial={false}
                animate={{
                  x: `${pos.x}%`,
                  y: `${pos.y}%`,
                  scale: pos.scale,
                  opacity: pos.opacity,
                }}
                transition={{ duration: 0.9, ease: EASE }}
                style={{ zIndex: pos.z }}
              >
                <ProductMedia
                  product={p}
                  priority={slot === 0}
                  className="h-full w-full"
                  sizes="(max-width: 1024px) 70vw, 40vw"
                />
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Featured selector */}
      <div className="relative z-10 mx-auto flex w-full max-w-[1600px] items-center gap-3 px-5 pb-8 sm:px-10">
        {featured.map((p, i) => (
          <button
            key={p.id}
            onClick={() => go(i)}
            aria-label={`Show ${p.name}`}
            className="group flex-1"
          >
            <span className="block h-[3px] w-full overflow-hidden bg-border">
              <motion.span
                className="block h-full bg-accent"
                initial={false}
                animate={{ width: i === index ? "100%" : i < index ? "100%" : "0%" }}
                transition={{ duration: i === index ? AUTOPLAY_MS / 1000 : 0.4, ease: "linear" }}
              />
            </span>
            <span className="mt-2 hidden text-[10px] font-medium uppercase tracking-[0.18em] text-muted group-hover:text-fg sm:block">
              {p.name}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
