"""
Tests for read routes (GET /tools, GET /subscription, GET /runs, GET /runs/{id}/result).
Validates tenant isolation, restart persistence, and suspended reading.
"""
import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db import SessionLocal
from app.models import RunModel
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


# --------------------------------------------------------------------------
# 1. GET /tools
# --------------------------------------------------------------------------
def test_get_tools_plan_permissions():
    # Unauthenticated -> 401
    assert client.get("/tools").status_code == 401

    # Pro plan -> allowed_operations contains both validate and process
    res_pro = client.get("/tools", headers={"Authorization": "Bearer dev-token-a-operator"})
    assert res_pro.status_code == 200
    data_pro = res_pro.json()
    tool_names = [t["name"] for t in data_pro["tools"]]
    assert "EXPORT" in tool_names
    assert "VALIDATE" in tool_names
    assert "validate" in data_pro["allowed_operations"]
    assert "process" in data_pro["allowed_operations"]

    # Basic plan -> allowed_operations contains only validate
    res_basic = client.get("/tools", headers={"Authorization": "Bearer dev-token-b-operator"})
    assert res_basic.status_code == 200
    data_basic = res_basic.json()
    assert "validate" in data_basic["allowed_operations"]
    assert "process" not in data_basic["allowed_operations"]


# --------------------------------------------------------------------------
# 2. GET /subscription
# --------------------------------------------------------------------------
def test_get_subscription_fields():
    # Unauthenticated -> 401
    assert client.get("/subscription").status_code == 401

    res = client.get("/subscription", headers={"Authorization": "Bearer dev-token-a-operator"})
    assert res.status_code == 200
    data = res.json()
    assert data["tenant_id"] == "tenant-a"
    assert data["plan"] == "Pro"
    assert data["status"] == "Active"
    assert data["daily_limit"] == 10
    assert data["used_today"] == 0
    assert data["remaining"] == 10


# --------------------------------------------------------------------------
# 3. Tenant B cannot list A's runs & fetching A's run as B gives 404
# --------------------------------------------------------------------------
def test_tenant_isolation_reads():
    # Unauthenticated -> 401
    assert client.get("/runs").status_code == 401

    # Tenant A creates a run
    key_a = str(uuid.uuid4())
    res_a = client.post(
        "/runs",
        headers={"Authorization": "Bearer dev-token-a-operator", "Idempotency-Key": key_a},
        json={"operation": "validate", "records": VALID_FIXTURE},
    )
    assert res_a.status_code == 201
    run_a_id = res_a.json()["run_id"]

    # Tenant B creates a run
    key_b = str(uuid.uuid4())
    res_b = client.post(
        "/runs",
        headers={"Authorization": "Bearer dev-token-b-operator", "Idempotency-Key": key_b},
        json={"operation": "validate", "records": VALID_FIXTURE},
    )
    assert res_b.status_code == 201
    run_b_id = res_b.json()["run_id"]

    # Tenant B lists runs -> only sees Tenant B's run
    runs_b = client.get("/runs", headers={"Authorization": "Bearer dev-token-b-operator"}).json()
    run_b_ids = [r["run_id"] for r in runs_b]
    assert run_b_id in run_b_ids
    assert run_a_id not in run_b_ids

    # Tenant B attempts to fetch Tenant A's run -> 404
    fetch_a_as_b = client.get(
        f"/runs/{run_a_id}/result",
        headers={"Authorization": "Bearer dev-token-b-operator"},
    )
    assert fetch_a_as_b.status_code == 404

    # Tenant A fetching A's run -> 200 with result
    fetch_a_as_a = client.get(
        f"/runs/{run_a_id}/result",
        headers={"Authorization": "Bearer dev-token-a-operator"},
    )
    assert fetch_a_as_a.status_code == 200
    assert fetch_a_as_a.json()["run_id"] == run_a_id
    assert "result" in fetch_a_as_a.json()


# --------------------------------------------------------------------------
# 4. A body with tenant_id gives 400
# --------------------------------------------------------------------------
def test_body_with_tenant_id_gives_400():
    res = client.post(
        "/runs",
        headers={"Authorization": "Bearer dev-token-a-operator", "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "validate", "records": VALID_FIXTURE, "tenant_id": "tenant-b"},
    )
    assert res.status_code == 400


# --------------------------------------------------------------------------
# 5. Result survives creating a new app instance on the same DB file
# --------------------------------------------------------------------------
def test_result_survives_app_restart():
    # Create run using current client
    key = str(uuid.uuid4())
    res = client.post(
        "/runs",
        headers={"Authorization": "Bearer dev-token-a-operator", "Idempotency-Key": key},
        json={"operation": "process", "records": VALID_FIXTURE},
    )
    assert res.status_code == 201
    orig_data = res.json()
    run_id = orig_data["run_id"]
    orig_result = orig_data["result"]

    # Create a fresh TestClient / FastAPI app instance simulating app restart on same DB
    from app.main import app as fresh_app
    fresh_client = TestClient(fresh_app)

    # Fetch result via GET /runs/{id}/result on new client
    fetch_res = fresh_client.get(
        f"/runs/{run_id}/result",
        headers={"Authorization": "Bearer dev-token-a-operator"},
    )
    assert fetch_res.status_code == 200
    fetched_data = fetch_res.json()
    assert fetched_data["run_id"] == run_id
    assert fetched_data["status"] == "Succeeded"
    assert fetched_data["result"] == orig_result


# --------------------------------------------------------------------------
# 6. Suspended tenants can still read history and results
# --------------------------------------------------------------------------
def test_suspended_tenant_can_read_history_and_result():
    # Create a run while active
    key = str(uuid.uuid4())
    res = client.post(
        "/runs",
        headers={"Authorization": "Bearer dev-token-a-operator", "Idempotency-Key": key},
        json={"operation": "validate", "records": VALID_FIXTURE},
    )
    assert res.status_code == 201
    run_id = res.json()["run_id"]

    # Suspend tenant A
    harness.set_status("tenant-a", "Suspended")

    # Listing runs works (200)
    list_res = client.get("/runs", headers={"Authorization": "Bearer dev-token-a-operator"})
    assert list_res.status_code == 200
    assert any(r["run_id"] == run_id for r in list_res.json())

    # Fetching specific run result works (200)
    result_res = client.get(f"/runs/{run_id}/result", headers={"Authorization": "Bearer dev-token-a-operator"})
    assert result_res.status_code == 200
    assert result_res.json()["run_id"] == run_id
