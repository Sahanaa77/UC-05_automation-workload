###############################################################################
# WorkloadLens — Terraform variable declarations
# All resource-identifying and credential values are required with no default.
# Sizing variables carry safe defaults that are suitable for dev usage.
###############################################################################

# ---------------------------------------------------------------------------
# Identity / Targeting
# ---------------------------------------------------------------------------

variable "resource_group_name" {
  description = "Name of the existing Azure Resource Group. This RG is referenced, not created."
  type        = string
}

variable "environment_label" {
  description = "Short label attached to resource tags (e.g. 'dev', 'prod'). Not used in resource names."
  type        = string
  default     = "dev"
}

# ---------------------------------------------------------------------------
# Container Apps Environment (existing — not managed by this module)
# ---------------------------------------------------------------------------

variable "container_app_environment_id" {
  description = <<-EOT
    Full Azure resource ID of the existing Container Apps Environment.
    Format: /subscriptions/<sub>/resourceGroups/<rg>/providers/
            Microsoft.App/managedEnvironments/<env-name>
    This environment is NOT created or destroyed by this module.
  EOT
  type        = string
}

# ---------------------------------------------------------------------------
# Container App
# ---------------------------------------------------------------------------

variable "container_app_name" {
  description = "Name of the Azure Container App resource to create."
  type        = string
}

variable "container_image" {
  description = <<-EOT
    Fully-qualified container image reference, e.g.:
      myacr.azurecr.io/workloadlens:1.0.0
    The image must be built and pushed to a registry accessible by the
    Container Apps environment before 'terraform apply' is run.
    See docs/deployment-runbook.md §Prerequisites.
  EOT
  type        = string
}

# ---------------------------------------------------------------------------
# Application secrets (sensitive — never commit values to VCS)
# ---------------------------------------------------------------------------

variable "database_url" {
  description = <<-EOT
    PostgreSQL connection string for the application.
    Supply at deploy time only via environment variable:
      export TF_VAR_database_url="postgresql://user:pass@host:5432/dbname"
    NEVER set this in a .tfvars file or commit it to version control.
  EOT
  type        = string
  sensitive   = true
}

# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------

variable "storage_account_name" {
  description = <<-EOT
    Name of the existing Azure Storage Account (3–24 lowercase alphanumeric,
    no hyphens). This account MUST already exist before 'terraform apply' runs.
    It is a shared dependency — this module never creates or deletes it.
    Example: 'workloadlensdev2024'
  EOT
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]{3,24}$", var.storage_account_name))
    error_message = "storage_account_name must be 3–24 lowercase alphanumeric characters with no hyphens or spaces."
  }
}

variable "blob_container_name" {
  description = "Name of the private Blob container created inside the Storage Account."
  type        = string
  default     = "workloadlens-data"
}

# ---------------------------------------------------------------------------
# Scaling
# ---------------------------------------------------------------------------

variable "min_replicas" {
  description = "Minimum Container App replicas. 0 allows scale-to-zero (cost-efficient for dev)."
  type        = number
  default     = 0

  validation {
    condition     = var.min_replicas >= 0 && var.min_replicas <= var.max_replicas
    error_message = "min_replicas must be >= 0 and <= max_replicas."
  }
}

variable "max_replicas" {
  description = "Maximum Container App replicas."
  type        = number
  default     = 1

  validation {
    condition     = var.max_replicas >= 1
    error_message = "max_replicas must be at least 1."
  }
}

# ---------------------------------------------------------------------------
# Container resource limits
# ---------------------------------------------------------------------------

variable "cpu" {
  description = "vCPU allocation per Container App replica (e.g. 0.25, 0.5, 1.0)."
  type        = number
  default     = 0.25
}

variable "memory" {
  description = "Memory allocation per Container App replica (e.g. '0.5Gi', '1.0Gi')."
  type        = string
  default     = "0.5Gi"
}
