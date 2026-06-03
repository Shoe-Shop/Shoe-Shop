import Link from "next/link";

const COLUMNS = [
  {
    title: "Shop",
    links: [
      { label: "All Footwear", href: "/shop" },
      { label: "Running", href: "/shop?tag=running" },
      { label: "Trail", href: "/shop?tag=trail" },
      { label: "Lifestyle", href: "/shop?tag=lifestyle" },
    ],
  },
  {
    title: "House Brands",
    links: [
      { label: "Hballo", href: "/shop?brand=Hballo" },
      { label: "Stride", href: "/shop?brand=Stride" },
      { label: "Vellum", href: "/shop?brand=Vellum" },
      { label: "Summit", href: "/shop?brand=Summit" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Account", href: "/account" },
      { label: "Contact", href: "/about" },
      { label: "Careers", href: "/about" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-[1600px] px-5 py-16 sm:px-10 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_2fr]">
          <div>
            <p className="font-display text-5xl font-bold tracking-[0.18em] text-fg sm:text-6xl">
              NEXUS
            </p>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
              Performance and lifestyle footwear, engineered. Built for the
              ones who move differently.
            </p>
            {/* Newsletter is illustrative until the write path lands. */}
            <form
              className="mt-8 flex max-w-sm items-center gap-2"
              aria-label="Newsletter (coming soon)"
            >
              <input
                type="email"
                disabled
                placeholder="Email — joining soon"
                className="h-11 flex-1 rounded-card border border-border bg-bg px-4 text-sm text-fg placeholder:text-muted/70 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                disabled
                className="h-11 rounded-card bg-accent px-5 text-sm font-semibold text-accent-fg opacity-60"
              >
                Join
              </button>
            </form>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
                  {col.title}
                </p>
                <ul className="mt-4 space-y-3">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-sm text-fg/80 transition-colors hover:text-accent"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-border pt-8 text-xs text-muted sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} NEXUS. All rights reserved.</p>
          <p className="font-display tracking-[0.2em]">MOVE DIFFERENTLY</p>
        </div>
      </div>
    </footer>
  );
}
