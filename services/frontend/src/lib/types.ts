// Mirrors the BFF read-path contract (services/bff/src/routes.ts). Verified
// against live responses: priceCents is a string of minor units ("12900").
export interface Product {
  id: string;
  name: string;
  description: string;
  brand: string;
  priceCents: string;
  currency: string;
  imageUrl: string;
  tags: string[];
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface Cart {
  userId: string;
  items: CartItem[];
}

// A registered shopper account, mirroring users.v1.User via the BFF.
export interface User {
  id: string;
  email: string;
  fullName: string;
  // RFC 3339 / ISO 8601 timestamp of when the account was created.
  createdAt: string;
}

// BFF response envelopes.
export interface ProductsResponse {
  products: Product[];
}
export interface ProductResponse {
  product: Product;
}
export interface CartResponse {
  cart: Cart;
}
export interface UserResponse {
  user: User;
}
