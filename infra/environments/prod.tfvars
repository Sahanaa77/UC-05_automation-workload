# =============================================================================
# WorkloadLens — Prod environment parameter file
# =============================================================================
# INSTRUCTIONS
# 1. Replace every FILL_IN_* value with your actual Azure values.
# 2. Do NOT add database_url here. Supply it at deploy time:
#      export TF_VAR_database_url="postgresql://user:pass@host:5432/dbname"
# 3. Prod values should be reviewed and approved by the team before apply.
# 4. Do NOT commit a file containing real resource IDs to a public repository
#    without reviewing your organisation's security policy first.
# =============================================================================

# ---------------------------------------------------------------------------
# REQUIRED — must be set before 'terraform apply'
# ---------------------------------------------------------------------------

# Name of the existing Azure Resource Group (not created by Terraform).
resource_group_name = "FILL_IN_YOUR_RESOURCE_GROUP_NAME"

# Environment label attached to resource tags.
environment_label = "prod"

# Full resource ID of the existing Container Apps Environment.
# Find it in: Azure Portal → Container Apps Environments → <env> → Properties → Resource ID
# Or: az containerapp env show -n <env-name> -g <rg> --query id -o tsv
container_app_environment_id = "FILL_IN_CONTAINER_APPS_ENVIRONMENT_RESOURCE_ID"

# Name for the Container App resource (must be unique within the environment).
container_app_name = "FILL_IN_CONTAINER_APP_NAME"  # e.g. "workloadlens-api-prod"

# Fully-qualified container image reference for the production release.
# Pin to a specific digest or semver tag — never use ':latest' in production.
# Example: "myacr.azurecr.io/workloadlens:1.0.0"
container_image = "FILL_IN_IMAGE_REFERENCE"

# Storage Account name: 3–24 lowercase alphanumeric (no hyphens).
# MUST ALREADY EXIST — this project does not create the Storage Account.
# It is a shared dependency and must NOT be deleted by this project.
# Example: "workloadlensprod2024a"
storage_account_name = "FILL_IN_STORAGE_ACCOUNT_NAME"

# ---------------------------------------------------------------------------
# OPTIONAL overrides (prod-appropriate sizing)
# ---------------------------------------------------------------------------

blob_container_name = "workloadlens-data"

# At least 1 replica in prod to avoid cold-start latency.
min_replicas = 1
max_replicas = 3

cpu    = 0.5
memory = "1.0Gi"
