// CartService gRPC handlers. A cart is stored as a Redis hash per user:
//   key   = cart:<userId>
//   field = productId, value = quantity
// proto-loader is configured with keepCase:true, so request/response objects
// use the proto's snake_case field names directly.
import * as grpc from '@grpc/grpc-js';
import { redis } from './redis';

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

function fail(callback: grpc.sendUnaryData<unknown>, code: number, message: string): void {
  callback({ code, message } as grpc.ServiceError, null);
}

export const cartHandlers = {
  GetCart(call: { request: { user_id: string } }, callback: grpc.sendUnaryData<unknown>): void {
    const userId = call.request.user_id;
    if (!userId) return fail(callback, grpc.status.INVALID_ARGUMENT, 'user_id is required');
    readCart(userId)
      .then((cart) => callback(null, { cart }))
      .catch((e) => fail(callback, grpc.status.INTERNAL, String(e)));
  },

  AddItem(
    call: { request: { user_id: string; product_id: string; quantity: number } },
    callback: grpc.sendUnaryData<unknown>,
  ): void {
    const { user_id: userId, product_id: productId } = call.request;
    const quantity = Number(call.request.quantity ?? 0);
    if (!userId || !productId) {
      return fail(callback, grpc.status.INVALID_ARGUMENT, 'user_id and product_id are required');
    }
    (async () => {
      const newQty = await redis.hincrby(cartKey(userId), productId, quantity);
      if (newQty <= 0) await redis.hdel(cartKey(userId), productId);
      return readCart(userId);
    })()
      .then((cart) => callback(null, { cart }))
      .catch((e) => fail(callback, grpc.status.INTERNAL, String(e)));
  },

  RemoveItem(
    call: { request: { user_id: string; product_id: string } },
    callback: grpc.sendUnaryData<unknown>,
  ): void {
    const { user_id: userId, product_id: productId } = call.request;
    if (!userId || !productId) {
      return fail(callback, grpc.status.INVALID_ARGUMENT, 'user_id and product_id are required');
    }
    (async () => {
      await redis.hdel(cartKey(userId), productId);
      return readCart(userId);
    })()
      .then((cart) => callback(null, { cart }))
      .catch((e) => fail(callback, grpc.status.INTERNAL, String(e)));
  },

  ClearCart(call: { request: { user_id: string } }, callback: grpc.sendUnaryData<unknown>): void {
    const userId = call.request.user_id;
    if (!userId) return fail(callback, grpc.status.INVALID_ARGUMENT, 'user_id is required');
    redis
      .del(cartKey(userId))
      .then(() => callback(null, { cart: { user_id: userId, items: [] } }))
      .catch((e) => fail(callback, grpc.status.INTERNAL, String(e)));
  },
};
