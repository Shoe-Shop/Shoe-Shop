#!/bin/bash
# Shoe Shop — create one database per service (ADR-0001 #3: database-per-service).
# Runs once, on first Postgres init (empty data dir).
#
# Note: Zitadel (full profile) manages its own database + role via its
# `start-from-init` step, so it is intentionally NOT created here.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-'EOSQL'
  CREATE DATABASE catalogue;
  CREATE DATABASE orders;
  CREATE DATABASE payment;
  CREATE DATABASE users;
  CREATE DATABASE shipping;
  CREATE DATABASE inventory;
EOSQL

echo "Shoe Shop: created per-service databases (catalogue, orders, payment, users, shipping, inventory)."
