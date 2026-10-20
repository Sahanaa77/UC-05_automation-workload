# =============================================================================
# WorkloadLens — Dev environment parameter file
# =============================================================================
# INSTRUCTIONS
# 1. Replace every FILL_IN_* value with your actual Azure values.
# 2. Do NOT add database_url here. Supply it at deploy time:
#      export TF_VAR_database_url="postgresql://user:pass@host:5432/dbname"
# 3. Do NOT commit a file containing real resource IDs to a public repository
#    without reviewing your organisation's security policy first.
# =============================================================================

# ---------------------------------------------------------------------------
# REQUIRED — must be set before 'terraform apply'
# ---------------------------------------------------------------------------

# Name of the existing Azure Resource Group (not created by Terraform).
# Verified: az group show -n rg-uc05-demo -> Succeeded (southindia)
resource_group_name = "rg-uc05-demo"

# Short label attached to resource tags.
environment_label = "dev"

# Full resource ID of the existing Container Apps Environment.
# Verified: az containerapp env show -n uc05-env -g rg-uc05-demo --query id -o tsv
container_app_environment_id = "/subscriptions/a9ed4be1-05c1-4d8b-835b-668ca2398443/resourceGroups/rg-uc05-demo/providers/Microsoft.App/managedEnvironments/uc05-env"

# Name for the Container App resource (must be unique within the environment).
container_app_name = "workloadlens-api-dev"

# Fully-qualified container image reference.
# Updated after CI build+push to ACR (commit SHA tag set by ci.yml).
# Set to the SHA-tagged image once the build-and-push job completes on main.
container_image = "uc05registry7bef65da.azurecr.io/workloadlens:latest"

# Storage Account name — Verified: az storage account list -g rg-uc05-demo
# Standard_LRS, centralindia, status=available. NEVER deleted by this module.
storage_account_name = "uc05storef6ea8975"

# Azure Container Registry (ACR) targeting for image pulling.
# Password is sensitive and must be supplied via TF_VAR_acr_password (never here).
acr_login_server = "uc05registry7bef65da.azurecr.io"
acr_username     = "uc05registry7bef65da"

# ---------------------------------------------------------------------------
# OPTIONAL overrides (safe defaults for dev)
# ---------------------------------------------------------------------------

blob_container_name = "workloadlens-data"

# Scale-to-zero in dev saves cost when idle.
min_replicas = 0
max_replicas = 1

cpu    = 0.25
memory = "0.5Gi"
