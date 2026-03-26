#!/usr/bin/env bash

set -euo pipefail

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI (az) is required for bootstrap-azure.sh" >&2
  exit 1
fi

ENVIRONMENT="${1:-dev}"
LOCATION="${AZURE_LOCATION:-eastus2}"
PREFIX="${ABACUS_PREFIX:-abacus}"
RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-rg-${PREFIX}-${ENVIRONMENT}}"
REGISTRY_NAME="${AZURE_ACR_NAME:-${PREFIX}${ENVIRONMENT}cr}"

echo "Creating or updating resource group ${RESOURCE_GROUP} in ${LOCATION}"
az group create --name "${RESOURCE_GROUP}" --location "${LOCATION}" --output table

echo "Creating or updating Azure Container Registry ${REGISTRY_NAME}"
az acr create \
  --admin-enabled true \
  --location "${LOCATION}" \
  --name "${REGISTRY_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --sku Basic \
  --output table

echo
echo "Bootstrap complete."
echo "Next step: infrastructure/scripts/deploy.sh ${ENVIRONMENT}"

