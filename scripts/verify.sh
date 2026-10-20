#!/usr/bin/env bash
# =============================================================================
# scripts/verify.sh — WorkloadLens health check
# =============================================================================
# Usage:
#   ./scripts/verify.sh <container-app-fqdn>
#
# Performs GET /health against the Container App's external HTTPS endpoint
# and reports PASS (exit 0) or FAIL (exit 1).
#
# The health endpoint path /health on port 8000 is confirmed by Sanaa.
# The FQDN is served over HTTPS by the Container Apps ingress (port 443);
# the ingress forwards to the container's port 8000 internally.
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

###############################################################################
# Argument validation
###############################################################################

FQDN="${1:-}"
if [[ -z "${FQDN}" ]]; then
  fail "Usage: ./scripts/verify.sh <container-app-fqdn>
  The FQDN is available after deploy as a Terraform output:
    terraform -chdir=infra output -raw container_app_fqdn"
fi

# Strip any accidental https:// prefix the caller might have included.
FQDN="${FQDN#https://}"
FQDN="${FQDN#http://}"
FQDN="${FQDN%/}"

HEALTH_URL="https://${FQDN}/health"
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

info "=== WorkloadLens smoke test ==="
info "Timestamp:  ${TIMESTAMP}"
info "Target URL: ${HEALTH_URL}"

###############################################################################
# Health check — retries for cold-start / scale-up delay
###############################################################################

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

###############################################################################
# Parse response
###############################################################################

HTTP_BODY=$(echo "${HTTP_RESPONSE}" | sed '/^__HTTP_STATUS__/d')
HTTP_STATUS=$(echo "${HTTP_RESPONSE}" | grep '^__HTTP_STATUS__' | sed 's/__HTTP_STATUS__//')

info "HTTP status: ${HTTP_STATUS}"
info "Response body:"
echo "${HTTP_BODY}" | sed 's/^/  /'

###############################################################################
# Assertions
###############################################################################

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

###############################################################################
# Result
###############################################################################

echo ""
echo -e "${GRN}✔ PASS${NC} — ${HEALTH_URL} returned HTTP ${HTTP_STATUS} at ${TIMESTAMP}"
echo ""

exit 0
