"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

// Editorial campaign imagery (NEXUS model studies). These are art-directed hero
// shots — backgrounds and baked model names are intentional here, unlike the
// clean product cutouts used on cards/PDP.
const LOOKBOOK = [
  { src: "/campaign/phantom-duo.png", model: "Phantom", tag: "幻影 · Crimson" },
  { src: "/campaign/neo-motion-light.png", model: "Neo Motion", tag: "Techmesh X1" },
  { src: "/campaign/neurovibe.png", model: "Neurovibe MX-1", tag: "Night Ops" },
  { src: "/campaign/aether-trail.png", model: "Aether", tag: "Nitro Trail" },
  { src: "/campaign/copper-front.png", model: "Copper", tag: "Oxide Run" },
  { src: "/campaign/crimson-shell.png", model: "Crimson Shell", tag: "Unit 9" },
  { src: "/campaign/stride-profile.png", model: "Stride One", tag: "Neo Grip" },
  { src: "/campaign/neo-motion-dark.png", model: "Neo Motion", tag: "Carbon" },
];

export function Campaign() {
  return (
    <section className="bg-bg">
      {/* Feature split */}
      <div className="grid grid-cols-1 lg:grid-cols-2">
        <div className="flex flex-col justify-center px-5 py-16 sm:px-10 lg:py-28">
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: EASE }}
            className="mb-5 text-[11px] font-semibold uppercase tracking-[0.3em] text-muted"
          >
            Campaign 001 — 2026
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.05 }}
            className="font-display text-6xl leading-[0.9] text-fg sm:text-8xl"
          >
            The <span className="text-gradient">Phantom</span> Series
          </motion.h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted">
            A study in contrast. Engineered shells, reactive cushioning, and a
            silhouette built for the ones who move after dark.
          </p>
          <Link
            href="/shop"
            className="group mt-8 inline-flex w-fit items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-fg"
          >
            Explore the series
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
        <div className="relative min-h-[60vh] overflow-hidden lg:min-h-[80vh]">
          <Image
            src="/campaign/phantom-noir.png"
            alt="NEXUS Phantom — Crimson"
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
        </div>
      </div>

      {/* Horizontal lookbook */}
      <div className="border-t border-border py-14">
        <div className="mb-8 flex items-end justify-between px-5 sm:px-10">
          <h3 className="font-display text-3xl text-fg sm:text-5xl">Lookbook</h3>
          <span className="text-[11px] uppercase tracking-[0.2em] text-muted">
            Drag / scroll →
          </span>
        </div>
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 sm:px-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {LOOKBOOK.map((shot) => (
            <Link
              key={shot.src}
              href="/shop"
              className="group relative aspect-[4/5] w-[78vw] shrink-0 snap-start overflow-hidden rounded-card border border-border bg-surface sm:w-[380px]"
            >
              <Image
                src={shot.src}
                alt={`NEXUS ${shot.model}`}
                fill
                sizes="(max-width: 640px) 78vw, 380px"
                className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 p-5">
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/70">
                  {shot.tag}
                </p>
                <p className="font-display text-2xl uppercase tracking-[0.08em] text-white">
                  {shot.model}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
