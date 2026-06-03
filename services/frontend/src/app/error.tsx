"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced to the browser console; RUM/error telemetry hooks in here later.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="font-display text-7xl text-accent">Oops</p>
      <h1 className="mt-4 font-display text-3xl text-fg">Something went wrong</h1>
      <p className="mt-3 max-w-sm text-muted">
        We hit a snag loading this page. It may be the catalogue waking up — give
        it another go.
      </p>
      <button
        onClick={reset}
        className="mt-8 rounded-card bg-accent px-7 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-accent-fg transition-transform hover:scale-[1.02] active:scale-95"
      >
        Try again
      </button>
    </div>
  );
}
