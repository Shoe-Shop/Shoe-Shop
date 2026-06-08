import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Order, OrderStatus } from "@/lib/types";
import { formatPrice } from "@/lib/utils";

const STATUS_META: Record<OrderStatus, { label: string; cls: string }> = {
  ORDER_STATUS_CONFIRMED: {
    label: "Confirmed",
    cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
  },
  ORDER_STATUS_CANCELLED: {
    label: "Cancelled",
    cls: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  },
  ORDER_STATUS_PENDING: {
    label: "Processing",
    cls: "border-accent/40 bg-accent/10 text-accent",
  },
  ORDER_STATUS_RESERVING: {
    label: "Processing",
    cls: "border-accent/40 bg-accent/10 text-accent",
  },
  ORDER_STATUS_AUTHORIZING: {
    label: "Processing",
    cls: "border-accent/40 bg-accent/10 text-accent",
  },
  ORDER_STATUS_UNSPECIFIED: {
    label: "Unknown",
    cls: "border-border bg-bg text-muted",
  },
};

function orderDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function itemCount(o: Order): number {
  return o.items.reduce((n, i) => n + i.quantity, 0);
}

export function OrderHistory({ orders }: { orders: Order[] }) {
  if (orders.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-muted">
        You haven&apos;t placed any orders yet. Once you check out, your orders
        appear here with their live status.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {orders.map((o) => {
        const meta = STATUS_META[o.status] ?? STATUS_META.ORDER_STATUS_UNSPECIFIED;
        const count = itemCount(o);
        return (
          <li key={o.id}>
            <Link
              href={`/order/${o.id}`}
              className="group flex items-center gap-4 py-4 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-fg">
                    #{o.id.slice(0, 8)}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${meta.cls}`}
                  >
                    {meta.label}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {orderDate(o.createdAt)} · {count} item{count === 1 ? "" : "s"}
                </p>
              </div>
              <span className="font-display text-base text-fg">
                {formatPrice(Number(o.totalCents), o.currency)}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
