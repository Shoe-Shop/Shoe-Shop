import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProduct, listProducts } from "@/lib/api";
import { BffError } from "@/lib/api";
import type { Product } from "@/lib/types";
import { formatPrice } from "@/lib/utils";
import { PdpGallery } from "@/components/product/pdp-gallery";
import { AddToBag } from "@/components/product/add-to-bag";
import { ProductCard } from "@/components/product/product-card";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

async function fetchProduct(id: string): Promise<Product | null> {
  try {
    return await getProduct(id);
  } catch (e) {
    if (e instanceof BffError && e.status === 404) return null;
    throw e;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await fetchProduct(id).catch(() => null);
  if (!product) return { title: "Not found" };
  return { title: product.name, description: product.description };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { id } = await params;
  const product = await fetchProduct(id);
  if (!product) notFound();

  let related: Product[] = [];
  try {
    const all = await listProducts(1, 100);
    related = all.filter((p) => p.id !== product.id && p.brand === product.brand);
    if (related.length < 4) {
      related = [
        ...related,
        ...all.filter((p) => p.id !== product.id && !related.includes(p)),
      ];
    }
    related = related.slice(0, 4);
  } catch {
    related = [];
  }

  return (
    <div className="pt-16 sm:pt-20">
      <div className="mx-auto max-w-[1600px] px-5 py-8 sm:px-10">
        <Link
          href="/shop"
          className="group inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to shop
        </Link>
      </div>

      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-10 px-5 pb-20 sm:px-10 lg:grid-cols-2 lg:gap-16">
        <PdpGallery product={product} />

        <div className="lg:py-6">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            {product.brand}
          </p>
          <h1 className="font-display text-5xl leading-[0.95] text-fg sm:text-6xl">
            {product.name}
          </h1>
          <p className="mt-5 font-display text-3xl text-fg">
            {formatPrice(product.priceCents, product.currency)}
          </p>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted">
            {product.description}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {product.tags.map((t) => (
              <Link
                key={t}
                href={`/shop?tag=${encodeURIComponent(t)}`}
                className="rounded-card border border-border px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-fg hover:text-fg"
              >
                {t}
              </Link>
            ))}
          </div>

          <div className="mt-10">
            <AddToBag productId={product.id} />
          </div>

          <dl className="mt-10 divide-y divide-border border-t border-border text-sm">
            <div className="flex justify-between py-4">
              <dt className="text-muted">Brand</dt>
              <dd className="text-fg">{product.brand}</dd>
            </div>
            <div className="flex justify-between py-4">
              <dt className="text-muted">Free shipping</dt>
              <dd className="text-fg">On all orders</dd>
            </div>
            <div className="flex justify-between py-4">
              <dt className="text-muted">Returns</dt>
              <dd className="text-fg">30 days</dd>
            </div>
          </dl>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mx-auto max-w-[1600px] border-t border-border px-5 py-16 sm:px-10">
          <h2 className="mb-10 font-display text-3xl text-fg sm:text-4xl">
            You may also like
          </h2>
          <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-4">
            {related.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
