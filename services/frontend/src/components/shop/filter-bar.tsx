"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "name", label: "Alphabetical" },
] as const;

export function FilterBar({
  brands,
  tags,
}: {
  brands: string[];
  tags: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const brand = sp.get("brand") ?? "";
  const tag = sp.get("tag") ?? "";
  const sort = sp.get("sort") ?? "featured";
  const q = sp.get("q") ?? "";
  const [search, setSearch] = useState(q);

  const apply = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const params = new URLSearchParams(sp.toString());
      mutate(params);
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sp, pathname, router],
  );

  const setParam = (key: string, value: string) =>
    apply((p) => (value ? p.set(key, value) : p.delete(key)));

  return (
    <div className="sticky top-16 z-40 border-y border-border bg-bg/85 backdrop-blur-xl sm:top-20">
      <div className="mx-auto max-w-[1600px] px-5 py-4 sm:px-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Search */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setParam("q", search.trim());
            }}
            className="flex h-11 w-full items-center gap-2 rounded-card border border-border bg-surface px-4 lg:max-w-xs"
          >
            <Search className="h-4 w-4 shrink-0 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search footwear…"
              className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-muted"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setParam("q", "");
                }}
                aria-label="Clear search"
              >
                <X className="h-4 w-4 text-muted hover:text-fg" />
              </button>
            )}
          </form>

          {/* Sort */}
          <div className="flex items-center gap-3">
            <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              Sort
            </label>
            <select
              value={sort}
              onChange={(e) => setParam("sort", e.target.value === "featured" ? "" : e.target.value)}
              className="h-11 rounded-card border border-border bg-surface px-3 text-sm text-fg outline-none"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Brand + tag chips */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Chip active={!brand} onClick={() => setParam("brand", "")}>
            All Brands
          </Chip>
          {brands.map((b) => (
            <Chip key={b} active={brand === b} onClick={() => setParam("brand", brand === b ? "" : b)}>
              {b}
            </Chip>
          ))}
          <span className="mx-1 h-5 w-px bg-border" />
          {tags.map((t) => (
            <Chip key={t} small active={tag === t} onClick={() => setParam("tag", tag === t ? "" : t)}>
              {t}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}

function Chip({
  children,
  active,
  small,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  small?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-card border transition-colors",
        small ? "px-3 py-1 text-[11px]" : "px-4 py-1.5 text-xs font-semibold",
        "uppercase tracking-[0.12em]",
        active
          ? "border-accent bg-accent text-accent-fg"
          : "border-border bg-surface text-muted hover:border-fg hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
