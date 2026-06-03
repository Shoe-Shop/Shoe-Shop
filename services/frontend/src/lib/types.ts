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
