"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Search, ShoppingBag, User, Menu } from "lucide-react";
import { useCart } from "@/components/cart/cart-provider";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Shop", href: "/shop" },
  { label: "Collections", href: "/shop" },
  { label: "About", href: "/about" },
  { label: "Account", href: "/account" },
];

export function SiteHeader() {
  const { count, setOpen } = useCart();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-500",
        scrolled
          ? "border-b border-border bg-bg/80 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-5 sm:h-20 sm:px-10">
        <div className="flex items-center gap-5">
          <button
            className="text-fg transition-opacity hover:opacity-60 sm:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <Link
            href="/"
            className="font-display text-2xl font-bold tracking-[0.22em] text-fg sm:text-[28px]"
          >
            NEXUS
          </Link>
        </div>

        <nav className="hidden items-center gap-12 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fg/80 transition-all duration-300 hover:tracking-[0.24em] hover:text-fg"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-6 text-fg sm:gap-7">
          <Link
            href="/shop"
            aria-label="Search"
            className="transition-transform duration-300 hover:scale-110"
          >
            <Search className="h-5 w-5" />
          </Link>
          <Link
            href="/account"
            aria-label="Account"
            className="hidden transition-transform duration-300 hover:scale-110 sm:block"
          >
            <User className="h-5 w-5" />
          </Link>
          <button
            onClick={() => setOpen(true)}
            aria-label={`Open cart, ${count} items`}
            className="group relative transition-transform duration-300 hover:scale-110"
          >
            <ShoppingBag className="h-5 w-5" />
            {count > 0 && (
              <span className="absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-fg">
                {count}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
