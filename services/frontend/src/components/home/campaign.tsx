"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

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
    </section>
  );
}
