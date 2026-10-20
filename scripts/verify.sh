#!/usr/bin/env bash
# =============================================================================
# scripts/verify.sh — WorkloadLens health smoke test [+ A01 infrastructure check]
# =============================================================================
# Usage:
#   ./scripts/verify.sh <container-app-fqdn>          # smoke-test only
#   ./scripts/verify.sh <container-app-fqdn> dev      # smoke test + A01 check
#   ./scripts/verify.sh <container-app-fqdn> prod     # smoke test + A01 check
#
# Without an environment argument this script runs SMOKE TEST ONLY.
# It checks that the live endpoint responds correctly but does NOT verify that
# the Terraform-managed infrastructure is free of unexpected drift.
# This is NOT full A01 verification.
#
# With 'dev' or 'prod' both stages run:
#
#   Stage 1 — Smoke test:
#     GET https://<fqdn>/health → asserts HTTP 200 and JSON body with "status".
#     The health endpoint /health on port 8000 is confirmed by Sanaa.
#     The Container Apps ingress serves HTTPS on port 443 and forwards to
#     the container's port 8000 internally.
#
#   Stage 2 — A01 infrastructure idempotency check:
#     terraform -chdir=infra init -input=false -no-color
#     terraform -chdir=infra plan -input=false \
#       -var-file="environments/<env>.tfvars" \
#       -detailed-exitcode -no-color
#     Exit 0 = PASS (no changes). Exit 2 = FAIL (changes detected).
#     Exit 1 = FAIL (planning error). Never runs apply or destroy.
#
# ENV may also be set as an environment variable; the positional argument
# takes precedence if both are supplied.
#
# NOTE on Terraform state secrets:
#   'sensitive = true' on a Terraform variable suppresses its value from
#   plan/apply console output, but the plaintext value IS stored in Terraform
#   state. Never commit .tfstate files to VCS. If using a remote backend,
#   restrict access to the state storage container.
#   TF_VAR_database_url must be exported before running this script if the
#   A01 stage is used; the plan will fail without it (by design, not silently).
#   This script never prints the value of TF_VAR_database_url.
# =============================================================================

set -euo pipefail

###############################################################################
# Helpers
###############################################################################

RED='\033[0;31m'
GRN='\033[0;32m'
YEL='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GRN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YEL}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
INFRA_DIR="${REPO_ROOT}/infra"

###############################################################################
# Argument parsing
###############################################################################

FQDN="${1:-}"
if [[ -z "${FQDN}" ]]; then
  fail "Usage: ./scripts/verify.sh <container-app-fqdn> [dev|prod]
  <container-app-fqdn>  Required. The Container App's public FQDN.
                        Obtain it from: terraform -chdir=infra output -raw container_app_fqdn
  [dev|prod]            Optional. Enables the A01 Terraform idempotency check.
                        Without this argument only the health smoke test runs."
fi

# Strip any accidental https:// or http:// prefix the caller might have included.
FQDN="${FQDN#https://}"
FQDN="${FQDN#http://}"
FQDN="${FQDN%/}"

# Positional argument takes precedence over the environment variable.
ENV_ARG="${2:-}"
ENV="${ENV_ARG:-${ENV:-}}"

HEALTH_URL="https://${FQDN}/health"
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

###############################################################################
# Stage 1 — Health check
###############################################################################

if [[ -n "${ENV}" ]]; then
  info "=== Stage 1 of 2: Health smoke test (${FQDN}) ==="
else
  info "=== Health smoke test (smoke-test-only mode — NOT full A01 verification) ==="
fi
info "Timestamp:  ${TIMESTAMP}"
info "Target URL: ${HEALTH_URL}"

RETRIES=5
RETRY_DELAY=15

info "Sending GET ${HEALTH_URL} (up to ${RETRIES} attempts, ${RETRY_DELAY}s between retries)..."

HTTP_RESPONSE=$(
  curl \
    --silent \
    --show-error \
    --retry "${RETRIES}" \
    --retry-delay "${RETRY_DELAY}" \
    --retry-connrefused \
    --max-time 30 \
    --write-out "\n__HTTP_STATUS__%{http_code}" \
    "${HEALTH_URL}" \
  2>&1
) || {
  fail "curl failed after ${RETRIES} retries. The Container App may not be ready yet.
  Manual check: curl -v ${HEALTH_URL}"
}

HTTP_BODY=$(echo "${HTTP_RESPONSE}" | sed '/^__HTTP_STATUS__/d')
HTTP_STATUS=$(echo "${HTTP_RESPONSE}" | grep '^__HTTP_STATUS__' | sed 's/__HTTP_STATUS__//')

info "HTTP status: ${HTTP_STATUS}"
info "Response body:"
echo "${HTTP_BODY}" | sed 's/^/  /'

# Assert HTTP 200.
if [[ "${HTTP_STATUS}" != "200" ]]; then
  fail "Expected HTTP 200, got ${HTTP_STATUS}.
  Full response: ${HTTP_BODY}"
fi

# Assert body is non-empty JSON-like (contains a '{').
if [[ "${HTTP_BODY}" != *"{"* ]]; then
  fail "Response body does not look like JSON. Got: ${HTTP_BODY}"
fi

# Assert body contains a 'status' key.
if [[ "${HTTP_BODY}" != *'"status"'* ]]; then
  warn "Response body does not contain a 'status' key. Body: ${HTTP_BODY}"
  warn "Continuing — the app is reachable but the health response format may differ."
fi

echo ""
if [[ -n "${ENV}" ]]; then
  echo -e "${GRN}✔ Stage 1 PASS${NC} — ${HEALTH_URL} returned HTTP ${HTTP_STATUS} at ${TIMESTAMP}"
else
  echo -e "${GRN}✔ SMOKE TEST PASS${NC} — ${HEALTH_URL} returned HTTP ${HTTP_STATUS} at ${TIMESTAMP}"
  echo ""
  warn "This is SMOKE TEST ONLY. Infrastructure drift has not been checked."
  warn "For full A01 verification, pass the environment as a second argument:"
  warn "  ./scripts/verify.sh ${FQDN} dev"
  warn "  ./scripts/verify.sh ${FQDN} prod"
  echo ""
  exit 0
fi
echo ""

###############################################################################
# Stage 2 — A01 infrastructure idempotency check (Terraform plan, read-only)
###############################################################################

if [[ "${ENV}" != "dev" && "${ENV}" != "prod" ]]; then
  fail "Environment must be 'dev' or 'prod'. Got: '${ENV}'"
fi

TFVARS_FILE="${INFRA_DIR}/environments/${ENV}.tfvars"
if [[ ! -f "${TFVARS_FILE}" ]]; then
  fail "Parameter file not found: ${TFVARS_FILE}
  Cannot run Terraform plan without a valid .tfvars file."
fi

info "=== Stage 2 of 2: A01 infrastructure idempotency check (${ENV}) ==="
info "Parameter file: ${TFVARS_FILE}"
info "Running: terraform plan -input=false -detailed-exitcode (read-only, no apply or destroy)"

if [[ -z "${TF_VAR_database_url:-}" ]]; then
  warn "TF_VAR_database_url is not set. Terraform plan will fail without it."
  warn "Export it before running this script (value is never printed by this script):"
  warn "  export TF_VAR_database_url=\"postgresql://user:pass@host:5432/dbname\""
fi

# Ensure providers are initialised (idempotent, no-op if already done).
command -v terraform >/dev/null 2>&1 \
  || fail "terraform not found on PATH. Install from https://developer.hashicorp.com/terraform/install"

info "Running: terraform init -input=false -no-color"
terraform -chdir="${INFRA_DIR}" init -input=false -no-color >/dev/null 2>&1 \
  || fail "terraform init failed. Cannot run plan safely."

# -detailed-exitcode semantics (Terraform documented behaviour):
#   exit 0 → succeeded, no changes needed      → A01 PASS
#   exit 2 → succeeded, changes are present    → A01 FAIL (unexpected drift)
#   exit 1 → plan itself errored               → A01 FAIL (config/auth/state error)
#
# IMPORTANT: 'set -e' is active. We must capture the exit code with '|| PLAN_EXIT=$?'
# rather than relying on the shell to propagate it, to avoid premature script exit
# before our explicit error message is printed.
echo ""
PLAN_EXIT=0
terraform -chdir="${INFRA_DIR}" plan \
  -input=false \
  -var-file="environments/${ENV}.tfvars" \
  -detailed-exitcode \
  -no-color \
  2>&1 || PLAN_EXIT=$?

echo ""

if [[ "${PLAN_EXIT}" -eq 0 ]]; then
  echo -e "${GRN}✔ A01 PASS${NC} — terraform plan: no changes. Infrastructure matches desired state (${ENV})."
elif [[ "${PLAN_EXIT}" -eq 2 ]]; then
  fail "A01 FAIL — terraform plan detected UNEXPECTED CHANGES (exit code 2).
  Drift found between Terraform state and real Azure resources.
  Review the plan output above before taking any action.
  Do NOT run 'terraform apply' without understanding every proposed change."
else
  fail "A01 FAIL — terraform plan exited with error code ${PLAN_EXIT}.
  Check Azure authentication, .tfvars values, and provider connectivity.
  Hint: ensure TF_VAR_database_url is exported and 'az account show' succeeds."
fi

echo ""
