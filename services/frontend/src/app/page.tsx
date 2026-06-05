import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { listProducts } from "@/lib/api";
import type { Product } from "@/lib/types";
import { Hero } from "@/components/home/hero";
import { FeaturedDrops } from "@/components/home/featured-drops";
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

  // Curated home-page selections, pinned by stable product ID so they never
  // drift when the catalogue re-sorts (it lists alphabetically by name). The
  // revolving hero and Latest Drops share no shoe, and Phantom is reserved for
  // the Campaign band below — so the page never repeats a shoe.
  const byId = new Map(products.map((p) => [p.id, p]));

  // Revolving hero — 4 shoes, in orbit order.
  const HERO_IDS = [
    "sku-court-classic", // Apex
    "sku-pace-setter", // Aura V1
    "sku-cloud-walker", // Veloce
    "sku-summit-hiker", // Pulse Shadow
  ];
  const heroProducts = HERO_IDS.map((id) => byId.get(id)).filter(
    (p): p is Product => Boolean(p),
  );
  // Safety net: if a curated ID is ever missing, top up so the hero still has 4.
  for (const p of products) {
    if (heroProducts.length >= 4) break;
    if (heroProducts.some((h) => h.id === p.id)) continue;
    heroProducts.push(p);
  }

  // Latest Drops — Vampire highlighted, plus two other non-hero, non-Phantom
  // drops. Falls back gracefully to fill any gap.
  const heroIds = new Set(heroProducts.map((p) => p.id));
  const EXCLUDED_IDS = new Set(["sku-canvas-low"]); // Phantom → Campaign band
  const PREFERRED_DROP_IDS = [
    "sku-river-sandal", // Vampire — the highlighted feature
    "sku-aurora-runner", // Solaris V1
    "sku-tempo-racer", // Pulse
  ];
  const latest: Product[] = [];
  const taken = new Set<string>();
  for (const id of PREFERRED_DROP_IDS) {
    const p = byId.get(id);
    if (p && !taken.has(id)) {
      latest.push(p);
      taken.add(id);
    }
  }
  for (const p of products) {
    if (latest.length >= 3) break;
    if (heroIds.has(p.id) || EXCLUDED_IDS.has(p.id) || taken.has(p.id)) continue;
    latest.push(p);
    taken.add(p.id);
  }

  event('frontend.page.viewed', {
    'page.name': 'home',
    'products.count': products.length,
  });

  return (
    <>
      <Hero products={heroProducts} />

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

        <FeaturedDrops products={latest} />
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
