import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="font-display text-[28vw] leading-none text-fg/10 sm:text-[180px]">
        404
      </p>
      <h1 className="-mt-6 font-display text-4xl text-fg sm:text-5xl">
        Off the track
      </h1>
      <p className="mt-4 max-w-sm text-muted">
        The page you&apos;re looking for has moved or never existed.
      </p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/"
          className="rounded-card bg-accent px-7 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-accent-fg"
        >
          Home
        </Link>
        <Link
          href="/shop"
          className="rounded-card border border-border px-7 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-fg hover:border-fg"
        >
          Shop
        </Link>
      </div>
    </div>
  );
}
