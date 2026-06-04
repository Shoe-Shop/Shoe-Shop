import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { listProducts } from "@/lib/api";
import type { Product } from "@/lib/types";
import { Hero } from "@/components/home/hero";
import { ProductCard } from "@/components/product/product-card";
import { Marquee } from "@/components/home/marquee";
import { Campaign } from "@/components/home/campaign";
import { event } from "@/lib/telemetry";

// Always render against the live catalogue (and avoid baking a build-time
// "offline" snapshot when the BFF isn't reachable during the image build).
export const dynamic = "force-dynamic";

export default async function HomePage() {
  let products: Product[] = [];
  try {
    products = await listProducts(1, 12);
  } catch {
    products = [];
  }

  if (products.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-display text-4xl text-fg">Catalogue offline</p>
        <p className="max-w-sm text-muted">
          The storefront could not reach the catalogue service. Bring the stack
          up with <code className="text-accent">task up:core</code> and refresh.
        </p>
      </div>
    );
  }

  const latest = products.slice(0, 8);

  event('frontend.page.viewed', {
    'page.name': 'home',
    'products.count': products.length,
  });

  return (
    <>
      <Hero products={products} />

      <Marquee
        items={[
          "Engineered Performance",
          "Recycled Materials",
          "Free Returns",
          "Carbon Plated",
          "Made to Move",
        ]}
      />

      <section className="mx-auto max-w-[1600px] px-5 py-20 sm:px-10 sm:py-28">
        <div className="mb-12 flex items-end justify-between">
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">
              The Index
            </p>
            <h2 className="font-display text-4xl text-fg sm:text-6xl">
              Latest Drops
            </h2>
          </div>
          <Link
            href="/shop"
            className="group hidden items-center gap-2 text-sm font-semibold uppercase tracking-[0.12em] text-fg sm:flex"
          >
            View all
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
          {latest.map((product, i) => (
            <ProductCard key={product.id} product={product} index={i} />
          ))}
        </div>
      </section>

      <Campaign />

      {/* Closing CTA band */}
      <section className="relative overflow-hidden border-y border-border bg-surface">
        <div className="mx-auto flex max-w-[1600px] flex-col items-start gap-8 px-5 py-24 sm:px-10 sm:py-32">
          <h2 className="max-w-3xl font-display text-5xl leading-[0.95] text-fg sm:text-8xl">
            Move <span className="text-gradient">Differently.</span>
          </h2>
          <Link
            href="/shop"
            className="group inline-flex items-center gap-3 rounded-card bg-accent px-8 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-accent-fg transition-transform hover:scale-[1.02] active:scale-95"
          >
            Shop the collection
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </section>
    </>
  );
}
