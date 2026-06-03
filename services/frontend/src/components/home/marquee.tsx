"use client";

import { motion } from "motion/react";

/** Infinite scrolling tag strip. Pure decoration — duplicated for seamless loop. */
export function Marquee({ items }: { items: string[] }) {
  const row = [...items, ...items];
  return (
    <div className="overflow-hidden border-y border-border bg-bg py-5">
      <motion.div
        className="flex w-max items-center gap-12 whitespace-nowrap"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 22, ease: "linear", repeat: Infinity }}
      >
        {row.map((item, i) => (
          <div key={i} className="flex items-center gap-12">
            <span className="font-display text-xl tracking-[0.12em] text-fg/70">
              {item}
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          </div>
        ))}
      </motion.div>
    </div>
  );
}
