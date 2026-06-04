import type { Metadata } from "next";
import { listProducts, searchProducts } from "@/lib/api";
import type { Product } from "@/lib/types";
import { ProductCard } from "@/components/product/product-card";
import { FilterBar } from "@/components/shop/filter-bar";
import { event } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shop",
  description: "All NEXUS footwear — running, trail, lifestyle, training and more.",
};

function sortProducts(products: Product[], sort: string): Product[] {
  const copy = [...products];
  switch (sort) {
    case "price-asc":
      return copy.sort((a, b) => Number(a.priceCents) - Number(b.priceCents));
    case "price-desc":
      return copy.sort((a, b) => Number(b.priceCents) - Number(a.priceCents));
    case "name":
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    default:
      return copy;
  }
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ShopPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : "";
  const q = str(sp.q);
  const brand = str(sp.brand);
  const tag = str(sp.tag);
  const sort = str(sp.sort) || "featured";

  // Full catalogue powers the filter facets (stable regardless of query).
  let all: Product[] = [];
  try {
    all = await listProducts(1, 100);
  } catch {
    all = [];
  }
  const brands = [...new Set(all.map((p) => p.brand))].filter(Boolean).sort();
  const tags = [...new Set(all.flatMap((p) => p.tags))].filter(Boolean).sort();

  // Results: search-backed when there's a query, else the full set.
  let results = all;
  if (q) {
    try {
      results = await searchProducts(q, 100);
    } catch {
      results = [];
    }
  }
  if (brand) results = results.filter((p) => p.brand === brand);
  if (tag) results = results.filter((p) => p.tags.includes(tag));
  results = sortProducts(results, sort);

  if (q) {
    event('frontend.search.performed', {
      'search.query': q,
      'search.results_count': results.length,
      ...(brand && { 'search.brand_filter': brand }),
      ...(tag && { 'search.tag_filter': tag }),
    });
  } else {
    event('frontend.page.viewed', {
      'page.name': 'shop',
      'products.count': results.length,
      ...(brand && { 'filter.brand': brand }),
      ...(tag && { 'filter.tag': tag }),
    });
  }

  const activeFilters = [q && `”${q}”`, brand, tag].filter(Boolean);

  return (
    <div className="pt-16 sm:pt-20">
      <header className="mx-auto max-w-[1600px] px-5 pb-2 pt-12 sm:px-10 sm:pt-16">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">
          The Collection
        </p>
        <h1 className="font-display text-5xl text-fg sm:text-7xl">Shop All</h1>
      </header>

      <FilterBar brands={brands} tags={tags} />

      <section className="mx-auto max-w-[1600px] px-5 py-10 sm:px-10">
        <p className="mb-8 text-sm text-muted">
          {results.length} {results.length === 1 ? "result" : "results"}
          {activeFilters.length > 0 && (
            <span> · filtered by {activeFilters.join(", ")}</span>
          )}
        </p>

        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-28 text-center">
            <p className="font-display text-3xl text-fg">No matches</p>
            <p className="max-w-sm text-muted">
              {all.length === 0
                ? "The catalogue is unavailable right now. Please try again shortly."
                : "Try a different search or clear your filters."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
            {results.map((product, i) => (
              <ProductCard key={product.id} product={product} index={i} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
