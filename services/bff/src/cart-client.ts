// gRPC client for the Cart service. Like catalogue-client, the .proto is loaded
// dynamically at runtime (no codegen) and grpc-js is auto-instrumented by
// OpenTelemetry, so each call becomes a CLIENT span parented to the incoming
// HTTP request span — yielding a bff -> cart -> redis trace in Tempo.
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const PROTO_PATH = process.env.CART_PROTO ?? '/app/proto/cart/v1/cart.proto';
const ADDR = process.env.CART_ADDR ?? 'cart:9090';

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false, // snake_case proto fields -> camelCase JS (user_id -> userId)
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proto = grpc.loadPackageDefinition(packageDefinition) as any;
const client = new proto.cart.v1.CartService(
  ADDR,
  grpc.credentials.createInsecure(),
);

function unary<TRes>(method: string, request: object): Promise<TRes> {
  return new Promise<TRes>((resolve, reject) => {
    client[method](request, (err: grpc.ServiceError | null, res: TRes) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface Cart {
  userId: string;
  items: CartItem[];
}

export const cart = {
  getCart: (req: { userId: string }) =>
    unary<{ cart: Cart }>('GetCart', req),
  addItem: (req: { userId: string; productId: string; quantity: number }) =>
    unary<{ cart: Cart }>('AddItem', req),
  removeItem: (req: { userId: string; productId: string }) =>
    unary<{ cart: Cart }>('RemoveItem', req),
  clearCart: (req: { userId: string }) =>
    unary<{ cart: Cart }>('ClearCart', req),
};
