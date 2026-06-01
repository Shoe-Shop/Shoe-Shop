// gRPC client for the Catalogue service. The .proto is loaded dynamically at
// runtime (no codegen). grpc-js is auto-instrumented by OpenTelemetry, so each
// call becomes a CLIENT span parented to the incoming HTTP request span.
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const PROTO_PATH =
  process.env.CATALOGUE_PROTO ?? '/app/proto/catalogue/v1/catalogue.proto';
const ADDR = process.env.CATALOGUE_ADDR ?? 'catalogue:9090';

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false, // snake_case proto fields -> camelCase JS (page_size -> pageSize)
  longs: String, // int64 (price_cents) as string, matching JSON output
  enums: String,
  defaults: true,
  oneofs: true,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proto = grpc.loadPackageDefinition(packageDefinition) as any;
const client = new proto.catalogue.v1.CatalogueService(
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

export const catalogue = {
  listProducts: (req: { page?: number; pageSize?: number }) =>
    unary<{ products: Product[]; total: number }>('ListProducts', req),
  getProduct: (req: { id: string }) =>
    unary<{ product: Product }>('GetProduct', req),
  searchProducts: (req: { query: string; limit?: number }) =>
    unary<{ products: Product[]; estimatedTotal: number }>('SearchProducts', req),
};

export { grpc };
