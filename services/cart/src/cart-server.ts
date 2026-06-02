// CartService gRPC handlers. A cart is stored as a Redis hash per user:
//   key   = cart:<userId>
//   field = productId, value = quantity
// proto-loader is configured with keepCase:true, so request/response objects
// use the proto's snake_case field names directly.
//
// Each handler emits a domain event (the four-signal "E") and logs failures via
// the structured logger; both are emitted inside the request's gRPC span, so the
// Logs API stamps the active trace_id/span_id — joining events/logs to their
// trace (correlation contract). Redis spans + RED metrics come from telemetry.ts.
import * as grpc from '@grpc/grpc-js';
import { redis } from './redis';
import { event, log } from './telemetry';

interface CartShape {
  user_id: string;
  items: { product_id: string; quantity: number }[];
}

function cartKey(userId: string): string {
  return `cart:${userId}`;
}

async function readCart(userId: string): Promise<CartShape> {
  const hash = await redis.hgetall(cartKey(userId));
  const items = Object.entries(hash).map(([product_id, qty]) => ({
    product_id,
    quantity: Number(qty),
  }));
  return { user_id: userId, items };
}

function itemCount(cart: CartShape): number {
  return cart.items.reduce((sum, item) => sum + item.quantity, 0);
}

// Reports an invalid-argument rejection: logs a warning (carries trace_id) and
// fails the RPC. The RED counter/histogram record the status via the interceptor.
function reject(
  callback: grpc.sendUnaryData<unknown>,
  method: string,
  message: string,
): void {
  log.warn('rejected cart request', { 'rpc.method': method, error: message });
  callback({ code: grpc.status.INVALID_ARGUMENT, message } as grpc.ServiceError, null);
}

// Reports an internal failure (e.g. Redis error): logs an error (carries
// trace_id) and fails the RPC.
function internal(callback: grpc.sendUnaryData<unknown>, method: string, err: unknown): void {
  log.error('cart request failed', { 'rpc.method': method, error: String(err) });
  callback({ code: grpc.status.INTERNAL, message: String(err) } as grpc.ServiceError, null);
}

export const cartHandlers = {
  GetCart(call: { request: { user_id: string } }, callback: grpc.sendUnaryData<unknown>): void {
    const userId = call.request.user_id;
    if (!userId) return reject(callback, 'GetCart', 'user_id is required');
    readCart(userId)
      .then((cart) => {
        event('cart.viewed', { 'user.id': userId, 'cart.item_count': itemCount(cart) });
        callback(null, { cart });
      })
      .catch((e) => internal(callback, 'GetCart', e));
  },

  AddItem(
    call: { request: { user_id: string; product_id: string; quantity: number } },
    callback: grpc.sendUnaryData<unknown>,
  ): void {
    const { user_id: userId, product_id: productId } = call.request;
    const quantity = Number(call.request.quantity ?? 0);
    if (!userId || !productId) {
      return reject(callback, 'AddItem', 'user_id and product_id are required');
    }
    (async () => {
      const newQty = await redis.hincrby(cartKey(userId), productId, quantity);
      if (newQty <= 0) await redis.hdel(cartKey(userId), productId);
      return readCart(userId);
    })()
      .then((cart) => {
        event('cart.item.added', {
          'user.id': userId,
          'product.id': productId,
          quantity,
          'cart.item_count': itemCount(cart),
        });
        callback(null, { cart });
      })
      .catch((e) => internal(callback, 'AddItem', e));
  },

  RemoveItem(
    call: { request: { user_id: string; product_id: string } },
    callback: grpc.sendUnaryData<unknown>,
  ): void {
    const { user_id: userId, product_id: productId } = call.request;
    if (!userId || !productId) {
      return reject(callback, 'RemoveItem', 'user_id and product_id are required');
    }
    (async () => {
      await redis.hdel(cartKey(userId), productId);
      return readCart(userId);
    })()
      .then((cart) => {
        event('cart.item.removed', {
          'user.id': userId,
          'product.id': productId,
          'cart.item_count': itemCount(cart),
        });
        callback(null, { cart });
      })
      .catch((e) => internal(callback, 'RemoveItem', e));
  },

  ClearCart(call: { request: { user_id: string } }, callback: grpc.sendUnaryData<unknown>): void {
    const userId = call.request.user_id;
    if (!userId) return reject(callback, 'ClearCart', 'user_id is required');
    redis
      .del(cartKey(userId))
      .then(() => {
        event('cart.cleared', { 'user.id': userId });
        callback(null, { cart: { user_id: userId, items: [] } });
      })
      .catch((e) => internal(callback, 'ClearCart', e));
  },
};
