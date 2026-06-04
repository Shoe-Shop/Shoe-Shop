import type { Metadata } from "next";
import { Package, MapPin, Heart, LogOut } from "lucide-react";
import { getAccount } from "@/lib/api";
import { DEMO_ACCOUNT_EMAIL } from "@/lib/env";
import type { User } from "@/lib/types";

export const metadata: Metadata = { title: "Account" };

// Live against the Users service via the BFF (frontend → bff → users →
// postgres). Auth isn't wired yet, so we resolve a single seeded demo shopper
// by email; real sign-in (Zitadel) replaces this. Rendered server-side, so the
// fetch is a CLIENT span on the RSC request trace.
export const dynamic = "force-dynamic";

// Roadmap sections — the services behind these don't exist yet, so they stay
// as honest "coming soon" teasers rather than faking data.
const PENDING_SECTIONS = [
  { icon: Package, label: "Orders", note: "Arrives with the v0.3 write path" },
  { icon: MapPin, label: "Addresses", note: "Shipping & billing" },
  { icon: Heart, label: "Saved", note: "Your wishlist" },
];

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

  return (
    <div className="mx-auto max-w-[1600px] px-5 pb-24 pt-28 sm:px-10 sm:pt-36">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">
        NEXUS Members
      </p>
      <h1 className="font-display text-5xl text-fg sm:text-7xl">Account</h1>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.4fr]">
        {/* Profile card — live from the Users service */}
        {user ? (
          <div className="rounded-card border border-border bg-surface p-8">
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
          <div className="rounded-card border border-border bg-surface p-8">
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

        {/* Dashboard — Profile is live; the rest await their services */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-card border border-accent/40 bg-surface p-6">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
              Live
            </span>
            <h3 className="mt-3 font-display text-xl text-fg">Profile</h3>
            <p className="mt-1 text-sm text-muted">
              {user ? "Name, email, member since" : "Awaiting Users service"}
            </p>
          </div>
          {PENDING_SECTIONS.map((s) => (
            <div
              key={s.label}
              className="rounded-card border border-border bg-surface p-6 opacity-80"
            >
              <s.icon className="h-6 w-6 text-fg" />
              <h3 className="mt-4 font-display text-xl text-fg">{s.label}</h3>
              <p className="mt-1 text-sm text-muted">{s.note}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
