#!/usr/bin/env bash

set -euo pipefail

run_migration() {
  local package_name="$1"
  local database_url="$2"

  if [[ -z "${database_url}" ]]; then
    echo "Skipping ${package_name}; database URL is empty"
    return
  fi

  echo "Applying migrations for ${package_name}"
  DATABASE_URL="${database_url}" npx --yes pnpm --filter "${package_name}" exec prisma migrate deploy
}

run_migration "@wford26/accounting-identity-service" "${IDENTITY_DATABASE_URL:-}"
run_migration "@wford26/accounting-ledger-service" "${LEDGER_DATABASE_URL:-}"
run_migration "@wford26/accounting-documents-service" "${DOCUMENTS_DATABASE_URL:-}"
run_migration "@wford26/accounting-reporting-service" "${REPORTING_DATABASE_URL:-}"
run_migration "@wford26/accounting-invoicing-service" "${INVOICING_DATABASE_URL:-}"

