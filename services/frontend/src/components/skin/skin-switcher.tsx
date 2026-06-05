"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Palette, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const SKINS = [
  { id: "kinetic", label: "Dark", note: "Sport-tech" },
  { id: "editorial", label: "Light", note: "Minimal" },
  { id: "brutalist", label: "Colorful", note: "Luxe" },
] as const;

type SkinId = (typeof SKINS)[number]["id"];

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/**
 * Demo-only design-direction picker. Lets us compare the four skins live; once
 * a direction is chosen this whole control comes out and the skin is fixed.
 */
export function SkinSwitcher() {
  const [skin, setSkin] = useState<SkinId>("brutalist");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const current = document.documentElement.dataset.skin as SkinId | undefined;
    if (current) setSkin(current);
  }, []);

  function choose(id: SkinId) {
    setSkin(id);
    document.documentElement.dataset.skin = id;
    try {
      localStorage.setItem("nexus-skin", id);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col items-end gap-3 print:hidden">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="w-60 overflow-hidden rounded-card border border-border bg-surface/95 p-2 shadow-2xl backdrop-blur"
          >
            <p className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              Design direction
            </p>
            <div className="grid gap-1">
              {SKINS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => choose(s.id)}
                  className={cn(
                    "flex items-center justify-between rounded-card px-3 py-2 text-left transition-colors",
                    skin === s.id
                      ? "bg-accent text-accent-fg"
                      : "text-fg hover:bg-bg",
                  )}
                >
                  <span className="font-display text-sm">{s.label}</span>
                  <span
                    className={cn(
                      "text-[10px] uppercase tracking-widest",
                      skin === s.id ? "text-accent-fg/70" : "text-muted",
                    )}
                  >
                    {s.note}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Switch design direction"
        className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-accent text-accent-fg shadow-xl transition-transform hover:scale-105 active:scale-95"
      >
        {open ? <X className="h-5 w-5" /> : <Palette className="h-5 w-5" />}
      </button>
    </div>
  );
}
