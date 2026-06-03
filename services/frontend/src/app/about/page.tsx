import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description: "NEXUS — performance and lifestyle footwear, engineered to move.",
};

const STATS = [
  { value: "5", label: "House brands" },
  { value: "2026", label: "Performance index" },
  { value: "100%", label: "Built to move" },
];

export default function AboutPage() {
  return (
    <div className="pt-16 sm:pt-20">
      <section className="mx-auto max-w-[1100px] px-5 py-20 sm:px-10 sm:py-32">
        <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">
          About NEXUS
        </p>
        <h1 className="font-display text-5xl leading-[0.95] text-fg sm:text-8xl">
          Engineered to <span className="text-gradient">move differently.</span>
        </h1>
        <div className="mt-10 grid gap-8 text-lg leading-relaxed text-muted md:grid-cols-2">
          <p>
            NEXUS is a house of performance and lifestyle footwear — five brands,
            one obsession: motion. From carbon-plated racers to all-day knits, every
            silhouette is built around how people actually move.
          </p>
          <p>
            We design for the road, the trail, the studio and the street. No noise,
            no excess — just considered materials, honest engineering, and a
            relentless focus on the next step.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-3 gap-6 border-t border-border pt-12">
          {STATS.map((s) => (
            <div key={s.label}>
              <p className="font-display text-4xl text-fg sm:text-6xl">{s.value}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted">
                {s.label}
              </p>
            </div>
          ))}
        </div>

        <Link
          href="/shop"
          className="mt-16 inline-flex rounded-card bg-accent px-8 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-accent-fg transition-transform hover:scale-[1.02]"
        >
          Explore the collection
        </Link>
      </section>
    </div>
  );
}
