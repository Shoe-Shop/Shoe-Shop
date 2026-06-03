import type { Metadata } from "next";
import { User, Package, MapPin, Heart, Lock } from "lucide-react";

export const metadata: Metadata = { title: "Account" };

const SECTIONS = [
  { icon: User, label: "Profile", note: "Name, email, preferences" },
  { icon: Package, label: "Orders", note: "Track and review purchases" },
  { icon: MapPin, label: "Addresses", note: "Shipping & billing" },
  { icon: Heart, label: "Saved", note: "Your wishlist" },
];

// Designed shell only — BFF→Users + auth aren't wired yet. Intentionally
// non-functional, communicating the boundary clearly.
export default function AccountPage() {
  return (
    <div className="mx-auto max-w-[1600px] px-5 pb-24 pt-28 sm:px-10 sm:pt-36">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">
        NEXUS Members
      </p>
      <h1 className="font-display text-5xl text-fg sm:text-7xl">Account</h1>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.4fr]">
        {/* Sign-in card */}
        <div className="rounded-card border border-border bg-surface p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg">
            <Lock className="h-5 w-5 text-accent" />
          </div>
          <h2 className="mt-5 font-display text-2xl text-fg">Sign in</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Accounts arrive with the next release, when the storefront connects to
            the Users service. The interface is ready — the wiring is on the way.
          </p>
          <div className="mt-6 space-y-3">
            <input
              disabled
              placeholder="Email"
              className="h-12 w-full rounded-card border border-border bg-bg px-4 text-sm text-fg placeholder:text-muted/70 disabled:cursor-not-allowed"
            />
            <input
              disabled
              type="password"
              placeholder="Password"
              className="h-12 w-full rounded-card border border-border bg-bg px-4 text-sm text-fg placeholder:text-muted/70 disabled:cursor-not-allowed"
            />
            <button
              disabled
              className="h-12 w-full cursor-not-allowed rounded-card bg-accent text-sm font-semibold uppercase tracking-[0.12em] text-accent-fg opacity-60"
            >
              Sign in — coming soon
            </button>
          </div>
        </div>

        {/* Dashboard preview */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {SECTIONS.map((s) => (
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
