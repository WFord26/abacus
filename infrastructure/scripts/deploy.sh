#!/usr/bin/env bash

set -euo pipefail

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI (az) is required for deploy.sh" >&2
  exit 1
fi

ENVIRONMENT="${1:-dev}"
if [[ $# -gt 0 ]]; then
  shift
fi

PARAMS_FILE="infrastructure/bicep/parameters/${ENVIRONMENT}.bicepparam"
RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-rg-abacus-${ENVIRONMENT}}"
TEMPLATE_FILE="infrastructure/bicep/main.bicep"

if [[ ! -f "${PARAMS_FILE}" ]]; then
  echo "Parameter file not found: ${PARAMS_FILE}" >&2
  exit 1
fi

DEPLOYMENT_NAME="abacus-${ENVIRONMENT}-$(date +%Y%m%d%H%M%S)"
MODE="${DEPLOYMENT_MODE:-create}"

echo "Deploying ${TEMPLATE_FILE} to ${RESOURCE_GROUP} using ${PARAMS_FILE}"

az deployment group "${MODE}" \
  --name "${DEPLOYMENT_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --template-file "${TEMPLATE_FILE}" \
  --parameters "@${PARAMS_FILE}" \
  "$@"
