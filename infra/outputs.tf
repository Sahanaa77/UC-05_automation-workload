###############################################################################
# WorkloadLens — Terraform outputs
###############################################################################

output "container_app_fqdn" {
  description = "Public FQDN of the Container App. Use this in verify.sh: GET https://<fqdn>/health"
  value       = azurerm_container_app.api.latest_revision_fqdn
}

output "container_app_name" {
  description = "Name of the deployed Azure Container App resource."
  value       = azurerm_container_app.api.name
}

output "container_app_id" {
  description = "Full Azure resource ID of the Container App. Required for targeted cleanup."
  value       = azurerm_container_app.api.id
}

output "storage_account_name" {
  description = "Name of the referenced Storage Account (pre-existing, not managed by this module)."
  value       = data.azurerm_storage_account.data.name
}

output "storage_account_id" {
  description = "Full Azure resource ID of the referenced Storage Account. The Storage Account is a shared dependency and is NEVER deleted by cleanup.sh."
  value       = data.azurerm_storage_account.data.id
}

output "blob_container_name" {
  description = "Name of the private Blob container created inside the Storage Account."
  value       = azurerm_storage_container.data.name
}

output "resource_group_name" {
  description = "Name of the referenced Resource Group (not managed by this module)."
  value       = data.azurerm_resource_group.main.name
}
