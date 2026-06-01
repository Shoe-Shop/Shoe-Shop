# Users service image (Python 3.12 · FastAPI · gRPC · Postgres).
# Build context is the REPO ROOT (see deploy/compose/compose.full.yaml) so the
# committed Python gRPC stubs (proto/gen/python) can be copied in.
#
#   docker build -f services/users/Dockerfile -t shoeshop/users:dev .
# syntax=docker/dockerfile:1

FROM python:3.12-slim AS build
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
RUN python -m venv /venv
ENV PATH="/venv/bin:$PATH"
COPY services/users/requirements.txt ./
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

FROM python:3.12-slim AS runtime
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/venv/bin:$PATH" \
    PYTHONPATH="/app:/app/gen/python"
WORKDIR /app

COPY --from=build /venv /venv
# Service sources and the committed gRPC stubs (consumed via PYTHONPATH).
COPY services/users/app ./app
COPY proto/gen/python ./gen/python

# Run as a non-root user.
RUN useradd --uid 10001 --create-home appuser && chown -R appuser /app
USER appuser

EXPOSE 9090 8080
CMD ["python", "-m", "app.main"]
