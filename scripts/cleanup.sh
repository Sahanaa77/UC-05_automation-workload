#!/usr/bin/env bash
# =============================================================================
# scripts/cleanup.sh — WorkloadLens targeted resource removal (guarded)
# =============================================================================
#
# SCOPE — this script removes ONLY the two resources managed by infra/main.tf:
#   1. The Azure Container App   (azurerm_container_app.api)
#   2. The Blob container        (azurerm_storage_container.data)
#
#   The Storage Account is a pre-existing shared dependency — this script
#   NEVER deletes it, even if Terraform state holds its resource ID.
#
# NEVER deleted by this script:
#   • Azure Resource Group
#   • Azure Container Apps Environment
#   • Azure Database for PostgreSQL or any other database
#   • Any resource not listed in Terraform state for this module
#   • Any resource outside the two resource IDs confirmed at runtime
#
# DESIGN — guarded, opt-in, no automation:
#   This script does NOT call 'terraform destroy' automatically.
#   It reads Terraform outputs to identify exact resource IDs, presents a
#   confirmation checklist, and then prints the az CLI commands to run.
#   With --execute (plus typed confirmation), it runs those commands.
#   If any safety check cannot be verified, it stops and shows the manual
#   procedure instead.
#
# Usage:
#   ENV=dev ./scripts/cleanup.sh              # dry-run: show what would be deleted
#   ENV=dev ./scripts/cleanup.sh --execute    # require typed confirmation, then delete
# =============================================================================

set -euo pipefail

###############################################################################
# Helpers
###############################################################################

RED='\033[0;31m'
YEL='\033[1;33m'
GRN='\033[0;32m'
BLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${GRN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YEL}[WARN]${NC}  $*"; }
abort() { echo -e "${RED}[ABORT]${NC} $*" >&2; exit 1; }
banner(){ echo -e "${BLD}$*${NC}"; }

EXECUTE_MODE=false
for arg in "$@"; do
  [[ "${arg}" == "--execute" ]] && EXECUTE_MODE=true
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
INFRA_DIR="${REPO_ROOT}/infra"

###############################################################################
# §1 — Display intent banner
###############################################################################

echo ""
banner "╔══════════════════════════════════════════════════════════════╗"
banner "║           WorkloadLens — RESOURCE CLEANUP (GUARDED)           ║"
banner "╚══════════════════════════════════════════════════════════════╝"
echo ""
warn "This script targets ONLY resources created by infra/main.tf."
warn "It will NEVER touch: Resource Group, Container Apps Environment,"
warn "databases, or any resource outside the Terraform module outputs."
echo ""

if [[ "${EXECUTE_MODE}" == false ]]; then
  info "Running in DRY-RUN mode. No changes will be made."
  info "To execute deletions, re-run with: ENV=${ENV:-<dev|prod>} ./scripts/cleanup.sh --execute"
fi

echo ""

###############################################################################
# §2 — Preflight: required tools and ENV
###############################################################################

info "=== Preflight: required tools ==="

command -v terraform >/dev/null 2>&1 \
  || abort "terraform not found on PATH."

command -v az >/dev/null 2>&1 \
  || abort "az CLI not found on PATH."

ENV="${ENV:-}"
if [[ -z "${ENV}" ]]; then
  abort "ENV is not set. Run as: ENV=dev ./scripts/cleanup.sh  or  ENV=prod ./scripts/cleanup.sh"
fi

if [[ "${ENV}" != "dev" && "${ENV}" != "prod" ]]; then
  abort "ENV must be 'dev' or 'prod'. Got: '${ENV}'"
fi

TFVARS_FILE="${INFRA_DIR}/environments/${ENV}.tfvars"
[[ -f "${TFVARS_FILE}" ]] || abort "Parameter file not found: ${TFVARS_FILE}"

###############################################################################
# §3 — Verify Azure authentication and active subscription
###############################################################################

info "=== Verifying Azure authentication and active subscription ==="

if ! az account show --output none 2>/dev/null; then
  abort "Not authenticated to Azure. Run 'az login' first."
fi

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
SUBSCRIPTION_NAME=$(az account show --query name -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)

echo ""
warn "Active subscription: ${SUBSCRIPTION_NAME}"
warn "Subscription ID:     ${SUBSCRIPTION_ID}"
warn "Tenant ID:           ${TENANT_ID}"
warn "Environment:         ${ENV}"
echo ""

###############################################################################
# §4 — Read Terraform outputs to identify exact resource IDs
###############################################################################

info "=== Reading Terraform outputs to identify managed resources ==="

# Verify Terraform state exists and is initialised for this environment.
if [[ ! -f "${INFRA_DIR}/.terraform/terraform.tfstate" ]] && \
   [[ ! -f "${INFRA_DIR}/terraform.tfstate" ]]; then
  echo ""
  warn "Terraform state not found in ${INFRA_DIR}."
  warn "The module may not have been applied, or state may be remote."
  echo ""
  manual_procedure_hint() {
    echo ""
    banner "=== MANUAL PROCEDURE (use if Terraform state is unavailable) ==="
    echo ""
    echo "  1. Identify the Container App name, Storage Account name, and Blob container name."
    echo "     az containerapp list -g <resource-group> --query '[].name' -o tsv"
    echo "     az storage account list -g <resource-group> --query '[].name' -o tsv"
    echo "     az storage container list --account-name <storage-account-name> --auth-mode login --query '[].name' -o tsv"
    echo ""
    echo "  2. Verify each resource belongs to this project before deleting."
    echo "     az containerapp show -n <name> -g <rg> --query 'tags' -o json"
    echo "     az storage account show -n <name> -g <rg> --query 'tags' -o json"
    echo ""
    echo "  3. Delete ONLY the Container App and Blob container if confirmed."
    echo "     Do NOT delete the Storage Account, Resource Group, or Container Apps Environment."
    echo "     az containerapp delete -n <container-app-name> -g <rg> --yes"
    echo "     az storage container delete --name <blob-container-name> --account-name <storage-account-name> --auth-mode login"
    echo ""
    banner "================================================================="
    echo ""
  }
  manual_procedure_hint
  abort "Cannot guarantee safe deletion without Terraform state. See manual procedure above."
fi

TF_INIT_NEEDED=false
if [[ ! -f "${INFRA_DIR}/.terraform/terraform.tfstate" ]]; then
  TF_INIT_NEEDED=true
fi

if [[ "${TF_INIT_NEEDED}" == true ]]; then
  info "Running terraform init (read-only, no apply)..."
  terraform -chdir="${INFRA_DIR}" init -input=false >/dev/null 2>&1 \
    || abort "terraform init failed. Cannot read state safely."
fi

# Read outputs — these come from state (no Azure API call needed).
APP_NAME=$(terraform -chdir="${INFRA_DIR}" output -raw container_app_name 2>/dev/null || true)
APP_ID=$(terraform -chdir="${INFRA_DIR}" output -raw container_app_id 2>/dev/null || true)
STORAGE_NAME=$(terraform -chdir="${INFRA_DIR}" output -raw storage_account_name 2>/dev/null || true)
STORAGE_ID=$(terraform -chdir="${INFRA_DIR}" output -raw storage_account_id 2>/dev/null || true)
BLOB_CONTAINER=$(terraform -chdir="${INFRA_DIR}" output -raw blob_container_name 2>/dev/null || true)
TF_RG=$(terraform -chdir="${INFRA_DIR}" output -raw resource_group_name 2>/dev/null || true)

if [[ -z "${APP_ID}" || -z "${BLOB_CONTAINER}" ]]; then
  echo ""
  warn "Terraform outputs are empty — the module may not have been applied,"
  warn "or the resources may already have been deleted."
  abort "Cannot determine resource identifiers. No deletions performed."
fi

###############################################################################
# §5 — Safety checks: confirm resources live in expected subscription and RG
###############################################################################

info "=== Safety checks: verifying Container App resource ID against active subscription ==="

# The resource ID format encodes the subscription ID:
# /subscriptions/<sub-id>/resourceGroups/<rg>/...
APP_SUB=$(echo "${APP_ID}" | cut -d'/' -f3)

if [[ "${APP_SUB}" != "${SUBSCRIPTION_ID}" ]]; then
  abort "Container App resource ID belongs to subscription '${APP_SUB}',
  but you are logged in to '${SUBSCRIPTION_ID}'.
  Switch subscription: az account set --subscription ${APP_SUB}"
fi

# The Storage Account is a shared dependency — its subscription is not
# verified here because the Storage Account is never deleted by this script.

info "Container App resource ID confirmed in active subscription: ${SUBSCRIPTION_ID}"

###############################################################################
# §6 — Print deletion plan (always shown, even in dry-run)
###############################################################################

echo ""
banner "==================================================================="
banner " RESOURCES THAT WILL BE DELETED (${ENV} / ${SUBSCRIPTION_NAME})"
banner "==================================================================="
echo ""
echo "  Shared resources (NOT deleted by this script):"
echo "    Resource Group:  ${TF_RG}"
echo "    Storage Account: ${STORAGE_NAME}  ← preserved, not touched"
echo ""
echo "  1. Azure Container App           [WILL BE DELETED]"
echo "     Name: ${APP_NAME}"
echo "     ID:   ${APP_ID}"
echo ""
echo "  2. Blob Container                [WILL BE DELETED]"
echo "     Container Name:  ${BLOB_CONTAINER}"
echo "     Storage Account: ${STORAGE_NAME}  ← the account itself is NOT deleted"
echo ""
banner "==================================================================="
echo ""
warn "The Storage Account, Resource Group, Container Apps Environment,"
warn "and database will NOT be touched by this script."
echo ""

###############################################################################
# §7 — Dry-run exit or guarded execution
###############################################################################

if [[ "${EXECUTE_MODE}" == false ]]; then
  info "DRY-RUN complete. No changes made."
  echo ""
  info "To delete these resources, run with --execute:"
  info "  ENV=${ENV} ./scripts/cleanup.sh --execute"
  echo ""
  info "Equivalent az CLI commands (run manually if preferred):"
  echo "  az containerapp delete --ids \"${APP_ID}\" --yes"
  echo "  az storage container delete --name \"${BLOB_CONTAINER}\" --account-name \"${STORAGE_NAME}\" --auth-mode login"
  echo ""
  warn "The Storage Account '${STORAGE_NAME}' is a shared dependency and is NOT deleted."
  exit 0
fi

###############################################################################
# §8 — Explicit typed confirmation (required for --execute)
###############################################################################

echo ""
warn "YOU ARE ABOUT TO DELETE AZURE RESOURCES. THIS CANNOT BE UNDONE."
warn "Type the Container App name exactly to confirm: ${APP_NAME}"
echo ""
read -rp "Container App name: " TYPED_CONFIRM

if [[ "${TYPED_CONFIRM}" != "${APP_NAME}" ]]; then
  abort "Confirmation name did not match. Expected: '${APP_NAME}', Got: '${TYPED_CONFIRM}'. Aborted."
fi

echo ""
info "Confirmation accepted."

###############################################################################
# §9 — Targeted deletion via az CLI (not terraform destroy)
###############################################################################

info "=== Deleting Azure Container App ==="
info "  az containerapp delete --ids \"${APP_ID}\" --yes"
az containerapp delete --ids "${APP_ID}" --yes \
  && info "Container App deleted: ${APP_NAME}" \
  || abort "Container App deletion failed. Check the Azure Portal and retry manually."

info "=== Deleting Blob Container (Storage Account is preserved) ==="
info "  az storage container delete --name \"${BLOB_CONTAINER}\" --account-name \"${STORAGE_NAME}\" --auth-mode login"
az storage container delete \
  --name "${BLOB_CONTAINER}" \
  --account-name "${STORAGE_NAME}" \
  --auth-mode login \
  && info "Blob container deleted: ${BLOB_CONTAINER} (Storage Account '${STORAGE_NAME}' is intact)" \
  || abort "Blob container deletion failed. Check the Azure Portal and retry manually."

###############################################################################
# §10 — Post-cleanup summary
###############################################################################

echo ""
banner "==================================================================="
banner " CLEANUP COMPLETE"
banner "==================================================================="
echo ""
info "Deleted:"
info "  ✔ Container App:   ${APP_NAME}"
info "  ✔ Blob Container:  ${BLOB_CONTAINER}"
echo ""
warn "The following shared resources were NOT touched:"
warn "  • Resource Group: ${TF_RG}"
warn "  • Container Apps Environment (referenced by resource ID)"
warn "  • Database / DATABASE_URL (external, out of scope)"
echo ""
warn "Terraform state still references the deleted resources."
warn "Run 'terraform -chdir=infra state rm ...' or re-apply to reconcile."
echo ""
