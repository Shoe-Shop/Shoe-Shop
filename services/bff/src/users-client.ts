// gRPC client for the Users service. Like catalogue-client/cart-client, the
// .proto is loaded dynamically at runtime (no codegen) and grpc-js is
// auto-instrumented by OpenTelemetry, so each call becomes a CLIENT span
// parented to the incoming HTTP request span — yielding a
// bff -> users -> postgres trace in Tempo.
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const PROTO_PATH = process.env.USERS_PROTO ?? '/app/proto/users/v1/users.proto';
const ADDR = process.env.USERS_ADDR ?? 'users:9090';

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false, // snake_case proto fields -> camelCase JS (full_name -> fullName)
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proto = grpc.loadPackageDefinition(packageDefinition) as any;
const client = new proto.users.v1.UsersService(
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

export interface User {
  id: string;
  email: string;
  fullName: string;
  // RFC 3339 / ISO 8601 timestamp.
  createdAt: string;
}

export const users = {
  getUser: (req: { id: string }) =>
    unary<{ user: User }>('GetUser', req),
  getUserByEmail: (req: { email: string }) =>
    unary<{ user: User }>('GetUserByEmail', req),
};
