// gRPC client for the Orders service. Like the other clients, the .proto is
// loaded dynamically at runtime (no codegen) and grpc-js is auto-instrumented by
// OpenTelemetry, so CreateOrder becomes a CLIENT span parented to the incoming
// HTTP request span — yielding a frontend -> bff -> orders trace whose async saga
// (orders -> inventory -> ... over NATS) continues under the same trace_id.
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const PROTO_PATH = process.env.ORDERS_PROTO ?? '/app/proto/orders/v1/orders.proto';
const ADDR = process.env.ORDERS_ADDR ?? 'orders:9090';

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false, // snake_case proto fields -> camelCase JS (total_cents -> totalCents)
  longs: String, // int64 (total_cents, unit_price_cents) as string, matching JSON output
  enums: String, // OrderStatus as its name, e.g. "ORDER_STATUS_PENDING"
  defaults: true,
  oneofs: true,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proto = grpc.loadPackageDefinition(packageDefinition) as any;
const client = new proto.orders.v1.OrdersService(
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

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPriceCents: string;
}

export interface Order {
  id: string;
  userId: string;
  status: string;
  totalCents: string;
  currency: string;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export const orders = {
  createOrder: (req: { userId: string; items: OrderItem[]; currency: string }) =>
    unary<{ order: Order }>('CreateOrder', req),
  getOrder: (req: { orderId: string }) =>
    unary<{ order: Order }>('GetOrder', req),
};
