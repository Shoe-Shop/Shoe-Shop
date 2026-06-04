// Typed client for the BFF read path. Server components call over the Docker
// network; client components call the published host port (see env.ts).
import { bffBaseUrl, DEMO_ACCOUNT_EMAIL, DEMO_USER_ID } from "./env";
import type {
  Cart,
  CartResponse,
  Product,
  ProductResponse,
  ProductsResponse,
  User,
  UserResponse,
} from "./types";

class BffError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BffError";
  }
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${bffBaseUrl()}${path}`, {
    ...init,
    headers: { accept: "application/json", ...init?.headers },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new BffError(detail, res.status);
  }
  return res.json() as Promise<T>;
}

// ── Catalogue (read path) ────────────────────────────────────────────
// Catalogue data is stable, so cache it and let pages revalidate on an
// interval rather than per-request.
export async function listProducts(
  page = 1,
  pageSize = 20,
): Promise<Product[]> {
  const data = await getJson<ProductsResponse>(
    `/api/products?page=${page}&pageSize=${pageSize}`,
    { next: { revalidate: 60 } },
  );
  return data.products ?? [];
}

export async function getProduct(id: string): Promise<Product> {
  const data = await getJson<ProductResponse>(
    `/api/products/${encodeURIComponent(id)}`,
    { next: { revalidate: 60 } },
  );
  return data.product;
}

export async function searchProducts(
  query: string,
  limit = 20,
): Promise<Product[]> {
  if (!query.trim()) return [];
  const data = await getJson<ProductsResponse>(
    `/api/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    { cache: "no-store" },
  );
  return data.products ?? [];
}

// ── Cart ─────────────────────────────────────────────────────────────
// Mutating + per-user, so never cached.
export async function getCart(userId = DEMO_USER_ID): Promise<Cart> {
  const data = await getJson<CartResponse>(
    `/api/cart/${encodeURIComponent(userId)}`,
    { cache: "no-store" },
  );
  return data.cart;
}

export async function addCartItem(
  productId: string,
  quantity = 1,
  userId = DEMO_USER_ID,
): Promise<Cart> {
  const data = await getJson<CartResponse>(
    `/api/cart/${encodeURIComponent(userId)}/items`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId, quantity }),
      cache: "no-store",
    },
  );
  return data.cart;
}

export async function removeCartItem(
  productId: string,
  userId = DEMO_USER_ID,
): Promise<Cart> {
  const data = await getJson<CartResponse>(
    `/api/cart/${encodeURIComponent(userId)}/items/${encodeURIComponent(productId)}`,
    { method: "DELETE", cache: "no-store" },
  );
  return data.cart;
}

export async function clearCart(userId = DEMO_USER_ID): Promise<Cart> {
  const data = await getJson<CartResponse>(
    `/api/cart/${encodeURIComponent(userId)}`,
    { method: "DELETE", cache: "no-store" },
  );
  return data.cart;
}

// ── Account (Users) ──────────────────────────────────────────────────
// Per-user identity, so never cached. Until auth lands the account page
// resolves the seeded demo shopper by email.
export async function getAccount(
  email = DEMO_ACCOUNT_EMAIL,
): Promise<User> {
  const data = await getJson<UserResponse>(
    `/api/users/by-email/${encodeURIComponent(email)}`,
    { cache: "no-store" },
  );
  return data.user;
}

export { BffError };
