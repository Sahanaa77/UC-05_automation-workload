# STAND-IN until the organizer Blob wrapper arrives
"""
Blob storage adapter for WorkloadLens results.
Persists run outputs to local folder (.blob_local) or Azure Blob Storage (when BLOB_ACCOUNT_URL is configured).
SQL database remains the primary source of truth.
"""
import os
import logging
from typing import Optional

logger = logging.getLogger("workloadlens.blob_store")

LOCAL_BLOB_DIR = os.getenv("LOCAL_BLOB_DIR", "./.blob_local")


def get_blob_account_url() -> str:
    return os.getenv("BLOB_ACCOUNT_URL", "").strip()


def get_blob_container() -> str:
    return os.getenv("BLOB_CONTAINER", "workload-previews").strip()


def put_result(tenant_id: str, run_id: str, json_text: str) -> bool:
    """
    Stores run result JSON in Blob Storage or local fallback directory.
    Blob failures must never raise or fail a run.
    """
    account_url = get_blob_account_url()
    container_name = get_blob_container()

    if account_url:
        try:
            from azure.identity import DefaultAzureCredential
            from azure.storage.blob import BlobServiceClient

            credential = DefaultAzureCredential()
            blob_service_client = BlobServiceClient(account_url=account_url, credential=credential)
            container_client = blob_service_client.get_container_client(container_name)
            if not container_client.exists():
                container_client.create_container()

            blob_name = f"{tenant_id}/{run_id}.json"
            blob_client = container_client.get_blob_client(blob_name)
            blob_client.upload_blob(json_text, overwrite=True)
            return True
        except Exception as e:
            # Log error without leaking secrets, connection strings or credentials
            logger.warning("Azure blob storage upload failed: %s", type(e).__name__)
            return False
    else:
        try:
            tenant_dir = os.path.join(LOCAL_BLOB_DIR, tenant_id)
            os.makedirs(tenant_dir, exist_ok=True)
            file_path = os.path.join(tenant_dir, f"{run_id}.json")
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(json_text)
            return True
        except Exception as e:
            logger.warning("Local blob storage write failed: %s", type(e).__name__)
            return False


def get_result(tenant_id: str, run_id: str) -> Optional[str]:
    """
    Retrieves run result JSON from Blob Storage or local fallback directory.
    """
    account_url = get_blob_account_url()
    container_name = get_blob_container()

    if account_url:
        try:
            from azure.identity import DefaultAzureCredential
            from azure.storage.blob import BlobServiceClient

            credential = DefaultAzureCredential()
            blob_service_client = BlobServiceClient(account_url=account_url, credential=credential)
            blob_name = f"{tenant_id}/{run_id}.json"
            blob_client = blob_service_client.get_blob_client(container=container_name, blob=blob_name)
            if blob_client.exists():
                return blob_client.download_blob().readall().decode("utf-8")
            return None
        except Exception as e:
            logger.warning("Azure blob storage fetch failed: %s", type(e).__name__)
            return None
    else:
        try:
            file_path = os.path.join(LOCAL_BLOB_DIR, tenant_id, f"{run_id}.json")
            if os.path.exists(file_path):
                with open(file_path, "r", encoding="utf-8") as f:
                    return f.read()
            return None
        except Exception as e:
            logger.warning("Local blob storage read failed: %s", type(e).__name__)
            return None
