import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware className combiner (shadcn convention). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format minor-unit price strings from the BFF ("12900" -> "$129.00"). */
export function formatPrice(
  priceCents: string | number,
  currency = "USD",
): string {
  const major = Number(priceCents) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(Number.isFinite(major) ? major : 0);
}
