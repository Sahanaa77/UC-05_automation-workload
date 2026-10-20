"""
Tests for blob storage integration and fault tolerance in WorkloadLens.
Verifies that blob storage failures never fail a run or corrupt quota.
"""
import uuid
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from app.main import app
import app.blob_store as blob_store
import tests.harness as harness

client = TestClient(app)

VALID_FIXTURE = [
    {"record_id": "J01", "tool": "EXPORT", "record_count": 20, "environment": "TEST"},
    {"record_id": "J02", "tool": "VALIDATE", "record_count": 10, "environment": "STAGE"},
]


@pytest.fixture(autouse=True)
def setup_teardown():
    harness.reset_all()
    yield


def test_run_succeeds_when_blob_write_raises(monkeypatch):
    """
    Blob failures must never fail a run or consume extra quota.
    When blob_store.put_result raises an exception, POST /runs still returns
    status 201, status='Succeeded', and full result.
    """
    def broken_put_result(tenant_id, run_id, json_text):
        raise RuntimeError("Simulated blob connection timeout or network partition")

    monkeypatch.setattr(blob_store, "put_result", broken_put_result)

    key = str(uuid.uuid4())
    res = client.post(
        "/runs",
        headers={"Authorization": "Bearer dev-token-a-operator", "Idempotency-Key": key},
        json={"operation": "validate", "records": VALID_FIXTURE},
    )

    # Run must still succeed with 201
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "Succeeded"
    assert data["operation"] == "validate"
    assert data["result"]["valid_rows"] == 2
    assert data["result"]["invalid_rows"] == 0

    # Quota was debited exactly 1
    sub = client.get("/subscription", headers={"Authorization": "Bearer dev-token-a-operator"}).json()
    assert sub["used_today"] == 1


def test_blob_store_local_put_and_get(tmp_path, monkeypatch):
    """Local blob storage saves and loads JSON from local directory."""
    monkeypatch.setattr(blob_store, "LOCAL_BLOB_DIR", str(tmp_path))
    monkeypatch.setattr(blob_store, "get_blob_account_url", lambda: "")

    tenant_id = "tenant-test"
    run_id = str(uuid.uuid4())
    payload = '{"test": "ok", "records": 42}'

    assert blob_store.put_result(tenant_id, run_id, payload) is True
    retrieved = blob_store.get_result(tenant_id, run_id)
    assert retrieved == payload
