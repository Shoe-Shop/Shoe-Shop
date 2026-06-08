"use client";

import { useState } from "react";
import { MapPin, Pencil } from "lucide-react";
import {
  EMPTY_ADDRESS,
  formatAddress,
  useShippingAddress,
  type ShippingAddress,
} from "./shipping-address";

interface FieldDef {
  key: keyof ShippingAddress;
  label: string;
  span?: boolean; // full width
  optional?: boolean;
  autoComplete?: string;
}

const FIELDS: FieldDef[] = [
  { key: "fullName", label: "Full name", span: true, autoComplete: "name" },
  { key: "line1", label: "Address", span: true, autoComplete: "address-line1" },
  { key: "line2", label: "Apartment, suite (optional)", span: true, optional: true, autoComplete: "address-line2" },
  { key: "city", label: "City", autoComplete: "address-level2" },
  { key: "region", label: "State / Region", autoComplete: "address-level1" },
  { key: "postalCode", label: "Postal code", autoComplete: "postal-code" },
  { key: "country", label: "Country", autoComplete: "country-name" },
];

const INPUT_CLASS =
  "h-12 w-full rounded-card border border-border bg-bg px-4 text-sm text-fg outline-none transition-colors focus:border-accent";

/**
 * Edit/display the saved (mock) shipping address. When an address is set it shows
 * a summary with an Edit button; otherwise it renders the form. `onSaved` lets the
 * caller (e.g. the cart) react once an address exists.
 */
export function ShippingAddressForm({ onSaved }: { onSaved?: () => void }) {
  const { address, hydrated, complete, save } = useShippingAddress();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ShippingAddress>(address ?? EMPTY_ADDRESS);

  if (!hydrated) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  if (complete && address && !editing) {
    return (
      <div>
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div className="space-y-0.5 text-sm leading-relaxed text-fg">
            {formatAddress(address).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
        <button
          onClick={() => {
            setDraft(address);
            setEditing(true);
          }}
          className="mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted transition-colors hover:text-accent"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit address
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(draft);
        setEditing(false);
        onSaved?.();
      }}
      className="grid grid-cols-2 gap-3"
    >
      {FIELDS.map((f) => (
        <label
          key={f.key}
          className={f.span ? "col-span-2 block" : "col-span-2 block sm:col-span-1"}
        >
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            {f.label}
          </span>
          <input
            value={draft[f.key]}
            onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
            required={!f.optional}
            autoComplete={f.autoComplete}
            className={INPUT_CLASS}
          />
        </label>
      ))}
      <div className="col-span-2 mt-1 flex items-center gap-3">
        <button
          type="submit"
          className="h-12 flex-1 rounded-card bg-accent text-sm font-semibold uppercase tracking-[0.12em] text-accent-fg transition-opacity hover:opacity-90"
        >
          Save address
        </button>
        {complete && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="h-12 rounded-card border border-border px-5 text-sm uppercase tracking-[0.12em] text-muted hover:text-fg"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
