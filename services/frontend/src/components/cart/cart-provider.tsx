"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  addCartItem,
  clearCart as clearCartApi,
  getCart,
  removeCartItem,
} from "@/lib/api";
import type { Cart } from "@/lib/types";

interface CartContextValue {
  cart: Cart | null;
  /** Total quantity across line items (header badge). */
  count: number;
  loading: boolean;
  /** Slide-over drawer open state. */
  open: boolean;
  setOpen: (open: boolean) => void;
  add: (productId: string, quantity?: number) => Promise<void>;
  remove: (productId: string) => Promise<void>;
  clear: () => Promise<void>;
  refresh: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setCart(await getCart());
    } catch {
      setCart(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = useCallback(async (productId: string, quantity = 1) => {
    setCart(await addCartItem(productId, quantity));
    setOpen(true);
  }, []);

  const remove = useCallback(async (productId: string) => {
    setCart(await removeCartItem(productId));
  }, []);

  const clear = useCallback(async () => {
    setCart(await clearCartApi());
  }, []);

  const count = useMemo(
    () => cart?.items.reduce((n, i) => n + i.quantity, 0) ?? 0,
    [cart],
  );

  const value = useMemo<CartContextValue>(
    () => ({ cart, count, loading, open, setOpen, add, remove, clear, refresh }),
    [cart, count, loading, open, add, remove, clear, refresh],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within <CartProvider>");
  return ctx;
}
