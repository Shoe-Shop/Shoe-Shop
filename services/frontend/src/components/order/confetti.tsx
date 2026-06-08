"use client";

import { useMemo } from "react";
import { motion } from "motion/react";

const COLORS = ["#ff5a1f", "#10b981", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6"];

/**
 * A one-shot confetti burst from the top-centre, used on order confirmation.
 * Dependency-free (motion only); positions are memoised so they don't reshuffle
 * on re-render. Purely decorative — pointer-events-none, aria-hidden.
 */
export function Confetti({ count = 28 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        x: (Math.random() - 0.5) * 540,
        y: 300 + Math.random() * 280,
        rotate: Math.random() * 720 - 360,
        delay: Math.random() * 0.25,
        duration: 1.5 + Math.random() * 0.9,
        color: COLORS[i % COLORS.length],
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        left: 50 + (Math.random() - 0.5) * 34,
      })),
    [count],
  );

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
      aria-hidden
    >
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
          animate={{ opacity: 0, x: p.x, y: p.y, rotate: p.rotate }}
          transition={{ duration: p.duration, delay: p.delay, ease: "easeOut" }}
          style={{
            position: "absolute",
            top: 72,
            left: `${p.left}%`,
            width: p.w,
            height: p.h,
            backgroundColor: p.color,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}
