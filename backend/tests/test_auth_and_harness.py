"""
Unit tests for auth.py, harness.py, and database models / schema.
"""
import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db import SessionLocal
from app.models import SubscriptionModel, RunModel, DailyUsageModel
import tests.harness as harness

client = TestClient(app)

VALID_FIXTURE = [
    {"record_id": "J01", "tool": "EXPORT", "record_count": 20, "environment": "TEST"},
    {"record_id": "J02", "tool": "VALIDATE", "record_count": 10, "environment": "STAGE"},
]


@pytest.fixture(autouse=True)
def setup_each():
    harness.reset_all()
    yield


def test_seeded_identities_and_subscriptions():
    # 1. Tenant A Operator (Pro, Active)
    res_a_op = client.get("/subscription", headers={"Authorization": "Bearer dev-token-a-operator"})
    assert res_a_op.status_code == 200
    sub_a = res_a_op.json()
    assert sub_a["tenant_id"] == "tenant-a"
    assert sub_a["plan"] == "Pro"
    assert sub_a["status"] == "Active"

    # 2. Tenant A Viewer (Pro, Active, Read only)
    res_a_vw = client.get("/subscription", headers={"Authorization": "Bearer dev-token-a-viewer"})
    assert res_a_vw.status_code == 200
    assert res_a_vw.json()["tenant_id"] == "tenant-a"

    # 3. Tenant B Operator (Basic, Active)
    res_b_op = client.get("/subscription", headers={"Authorization": "Bearer dev-token-b-operator"})
    assert res_b_op.status_code == 200
    sub_b = res_b_op.json()
    assert sub_b["tenant_id"] == "tenant-b"
    assert sub_b["plan"] == "Basic"
    assert sub_b["status"] == "Active"


def test_auth_missing_or_invalid():
    # Missing token -> 401
    assert client.get("/subscription").status_code == 401
    # Invalid token -> 401
    assert client.get("/subscription", headers={"Authorization": "Bearer invalid-token-xyz"}).status_code == 401


def test_tenant_override_rejection():
    # Reject header tenant override
    r1 = client.get(
        "/subscription",
        headers={"Authorization": "Bearer dev-token-a-operator", "X-Tenant-Override": "tenant-b"},
    )
    assert r1.status_code == 400

    r2 = client.get(
        "/subscription",
        headers={"Authorization": "Bearer dev-token-a-operator", "X-Tenant-ID": "tenant-b"},
    )
    assert r2.status_code == 400

    # Reject query parameter tenant override
    r3 = client.get(
        "/subscription?tenant_id=tenant-b",
        headers={"Authorization": "Bearer dev-token-a-operator"},
    )
    assert r3.status_code == 400


def test_harness_set_status_and_plan():
    # Suspend tenant A
    harness.set_status("tenant-a", "Suspended")
    res_sub = client.get("/subscription", headers={"Authorization": "Bearer dev-token-a-operator"})
    assert res_sub.json()["status"] == "Suspended"

    # Change tenant B to Pro
    harness.set_plan("tenant-b", "Pro")
    res_b = client.get("/subscription", headers={"Authorization": "Bearer dev-token-b-operator"})
    assert res_b.json()["plan"] == "Pro"


def test_harness_force_failure():
    # Set harness force_failure flag
    harness.set_force_failure(True, "Injected via harness test flag")
    assert harness.force_failure is True

    key = str(uuid.uuid4())
    res = client.post(
        "/runs",
        headers={"Authorization": "Bearer dev-token-a-operator", "Idempotency-Key": key},
        json={"operation": "process", "records": VALID_FIXTURE},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "Failed"
    assert "Injected via harness" in data["error"]

    # Reset
    harness.set_force_failure(False)


def test_harness_reset_all():
    # Make a run and dirty the database
    key = str(uuid.uuid4())
    client.post(
        "/runs",
        headers={"Authorization": "Bearer dev-token-a-operator", "Idempotency-Key": key},
        json={"operation": "validate", "records": VALID_FIXTURE},
    )
    harness.set_status("tenant-a", "Suspended")

    # Reset all
    harness.reset_all()

    # Database should be clean
    db = SessionLocal()
    assert db.query(RunModel).count() == 0
    assert db.query(DailyUsageModel).count() == 0
    sub_a = db.query(SubscriptionModel).filter_by(tenant_id="tenant-a").first()
    assert sub_a.status == "Active"
    assert sub_a.plan == "Pro"
    db.close()


def test_test_mode_zero_colon_token_returns_401(monkeypatch):
    """With TEST_MODE=0, colon-token returns 401."""
    # Under TEST_MODE=1, colon-token works
    res_ok = client.get("/subscription", headers={"Authorization": "Bearer tenant-a:Operator"})
    assert res_ok.status_code == 200

    # With TEST_MODE=0, colon-token and dev-tokens return 401
    monkeypatch.setenv("TEST_MODE", "0")
    res_colon = client.get("/subscription", headers={"Authorization": "Bearer tenant-a:Operator"})
    assert res_colon.status_code == 401

    res_dev = client.get("/subscription", headers={"Authorization": "Bearer dev-token-a-operator"})
    assert res_dev.status_code == 401

    # Tenant override is still rejected with 400
    res_override = client.get(
        "/subscription",
        headers={"Authorization": "Bearer tenant-a:Operator", "X-Tenant-Override": "tenant-b"},
    )
    assert res_override.status_code == 400


def test_test_mode_zero_force_failure_header_has_no_effect(monkeypatch):
    """With TEST_MODE=0, the X-Force-Failure header has no effect."""
    monkeypatch.setenv("TEST_MODE", "0")

    # 1. Direct failure hook check returns None when TEST_MODE=0
    from app.hooks import check_failure_hook
    from starlette.requests import Request

    scope = {
        "type": "http",
        "method": "POST",
        "headers": [(b"x-force-failure", b"true")],
    }
    req = Request(scope)
    assert check_failure_hook(req) is None

    # 2. In /runs endpoint, X-Force-Failure header does not cause failure
    from app.auth import get_current_tenant, TenantContext

    app.dependency_overrides[get_current_tenant] = lambda: TenantContext(
        tenant_id="tenant-a", user_id="user-a-op", role="Operator", plan="Pro", status="Active"
    )
    try:
        key = str(uuid.uuid4())
        res = client.post(
            "/runs",
            headers={
                "Authorization": "Bearer ignored",
                "Idempotency-Key": key,
                "X-Force-Failure": "true",
            },
            json={"operation": "process", "records": VALID_FIXTURE},
        )
        assert res.status_code == 201
        data = res.json()
        assert data["status"] == "Succeeded"
        assert data.get("error") is None
    finally:
        app.dependency_overrides.pop(get_current_tenant, None)

