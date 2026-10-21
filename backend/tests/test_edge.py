"""
Comprehensive Edge Case and Security Tests for WorkloadLens.
Verifies boundary conditions, structural validation (400), tenant isolation,
auth enforcement (401), and non-leakage in GET /health.
"""
import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db import SessionLocal
from app.models import RunModel, DailyUsageModel
import tests.harness as harness

client = TestClient(app)

AUTH_HEADER = {"Authorization": "Bearer dev-token-a-operator"}

VALID_RECORD = {
    "record_id": "J01",
    "tool": "EXPORT",
    "record_count": 20,
    "environment": "TEST",
}


@pytest.fixture(autouse=True)
def setup_teardown():
    harness.reset_all()
    yield


# --------------------------------------------------------------------------
# 1. Wrong-shaped body -> 400
# --------------------------------------------------------------------------
def test_wrong_shaped_body_list():
    """A list as request body returns 400."""
    res = client.post(
        "/runs",
        headers={**AUTH_HEADER, "Idempotency-Key": str(uuid.uuid4())},
        json=[{"operation": "validate", "records": [VALID_RECORD]}],
    )
    assert res.status_code == 400


def test_wrong_shaped_body_string():
    """A raw string as request body returns 400."""
    res = client.post(
        "/runs",
        headers={**AUTH_HEADER, "Idempotency-Key": str(uuid.uuid4()), "Content-Type": "application/json"},
        content='"not an object"',
    )
    assert res.status_code == 400


def test_wrong_shaped_body_records_as_object():
    """Records passed as an object instead of a list returns 400."""
    res = client.post(
        "/runs",
        headers={**AUTH_HEADER, "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "validate", "records": VALID_RECORD},
    )
    assert res.status_code == 400


# --------------------------------------------------------------------------
# 2. Row count bounds: 0 rows and 11 rows -> 400
# --------------------------------------------------------------------------
def test_zero_rows_returns_400():
    """0 records returns 400."""
    res = client.post(
        "/runs",
        headers={**AUTH_HEADER, "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "validate", "records": []},
    )
    assert res.status_code == 400


def test_eleven_rows_returns_400():
    """11 records (exceeding max 10) returns 400."""
    eleven_records = [
        {"record_id": f"J{i:02d}", "tool": "EXPORT", "record_count": 10, "environment": "TEST"}
        for i in range(11)
    ]
    res = client.post(
        "/runs",
        headers={**AUTH_HEADER, "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "validate", "records": eleven_records},
    )
    assert res.status_code == 400


# --------------------------------------------------------------------------
# 3. Body over 64 KiB -> 400
# --------------------------------------------------------------------------
def test_body_over_64_kib_returns_400():
    """Payload exceeding 64 KiB (65536 bytes) returns 400."""
    # Create large padding inside a field or raw body
    large_payload = (
        '{"operation":"validate","records":[{"record_id":"'
        + "A" * 66000
        + '","tool":"EXPORT","record_count":10,"environment":"TEST"}]}'
    )
    assert len(large_payload.encode("utf-8")) > 65536

    res = client.post(
        "/runs",
        headers={**AUTH_HEADER, "Idempotency-Key": str(uuid.uuid4()), "Content-Type": "application/json"},
        content=large_payload,
    )
    assert res.status_code == 400


# --------------------------------------------------------------------------
# 4. Missing or empty Idempotency-Key -> 400
# --------------------------------------------------------------------------
def test_missing_idempotency_key_returns_400():
    """Missing Idempotency-Key header returns 400."""
    res = client.post(
        "/runs",
        headers=AUTH_HEADER,
        json={"operation": "validate", "records": [VALID_RECORD]},
    )
    assert res.status_code == 400


def test_empty_idempotency_key_returns_400():
    """Empty or whitespace Idempotency-Key header returns 400."""
    res1 = client.post(
        "/runs",
        headers={**AUTH_HEADER, "Idempotency-Key": ""},
        json={"operation": "validate", "records": [VALID_RECORD]},
    )
    assert res1.status_code == 400

    res2 = client.post(
        "/runs",
        headers={**AUTH_HEADER, "Idempotency-Key": "   "},
        json={"operation": "validate", "records": [VALID_RECORD]},
    )
    assert res2.status_code == 400


# --------------------------------------------------------------------------
# 5. Record with extra or missing key -> 400
# --------------------------------------------------------------------------
def test_record_with_extra_key_returns_400():
    """Record containing extra key returns 400."""
    record_with_extra = dict(VALID_RECORD)
    record_with_extra["unexpected_field"] = "evil"

    res = client.post(
        "/runs",
        headers={**AUTH_HEADER, "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "validate", "records": [record_with_extra]},
    )
    assert res.status_code == 400


def test_record_with_missing_key_returns_400():
    """Record missing required key (e.g. environment) returns 400."""
    record_missing_key = {
        "record_id": "J01",
        "tool": "EXPORT",
        "record_count": 20,
        # missing environment
    }
    res = client.post(
        "/runs",
        headers={**AUTH_HEADER, "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "validate", "records": [record_missing_key]},
    )
    assert res.status_code == 400


# --------------------------------------------------------------------------
# 6. tenant_id in body, query string, or X-Tenant-Id header -> 400 (rejected, not ignored)
# --------------------------------------------------------------------------
def test_tenant_id_in_body_returns_400():
    """Passing tenant_id in request body returns 400."""
    res = client.post(
        "/runs",
        headers={**AUTH_HEADER, "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "validate", "records": [VALID_RECORD], "tenant_id": "tenant-b"},
    )
    assert res.status_code == 400


def test_tenant_id_in_query_string_returns_400():
    """Passing tenant_id in query string returns 400."""
    res = client.post(
        "/runs?tenant_id=tenant-b",
        headers={**AUTH_HEADER, "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "validate", "records": [VALID_RECORD]},
    )
    assert res.status_code == 400


def test_x_tenant_id_header_returns_400():
    """Passing X-Tenant-Id header returns 400."""
    res = client.post(
        "/runs",
        headers={**AUTH_HEADER, "Idempotency-Key": str(uuid.uuid4()), "X-Tenant-Id": "tenant-b"},
        json={"operation": "validate", "records": [VALID_RECORD]},
    )
    assert res.status_code == 400


# --------------------------------------------------------------------------
# 7. 400 request creates no Runs row and no DailyUsage change
# --------------------------------------------------------------------------
def test_400_creates_no_runs_and_no_daily_usage():
    """Any 400 bad request must not insert Runs row or increment DailyUsage."""
    db = SessionLocal()
    runs_before = db.query(RunModel).count()
    usage_before = db.query(DailyUsageModel).filter_by(tenant_id="tenant-a").first()
    count_before = usage_before.count if usage_before else 0
    db.close()

    # Trigger a 400
    res = client.post(
        "/runs",
        headers={**AUTH_HEADER, "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "validate", "records": []},
    )
    assert res.status_code == 400

    db = SessionLocal()
    runs_after = db.query(RunModel).count()
    usage_after = db.query(DailyUsageModel).filter_by(tenant_id="tenant-a").first()
    count_after = usage_after.count if usage_after else 0
    db.close()

    assert runs_after == runs_before
    assert count_after == count_before


# --------------------------------------------------------------------------
# 8. Unauthenticated GET /tools, /subscription, /runs, /runs/{id}/result, POST /runs -> 401
# --------------------------------------------------------------------------
def test_unauthenticated_routes_return_401():
    """Protected endpoints require valid auth; return 401 when unauthenticated."""
    assert client.get("/tools").status_code == 401
    assert client.get("/subscription").status_code == 401
    assert client.get("/runs").status_code == 401
    assert client.get(f"/runs/{uuid.uuid4()}/result").status_code == 401
    assert (
        client.post(
            "/runs",
            headers={"Idempotency-Key": str(uuid.uuid4())},
            json={"operation": "validate", "records": [VALID_RECORD]},
        ).status_code
        == 401
    )


# --------------------------------------------------------------------------
# 9. GET /health works without auth and returns no tenant data
# --------------------------------------------------------------------------
def test_health_works_without_auth_and_no_tenant_data():
    """GET /health is public and never leaks tenant metadata."""
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data == {"status": "ok"}

    sensitive_tokens = {"tenant", "tenant_id", "plan", "role", "user", "secret"}
    assert not any(token in data for token in sensitive_tokens)
