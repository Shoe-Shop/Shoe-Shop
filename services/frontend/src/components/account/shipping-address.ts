"use client";

import { useCallback, useEffect, useState } from "react";

// A shopper's shipping address. This is intentionally MOCK, client-only state:
// no shipping service is real (it's a traefik/whoami stub) and the orders proto
// carries no address, so we persist it in localStorage to give checkout a real
// feel without faking a backend. Real addresses arrive with the shipping service.
export interface ShippingAddress {
  fullName: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

export const EMPTY_ADDRESS: ShippingAddress = {
  fullName: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
};

const STORAGE_KEY = "shoeshop.shippingAddress";
const CHANGE_EVENT = "shoeshop:address-changed";

/** Required fields are filled (line2 is optional). */
export function isAddressComplete(
  a: ShippingAddress | null,
): a is ShippingAddress {
  if (!a) return false;
  return [a.fullName, a.line1, a.city, a.region, a.postalCode, a.country].every(
    (v) => v.trim().length > 0,
  );
}

/** Address as display lines (drops empty optional fields). */
export function formatAddress(a: ShippingAddress): string[] {
  return [
    a.fullName,
    a.line1,
    a.line2,
    `${a.city}, ${a.region} ${a.postalCode}`.trim(),
    a.country,
  ]
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l !== ",");
}

function read(): ShippingAddress | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ShippingAddress) : null;
  } catch {
    return null;
  }
}

/**
 * Read/write the saved shipping address. Syncs across components in the same tab
 * (custom event) and across tabs (storage event), so saving on the account page
 * immediately ungates the Place-order button on the cart.
 */
export function useShippingAddress() {
  const [address, setAddress] = useState<ShippingAddress | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setAddress(read());
    setHydrated(true);
    const reload = () => setAddress(read());
    window.addEventListener("storage", reload);
    window.addEventListener(CHANGE_EVENT, reload);
    return () => {
      window.removeEventListener("storage", reload);
      window.removeEventListener(CHANGE_EVENT, reload);
    };
  }, []);

  const save = useCallback((a: ShippingAddress) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
    } catch {
      /* private mode / quota — keep in-memory */
    }
    setAddress(a);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setAddress(null);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { address, hydrated, complete: isAddressComplete(address), save, clear };
}
