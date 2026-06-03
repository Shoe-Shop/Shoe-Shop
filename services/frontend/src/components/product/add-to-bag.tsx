"use client";

import { useState } from "react";
import { Minus, Plus, Check } from "lucide-react";
import { useCart } from "@/components/cart/cart-provider";
import { cn } from "@/lib/utils";

// Illustrative only — our data model has no sizes. Shown for completeness,
// clearly non-functional ("future"), never sent to the cart.
const SIZES = ["7", "8", "9", "10", "11", "12"];

export function AddToBag({ productId }: { productId: string }) {
  const { add } = useCart();
  const [qty, setQty] = useState(1);
  const [size, setSize] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  async function handleAdd() {
    await add(productId, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Future: sizes (visual only, not wired) */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Size
          </span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted/70">
            Coming soon
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => setSize(s === size ? null : s)}
              className={cn(
                "h-11 w-12 rounded-card border text-sm transition-colors",
                size === s
                  ? "border-accent text-fg"
                  : "border-border text-muted hover:border-fg hover:text-fg",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex h-14 items-center gap-4 rounded-card border border-border px-4">
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" className="text-fg/70 hover:text-fg">
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-5 text-center text-base text-fg">{qty}</span>
          <button onClick={() => setQty((q) => q + 1)} aria-label="Increase quantity" className="text-fg/70 hover:text-fg">
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <button
          onClick={handleAdd}
          className="flex h-14 flex-1 items-center justify-center gap-2 rounded-card bg-accent text-sm font-semibold uppercase tracking-[0.14em] text-accent-fg transition-transform hover:scale-[1.01] active:scale-95"
        >
          {added ? (
            <>
              <Check className="h-4 w-4" /> Added to bag
            </>
          ) : (
            "Add to bag"
          )}
        </button>
      </div>
    </div>
  );
}
