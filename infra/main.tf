###############################################################################
# WorkloadLens — Azure Infrastructure
# Scope: ONE Azure Container App + ONE private Blob container.
# The Storage Account is a pre-existing shared dependency — referenced, never created or deleted.
#
# What this module does NOT manage:
#   - Azure Resource Group           (referenced via data source)
#   - Azure Container Apps Environment (referenced by resource ID variable)
#   - Azure Container Registry / image build (external precondition)
#   - Azure Database for PostgreSQL  (DATABASE_URL supplied at runtime)
#   - Terraform remote state backend (see deployment-runbook.md §Remote State)
#
# Terraform state: local by default.
# To migrate to a shared remote backend, agree on a backend storage account
# with the team first, then follow docs/deployment-runbook.md §Remote State.
###############################################################################

terraform {
  required_version = ">= 1.6"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }

  # backend "local" {}   # ← default; no state file is committed to VCS.
  # To switch to a remote backend, uncomment and configure below:
  # backend "azurerm" {
  #   resource_group_name  = "FILL_IN_STATE_RG"
  #   storage_account_name = "FILL_IN_STATE_STORAGE"
  #   container_name       = "tfstate"
  #   key                  = "workloadlens.tfstate"
  # }
}

provider "azurerm" {
  features {}
}

###############################################################################
# Data source: reference the existing Resource Group (not managed here).
###############################################################################

data "azurerm_resource_group" "main" {
  name = var.resource_group_name
}

###############################################################################
# Data source: reference the existing Storage Account (not managed here).
# The storage account MUST be provisioned before 'terraform apply' runs.
# It is a shared dependency — this module never creates or deletes it.
###############################################################################

data "azurerm_storage_account" "data" {
  name                = var.storage_account_name
  resource_group_name = data.azurerm_resource_group.main.name
}

###############################################################################
# Azure Blob Container — private access only.
# Created inside the existing Storage Account referenced above.
###############################################################################

resource "azurerm_storage_container" "data" {
  name                  = var.blob_container_name
  storage_account_name  = data.azurerm_storage_account.data.name
  container_access_type = "private"
}

###############################################################################
# Azure Container App — WorkloadLens API.
#
# The Container Apps Environment is NOT created here; its resource ID is
# passed in via var.container_app_environment_id.
#
# The container image must already exist in a registry accessible to the
# environment before apply. See docs/deployment-runbook.md §Prerequisites.
###############################################################################

resource "azurerm_container_app" "api" {
  name                         = var.container_app_name
  resource_group_name          = data.azurerm_resource_group.main.name
  container_app_environment_id = var.container_app_environment_id
  workload_profile_name        = "Consumption"
  revision_mode                = "Single"

  # DATABASE_URL is stored as a secret inside the Container App;
  # the plaintext value comes from var.database_url (sensitive) and is
  # never written to state in cleartext beyond what azurerm itself stores.
  secret {
    name  = "database-url"
    value = var.database_url
  }

  # ACR password stored as a Container App secret for image pull.
  secret {
    name  = "acr-password"
    value = var.acr_password
  }

  # Registry credentials for pulling the container image from ACR.
  registry {
    server               = var.acr_login_server
    username             = var.acr_username
    password_secret_name = "acr-password"
  }

  template {
    min_replicas = var.min_replicas
    max_replicas = var.max_replicas

    container {
      name   = "workloadlens-api"
      image  = var.container_image
      cpu    = var.cpu
      memory = var.memory

      # Plain environment variables.
      env {
        name  = "TEST_MODE"
        value = "0"
      }

      # DATABASE_URL injected from the secret above — never appears in logs.
      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }

      # Liveness probe: GET /health on port 8000 (confirmed by Sanaa).
      liveness_probe {
        port      = 8000
        transport = "HTTP"
        path      = "/health"

        initial_delay           = 15
        interval_seconds        = 30
        failure_count_threshold = 3
      }
    }
  }

  # External HTTPS ingress forwarded to container port 8000.
  ingress {
    external_enabled = true
    target_port      = 8000
    transport        = "http"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  tags = {
    project     = "workloadlens"
    environment = var.environment_label
    managed_by  = "terraform"
  }

  lifecycle {
    ignore_changes = [
      template[0].http_scale_rule,
      template[0].container[0].liveness_probe[0].transport,
      ingress[0].traffic_weight,
    ]
  }
}
