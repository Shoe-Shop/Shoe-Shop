import type { Metadata } from "next";
import { Package, Heart, LogOut } from "lucide-react";
import { getAccount, listOrders } from "@/lib/api";
import { DEMO_ACCOUNT_EMAIL } from "@/lib/env";
import type { Order, User } from "@/lib/types";
import { OrderHistory } from "@/components/account/order-history";
import { ShippingAddressForm } from "@/components/account/shipping-address-form";

export const metadata: Metadata = { title: "Account" };

// Live against the Users + Orders services via the BFF (frontend → bff → users /
// orders → postgres). Auth isn't wired yet, so we resolve a single seeded demo
// shopper; real sign-in (Zitadel) replaces this. Rendered server-side, so the
// fetches are CLIENT spans on the RSC request trace.
export const dynamic = "force-dynamic";

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[parts.length - 1][0] ?? "")).toUpperCase();
}

function memberSince(createdAt: string): string {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default async function AccountPage() {
  let user: User | null = null;
  let error: string | null = null;
  try {
    user = await getAccount();
  } catch (e) {
    error = e instanceof Error ? e.message : "Account service unavailable";
  }

  // Order history — real, from the Orders service. Best-effort: a failure here
  // shouldn't break the whole account page.
  let orders: Order[] = [];
  if (user) {
    try {
      orders = await listOrders(user.id);
    } catch {
      orders = [];
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] px-5 pb-24 pt-28 sm:px-10 sm:pt-36">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">
        NEXUS Members
      </p>
      <h1 className="font-display text-5xl text-fg sm:text-7xl">Account</h1>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.4fr]">
        {/* Profile card — live from the Users service */}
        {user ? (
          <div className="h-fit rounded-card border border-border bg-surface p-8">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent font-display text-lg text-accent-fg">
                {initials(user.fullName)}
              </div>
              <div>
                <h2 className="font-display text-2xl text-fg">{user.fullName}</h2>
                <p className="text-sm text-muted">{user.email}</p>
              </div>
            </div>

            <dl className="mt-8 space-y-4 text-sm">
              <div className="flex justify-between border-b border-border pb-3">
                <dt className="text-muted">Member since</dt>
                <dd className="text-fg">{memberSince(user.createdAt)}</dd>
              </div>
              <div className="flex justify-between border-b border-border pb-3">
                <dt className="text-muted">Account ID</dt>
                <dd className="font-mono text-xs text-fg">{user.id}</dd>
              </div>
              <div className="flex justify-between border-b border-border pb-3">
                <dt className="text-muted">Orders placed</dt>
                <dd className="text-fg">{orders.length}</dd>
              </div>
            </dl>

            <button
              disabled
              className="mt-7 flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-card border border-border bg-bg text-sm font-semibold uppercase tracking-[0.12em] text-muted opacity-70"
            >
              <LogOut className="h-4 w-4" />
              Sign out — auth coming soon
            </button>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Signed in as the demo shopper (<span className="text-fg">{DEMO_ACCOUNT_EMAIL}</span>),
              served live by the Users service. Real sign-in arrives with Zitadel.
            </p>
          </div>
        ) : (
          <div className="h-fit rounded-card border border-border bg-surface p-8">
            <h2 className="font-display text-2xl text-fg">Account unavailable</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              The Users service didn&apos;t respond, so your profile can&apos;t be
              loaded right now. The storefront is wired to it via the BFF —
              this is what a downstream outage looks like.
            </p>
            <p className="mt-4 rounded-card border border-border bg-bg px-4 py-3 font-mono text-xs text-muted">
              {error}
            </p>
          </div>
        )}

        {/* Dashboard — Orders + Shipping address are live; Saved awaits its service */}
        <div className="flex flex-col gap-6">
          {/* Orders — real history from the Orders service */}
          <section className="rounded-card border border-border bg-surface p-7">
            <div className="mb-5 flex items-center gap-3">
              <Package className="h-5 w-5 text-fg" />
              <h3 className="font-display text-xl text-fg">Orders</h3>
              <span className="ml-auto rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
                Live
              </span>
            </div>
            <OrderHistory orders={orders} />
          </section>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Shipping address — mock, saved in the browser */}
            <section className="rounded-card border border-border bg-surface p-7">
              <h3 className="mb-1 font-display text-xl text-fg">Shipping address</h3>
              <p className="mb-5 text-xs text-muted">
                Saved on this device · used at checkout
              </p>
              <ShippingAddressForm />
            </section>

            {/* Saved / wishlist — still a teaser (no service yet) */}
            <section className="rounded-card border border-border bg-surface p-7 opacity-80">
              <Heart className="h-6 w-6 text-fg" />
              <h3 className="mt-4 font-display text-xl text-fg">Saved</h3>
              <p className="mt-1 text-sm text-muted">
                Your wishlist — arrives with a future release.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
