#!/usr/bin/env bash
# =============================================================================
# scripts/deploy.sh — WorkloadLens Azure deployment
# =============================================================================
# Usage:
#   export TF_VAR_database_url="postgresql://user:pass@host:5432/dbname"
#   ENV=dev ./scripts/deploy.sh
#   ENV=prod ./scripts/deploy.sh
#
# The script aborts with a clear error if ANY preflight check fails.
# It never creates resources not defined in infra/main.tf.
# =============================================================================

set -euo pipefail

###############################################################################
# Helpers
###############################################################################

RED='\033[0;31m'
YEL='\033[1;33m'
GRN='\033[0;32m'
NC='\033[0m'

info()  { echo -e "${GRN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YEL}[WARN]${NC}  $*"; }
abort() { echo -e "${RED}[ABORT]${NC} $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
INFRA_DIR="${REPO_ROOT}/infra"

###############################################################################
# Preflight — §1: Required tools
###############################################################################

info "=== Preflight: checking required tools ==="

command -v terraform >/dev/null 2>&1 \
  || abort "terraform not found on PATH. Install from https://developer.hashicorp.com/terraform/install"

command -v az >/dev/null 2>&1 \
  || abort "az CLI not found on PATH. Install from https://learn.microsoft.com/en-us/cli/azure/install-azure-cli"

command -v curl >/dev/null 2>&1 \
  || abort "curl not found on PATH. Install curl before proceeding."

TF_VERSION=$(terraform version -json | python3 -c "import sys,json; print(json.load(sys.stdin)['terraform_version'])" 2>/dev/null || terraform version | head -1)
info "terraform version: ${TF_VERSION}"

AZ_VERSION=$(az version --query '"azure-cli"' -o tsv 2>/dev/null || echo "unknown")
info "az CLI version: ${AZ_VERSION}"

###############################################################################
# Preflight — §2: ENV parameter
###############################################################################

info "=== Preflight: validating ENV ==="

ENV="${ENV:-}"
if [[ -z "${ENV}" ]]; then
  abort "ENV is not set. Run as: ENV=dev ./scripts/deploy.sh  or  ENV=prod ./scripts/deploy.sh"
fi

if [[ "${ENV}" != "dev" && "${ENV}" != "prod" ]]; then
  abort "ENV must be 'dev' or 'prod'. Got: '${ENV}'"
fi

TFVARS_FILE="${INFRA_DIR}/environments/${ENV}.tfvars"
if [[ ! -f "${TFVARS_FILE}" ]]; then
  abort "Parameter file not found: ${TFVARS_FILE}"
fi

info "Environment: ${ENV}"
info "Parameter file: ${TFVARS_FILE}"

###############################################################################
# Preflight — §3: DATABASE_URL must be set, never from a file
###############################################################################

info "=== Preflight: checking DATABASE_URL secret ==="

if [[ -z "${TF_VAR_database_url:-}" ]]; then
  abort "TF_VAR_database_url is not set.
  Supply it via environment variable only — never in a .tfvars file:
    export TF_VAR_database_url=\"postgresql://user:pass@host:5432/dbname\"
  Then re-run: ENV=${ENV} ./scripts/deploy.sh"
fi

info "TF_VAR_database_url is set (value not echoed)."

###############################################################################
# Preflight — §4: Detect unfilled placeholders in the parameter file
###############################################################################

info "=== Preflight: checking for unfilled FILL_IN_* placeholders ==="

PLACEHOLDERS=$(grep -c 'FILL_IN_' "${TFVARS_FILE}" || true)
if [[ "${PLACEHOLDERS}" -gt 0 ]]; then
  echo ""
  warn "The following lines in ${TFVARS_FILE} still contain placeholder values:"
  grep -n 'FILL_IN_' "${TFVARS_FILE}" | sed 's/^/  /'
  echo ""
  abort "${PLACEHOLDERS} placeholder(s) must be replaced before deploying.
  Edit ${TFVARS_FILE} and replace every FILL_IN_* with your actual Azure values."
fi

info "No unfilled placeholders found."

###############################################################################
# Preflight — §5: Azure authentication
###############################################################################

info "=== Preflight: verifying Azure authentication ==="

if ! az account show --output none 2>/dev/null; then
  abort "Not authenticated to Azure. Run 'az login' first, then re-run deploy.sh."
fi

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
SUBSCRIPTION_NAME=$(az account show --query name -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)

info "Active subscription: ${SUBSCRIPTION_NAME} (${SUBSCRIPTION_ID})"
info "Tenant: ${TENANT_ID}"

echo ""
warn "Deploying to subscription: ${SUBSCRIPTION_NAME}"
warn "Subscription ID:           ${SUBSCRIPTION_ID}"
warn "Environment:               ${ENV}"
echo ""
read -rp "Continue with this subscription? [y/N] " CONFIRM_SUB
if [[ "${CONFIRM_SUB}" != "y" && "${CONFIRM_SUB}" != "Y" ]]; then
  abort "Aborted by user. Switch subscription with: az account set --subscription <name-or-id>"
fi

###############################################################################
# Terraform: init → validate → plan → apply
###############################################################################

info "=== Terraform: init ==="
terraform -chdir="${INFRA_DIR}" init

info "=== Terraform: validate ==="
terraform -chdir="${INFRA_DIR}" validate

info "=== Terraform: plan ==="
PLAN_FILE="${INFRA_DIR}/tfplan-${ENV}"
terraform -chdir="${INFRA_DIR}" plan \
  -var-file="environments/${ENV}.tfvars" \
  -out="${PLAN_FILE}"

echo ""
warn "Review the plan above. Exactly 2 resources will be created:"
warn "  • azurerm_container_app.api       (Container App)"
warn "  • azurerm_storage_container.data  (Blob container inside the existing Storage Account)"
warn "The Storage Account itself is a pre-existing dependency — it is NOT created or destroyed."
echo ""
read -rp "Apply this plan? [y/N] " CONFIRM_APPLY
if [[ "${CONFIRM_APPLY}" != "y" && "${CONFIRM_APPLY}" != "Y" ]]; then
  abort "Apply cancelled. The plan file is saved at: ${PLAN_FILE}"
fi

info "=== Terraform: apply ==="
terraform -chdir="${INFRA_DIR}" apply "${PLAN_FILE}"

###############################################################################
# Post-apply: capture outputs and run smoke test
###############################################################################

info "=== Reading Terraform outputs ==="

FQDN=$(terraform -chdir="${INFRA_DIR}" output -raw container_app_fqdn 2>/dev/null || true)
APP_NAME=$(terraform -chdir="${INFRA_DIR}" output -raw container_app_name 2>/dev/null || true)
STORAGE=$(terraform -chdir="${INFRA_DIR}" output -raw storage_account_name 2>/dev/null || true)

echo ""
info "Container App FQDN:    ${FQDN:-<not available>}"
info "Container App name:    ${APP_NAME:-<not available>}"
info "Storage Account name:  ${STORAGE:-<not available>}"
echo ""

if [[ -z "${FQDN}" ]]; then
  warn "FQDN not available yet — Container App may still be starting."
  warn "Run verify.sh manually once it is ready:"
  warn "  ./scripts/verify.sh <fqdn>"
  exit 0
fi

info "=== Running smoke test ==="
"${SCRIPT_DIR}/verify.sh" "${FQDN}"
