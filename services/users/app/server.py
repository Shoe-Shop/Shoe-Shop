"""UsersService gRPC handlers.

Reads and writes go to PostgreSQL via asyncpg. asyncpg is OTel-instrumented
(see telemetry.py), so every query becomes a child span of the active gRPC
request -- the catalogue reference pattern, in Python.
"""

import logging
import uuid

import asyncpg
import grpc

from app import telemetry
from users.v1 import users_pb2, users_pb2_grpc

log = logging.getLogger("users.service")

_DEFAULT_PAGE_SIZE = 20
_MAX_PAGE_SIZE = 100

_USER_COLUMNS = "id, email, full_name, created_at"


def _row_to_user(row: asyncpg.Record) -> users_pb2.User:
    return users_pb2.User(
        id=str(row["id"]),
        email=row["email"],
        full_name=row["full_name"],
        created_at=row["created_at"].isoformat(),
    )


class UsersService(users_pb2_grpc.UsersServiceServicer):
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def CreateUser(self, request, context):
        email = request.email.strip().lower()
        if not email:
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, "email is required")
        try:
            row = await self._pool.fetchrow(
                f"INSERT INTO users (email, full_name) VALUES ($1, $2) "
                f"RETURNING {_USER_COLUMNS}",
                email,
                request.full_name,
            )
        except asyncpg.UniqueViolationError:
            log.warning("create user rejected: duplicate email", extra={"user.email": email})
            await context.abort(
                grpc.StatusCode.ALREADY_EXISTS,
                f"user with email {email!r} already exists",
            )
        user = _row_to_user(row)
        log.info("created user", extra={"user.id": user.id, "user.email": user.email})
        telemetry.event(
            "users.user.created",
            {"user.id": user.id, "user.email": user.email},
        )
        return users_pb2.CreateUserResponse(user=user)

    async def GetUser(self, request, context):
        if not request.id:
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, "id is required")
        try:
            user_id = uuid.UUID(request.id)
        except ValueError:
            await context.abort(
                grpc.StatusCode.INVALID_ARGUMENT, f"id {request.id!r} is not a valid uuid"
            )
        row = await self._pool.fetchrow(
            f"SELECT {_USER_COLUMNS} FROM users WHERE id = $1", user_id
        )
        if row is None:
            log.warning("user not found", extra={"user.id": request.id})
            await context.abort(
                grpc.StatusCode.NOT_FOUND, f"user {request.id!r} not found"
            )
        user = _row_to_user(row)
        telemetry.event("users.user.viewed", {"user.id": user.id})
        return users_pb2.GetUserResponse(user=user)

    async def GetUserByEmail(self, request, context):
        email = request.email.strip().lower()
        if not email:
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, "email is required")
        row = await self._pool.fetchrow(
            f"SELECT {_USER_COLUMNS} FROM users WHERE email = $1", email
        )
        if row is None:
            log.warning("user not found by email", extra={"user.email": email})
            await context.abort(
                grpc.StatusCode.NOT_FOUND, f"user with email {email!r} not found"
            )
        user = _row_to_user(row)
        telemetry.event("users.user.viewed", {"user.id": user.id})
        return users_pb2.GetUserByEmailResponse(user=user)

    async def ListUsers(self, request, context):
        page_size = request.page_size
        if page_size <= 0 or page_size > _MAX_PAGE_SIZE:
            page_size = _DEFAULT_PAGE_SIZE
        page = request.page if request.page > 0 else 1
        offset = (page - 1) * page_size

        total = await self._pool.fetchval("SELECT count(*) FROM users")
        rows = await self._pool.fetch(
            f"SELECT {_USER_COLUMNS} FROM users ORDER BY created_at, id "
            f"LIMIT $1 OFFSET $2",
            page_size,
            offset,
        )
        log.info(
            "listed users",
            extra={"page": page, "page_size": page_size, "returned": len(rows), "total": int(total)},
        )
        telemetry.event(
            "users.users.listed",
            {"page": page, "returned": len(rows), "total": int(total)},
        )
        return users_pb2.ListUsersResponse(
            users=[_row_to_user(r) for r in rows],
            total=int(total),
        )
