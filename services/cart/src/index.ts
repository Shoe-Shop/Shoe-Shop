import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { cartHandlers } from './cart-server';
import { startHealthServer } from './health';

const PROTO_PATH = process.env.CART_PROTO ?? '/app/proto/cart/v1/cart.proto';
const GRPC_ADDR = process.env.CART_GRPC_ADDR ?? '0.0.0.0:9090';
const HEALTH_PORT = Number(process.env.HEALTH_PORT ?? '8080');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: Number,
  enums: String,
  defaults: true,
  oneofs: true,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proto = grpc.loadPackageDefinition(packageDefinition) as any;

const server = new grpc.Server();
server.addService(proto.cart.v1.CartService.service, cartHandlers);

server.bindAsync(GRPC_ADDR, grpc.ServerCredentials.createInsecure(), (err, port) => {
  if (err) {
    console.error(JSON.stringify({ level: 'error', msg: 'gRPC bind failed', err: String(err) }));
    process.exit(1);
  }
  console.log(JSON.stringify({ level: 'info', msg: 'cart gRPC listening', addr: GRPC_ADDR, port }));
});

startHealthServer(HEALTH_PORT);

function shutdown(): void {
  server.tryShutdown(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
