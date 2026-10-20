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
resource_group_name = "FILL_IN_YOUR_RESOURCE_GROUP_NAME"

# Azure region — must match the region of the resource group above.
# Examples: "eastus", "westeurope", "australiaeast"
# Note: 'location' is read from the data source; this variable is used for
# tags and any future region-specific resources.
environment_label = "dev"

# Full resource ID of the existing Container Apps Environment.
# Find it in: Azure Portal → Container Apps Environments → <env> → Properties → Resource ID
# Or: az containerapp env show -n <env-name> -g <rg> --query id -o tsv
container_app_environment_id = "FILL_IN_CONTAINER_APPS_ENVIRONMENT_RESOURCE_ID"

# Name for the Container App resource (must be unique within the environment).
container_app_name = "FILL_IN_CONTAINER_APP_NAME"  # e.g. "workloadlens-api-dev"

# Fully-qualified container image reference.
# The image must be built and pushed to a registry BEFORE running deploy.sh.
# Example: "myacr.azurecr.io/workloadlens:dev-latest"
container_image = "FILL_IN_IMAGE_REFERENCE"

# Storage Account name: 3–24 lowercase alphanumeric (no hyphens).
# MUST ALREADY EXIST — this project does not create the Storage Account.
# It is a shared dependency and must NOT be deleted by this project.
# Example: "workloadlensdev2024a"
storage_account_name = "FILL_IN_STORAGE_ACCOUNT_NAME"

# ---------------------------------------------------------------------------
# OPTIONAL overrides (safe defaults for dev)
# ---------------------------------------------------------------------------

blob_container_name = "workloadlens-data"

# Scale-to-zero in dev saves cost when idle.
min_replicas = 0
max_replicas = 1

cpu    = 0.25
memory = "0.5Gi"
