"""
Comprehensive Acceptance Tests for UC-05 Automation Workload Preview SaaS.
Implements checks A02 through A11 from the shared specification.
"""
import copy
import threading
import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db import init_db, SessionLocal
import tests.harness as harness

client = TestClient(app)

# Standard fixtures from spec
VALID_FIXTURE = [
    {"record_id": "J01", "tool": "EXPORT", "record_count": 20, "environment": "TEST"},
    {"record_id": "J02", "tool": "VALIDATE", "record_count": 10, "environment": "STAGE"},
]

INVALID_FIXTURE = [
    # 2 valid rows
    {"record_id": "J01", "tool": "EXPORT", "record_count": 20, "environment": "TEST"},
    {"record_id": "J02", "tool": "VALIDATE", "record_count": 10, "environment": "STAGE"},
    # 4 mutated rows
    {"record_id": "J01", "tool": "EXPORT", "record_count": 20, "environment": "TEST"},     # R1: duplicate ID
    {"record_id": "X2", "tool": "DELETE", "record_count": 20, "environment": "TEST"},       # R2: invalid tool
    {"record_id": "X3", "tool": "EXPORT", "record_count": 0, "environment": "TEST"},        # R3: record_count < 1
    {"record_id": "X4", "tool": "EXPORT", "record_count": 20, "environment": "PROD"},       # R4: invalid env
]


@pytest.fixture(autouse=True)
def setup_teardown():
    harness.reset_all()
    yield




# --------------------------------------------------------------------------
# A01: /health is 200 and public
# --------------------------------------------------------------------------
def test_a01_health_public():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


# --------------------------------------------------------------------------
# A02: validate on two-row valid fixture reports valid_rows 2, invalid_rows 0, no issues
# --------------------------------------------------------------------------
def test_a02_validate_valid_fixture():
    key = str(uuid.uuid4())
    res = client.post(
        "/runs",
        headers={"Authorization": "Bearer pro_operator", "Idempotency-Key": key},
        json={"operation": "validate", "records": VALID_FIXTURE},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "Succeeded"
    assert data["operation"] == "validate"
    result = data["result"]
    assert result["valid_rows"] == 2
    assert result["invalid_rows"] == 0
    assert result["issues"] == []


# --------------------------------------------------------------------------
# A03: validate on six-row invalid fixture reports valid_rows 2, invalid_rows 4, 4 rule failures
# --------------------------------------------------------------------------
def test_a03_validate_invalid_fixture():
    key = str(uuid.uuid4())
    res = client.post(
        "/runs",
        headers={"Authorization": "Bearer pro_operator", "Idempotency-Key": key},
        json={"operation": "validate", "records": INVALID_FIXTURE},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "Succeeded"
    result = data["result"]
    assert result["valid_rows"] == 2
    assert result["invalid_rows"] == 4
    issues = result["issues"]
    rule_ids = {issue["rule_id"] for issue in issues}
    assert {"R1", "R2", "R3", "R4"}.issubset(rule_ids)


# --------------------------------------------------------------------------
# A04: Pro process returns exact specified rows & summary; retrieved through API
# --------------------------------------------------------------------------
def test_a04_pro_process_success():
    key = str(uuid.uuid4())
    res = client.post(
        "/runs",
        headers={"Authorization": "Bearer pro_operator", "Idempotency-Key": key},
        json={"operation": "process", "records": VALID_FIXTURE},
    )
    assert res.status_code == 201
    data = res.json()
    run_id = data["run_id"]
    assert data["status"] == "Succeeded"
    result = data["result"]

    # Verify summary: input_rows 2, total_records 30, total_estimated_ms 300
    summary = result["summary"]
    assert summary["input_rows"] == 2
    assert summary["total_records"] == 30
    assert summary["total_estimated_ms"] == 300

    # Verify rows: J01: 200, J02: 100
    rows = result["rows"]
    assert len(rows) == 2
    assert rows[0] == {"record_id": "J01", "estimated_ms": 200}
    assert rows[1] == {"record_id": "J02", "estimated_ms": 100}

    # Fetch result via GET /runs/{id}/result
    fetch_res = client.get(
        f"/runs/{run_id}/result",
        headers={"Authorization": "Bearer pro_operator"},
    )
    assert fetch_res.status_code == 200
    assert fetch_res.json()["result"] == result


# --------------------------------------------------------------------------
# A05: Invalid process input, wrong-shaped body, 11-row batch each return 400 with no debit
# --------------------------------------------------------------------------
def test_a05_invalid_process_input_and_bounds():
    # Check current quota usage
    sub_before = client.get("/subscription", headers={"Authorization": "Bearer pro_operator"}).json()
    used_before = sub_before["used_today"]

    # 1. Invalid process input (from invalid fixture) -> 400
    res1 = client.post(
        "/runs",
        headers={"Authorization": "Bearer pro_operator", "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "process", "records": INVALID_FIXTURE},
    )
    assert res1.status_code == 400

    # 2. Wrong-shaped body (missing records or extra fields) -> 400
    res2 = client.post(
        "/runs",
        headers={"Authorization": "Bearer pro_operator", "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "process", "extra_bad_field": 123},
    )
    assert res2.status_code == 400

    # 3. 11-row batch (bounds exceeded: max 10) -> 400
    eleven_rows = [
        {"record_id": f"J{i:02d}", "tool": "EXPORT", "record_count": 10, "environment": "TEST"}
        for i in range(11)
    ]
    res3 = client.post(
        "/runs",
        headers={"Authorization": "Bearer pro_operator", "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "process", "records": eleven_rows},
    )
    assert res3.status_code == 400

    # Quota remains unchanged
    sub_after = client.get("/subscription", headers={"Authorization": "Bearer pro_operator"}).json()
    assert sub_after["used_today"] == used_before


# --------------------------------------------------------------------------
# A06: Unauthenticated 401; Viewer submit & Basic process both 403 with no debit
# --------------------------------------------------------------------------
def test_a06_auth_and_permissions():
    # 1. Unauthenticated request to protected route -> 401
    assert client.get("/subscription").status_code == 401
    assert client.get("/tools").status_code == 401
    assert client.get("/runs").status_code == 401
    assert client.post("/runs", json={"operation": "validate", "records": VALID_FIXTURE}).status_code == 401

    # 2. Viewer submission -> 403
    res_viewer = client.post(
        "/runs",
        headers={"Authorization": "Bearer pro_viewer", "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "validate", "records": VALID_FIXTURE},
    )
    assert res_viewer.status_code == 403

    # 3. Basic plan requesting process -> 403
    res_basic = client.post(
        "/runs",
        headers={"Authorization": "Bearer basic_operator", "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "process", "records": VALID_FIXTURE},
    )
    assert res_basic.status_code == 403


# --------------------------------------------------------------------------
# A07: Cross-tenant isolation; tenant B cannot list A's runs; override rejected
# --------------------------------------------------------------------------
def test_a07_tenant_isolation_and_override_rejection():
    # Tenant A creates a run
    key_a = str(uuid.uuid4())
    res_a = client.post(
        "/runs",
        headers={"Authorization": "Bearer pro_operator", "Idempotency-Key": key_a},
        json={"operation": "validate", "records": VALID_FIXTURE},
    )
    run_a_id = res_a.json()["run_id"]

    # Tenant B lists runs -> does not include Tenant A's run
    runs_b = client.get("/runs", headers={"Authorization": "Bearer tenant_b_operator"}).json()
    assert all(r["run_id"] != run_a_id for r in runs_b)

    # Tenant B tries to get Tenant A's run by ID -> 404
    fetch_b = client.get(
        f"/runs/{run_a_id}/result",
        headers={"Authorization": "Bearer tenant_b_operator"},
    )
    assert fetch_b.status_code == 404

    # Request containing tenant override in header or query -> 400
    res_override1 = client.get(
        "/subscription",
        headers={"Authorization": "Bearer pro_operator", "X-Tenant-Override": "tenant-b"},
    )
    assert res_override1.status_code == 400

    res_override2 = client.get(
        "/subscription?tenant_id=tenant-b",
        headers={"Authorization": "Bearer pro_operator"},
    )
    assert res_override2.status_code == 400


# --------------------------------------------------------------------------
# A08: Basic accepts 3 runs, rejects 4th with 429; concurrent requests on last slot
# --------------------------------------------------------------------------
def test_a08_basic_quota_and_concurrency():
    # Basic accepts 3 runs
    for i in range(3):
        res = client.post(
            "/runs",
            headers={"Authorization": "Bearer basic_operator", "Idempotency-Key": f"basic-key-{i}"},
            json={"operation": "validate", "records": VALID_FIXTURE},
        )
        assert res.status_code == 201

    # 4th run -> 429
    res_4 = client.post(
        "/runs",
        headers={"Authorization": "Bearer basic_operator", "Idempotency-Key": "basic-key-4"},
        json={"operation": "validate", "records": VALID_FIXTURE},
    )
    assert res_4.status_code == 429

    # Concurrency test: with 1 slot left, 2 concurrent requests accept exactly 1
    # Reset usage to 2 (so exactly 1 slot remains out of 3)
    db = SessionLocal()
    from app.models import DailyUsageModel
    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).date()
    row = db.query(DailyUsageModel).filter_by(tenant_id="tenant-b", usage_date=today).first()
    row.count = 2
    db.commit()
    db.close()


    results = []

    def make_call(call_id):
        r = client.post(
            "/runs",
            headers={"Authorization": "Bearer basic_operator", "Idempotency-Key": f"concurrent-slot-{call_id}"},
            json={"operation": "validate", "records": VALID_FIXTURE},
        )
        results.append(r.status_code)

    t1 = threading.Thread(target=make_call, args=(1,))
    t2 = threading.Thread(target=make_call, args=(2,))
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    # Exactly one accepted (201), one rejected (429)
    assert sorted(results) == [201, 429]


# --------------------------------------------------------------------------
# A09: At exhausted quota, matching key returns 200; changed input returns 409
# --------------------------------------------------------------------------
def test_a09_idempotency_and_replay_at_exhausted_quota():
    # Exhaust Basic quota
    db = SessionLocal()
    from app.models import DailyUsageModel
    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).date()
    row = db.query(DailyUsageModel).filter_by(tenant_id="tenant-b", usage_date=today).first()
    if not row:
        row = DailyUsageModel(tenant_id="tenant-b", usage_date=today, count=3)
        db.add(row)
    else:
        row.count = 3
    db.commit()
    db.close()

    # First, run a terminal run using a specific key for tenant-a (pro)
    key = "replayed-terminal-key"
    res1 = client.post(
        "/runs",
        headers={"Authorization": "Bearer pro_operator", "Idempotency-Key": key},
        json={"operation": "validate", "records": VALID_FIXTURE},
    )
    assert res1.status_code == 201
    orig_run_id = res1.json()["run_id"]

    # Now simulate quota exhausted for tenant-a
    db = SessionLocal()
    row_a = db.query(DailyUsageModel).filter_by(tenant_id="tenant-a", usage_date=today).first()
    row_a.count = 10
    db.commit()
    db.close()

    # Replay with matching key and identical payload -> 200 without new debit
    replay_res = client.post(
        "/runs",
        headers={"Authorization": "Bearer pro_operator", "Idempotency-Key": key},
        json={"operation": "validate", "records": VALID_FIXTURE},
    )
    assert replay_res.status_code == 200
    assert replay_res.json()["run_id"] == orig_run_id

    # Replay with same key but changed input -> 409 Conflict
    changed_records = copy.deepcopy(VALID_FIXTURE)
    changed_records[0]["record_count"] = 50
    conflict_res = client.post(
        "/runs",
        headers={"Authorization": "Bearer pro_operator", "Idempotency-Key": key},
        json={"operation": "validate", "records": changed_records},
    )
    assert conflict_res.status_code == 409


# --------------------------------------------------------------------------
# A10: Subscription suspended -> 403 on submit; history reads work
# --------------------------------------------------------------------------
def test_a10_suspended_subscription():
    # Create an active run first
    key = str(uuid.uuid4())
    res = client.post(
        "/runs",
        headers={"Authorization": "Bearer pro_operator", "Idempotency-Key": key},
        json={"operation": "validate", "records": VALID_FIXTURE},
    )
    assert res.status_code == 201

    # Suspend tenant-a subscription
    harness.set_status("tenant-a", "Suspended")


    # New submission returns 403 and debits nothing
    sub_before = client.get("/subscription", headers={"Authorization": "Bearer pro_operator"}).json()
    used_before = sub_before["used_today"]

    res_suspended = client.post(
        "/runs",
        headers={"Authorization": "Bearer pro_operator", "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "validate", "records": VALID_FIXTURE},
    )
    assert res_suspended.status_code == 403

    sub_after = client.get("/subscription", headers={"Authorization": "Bearer pro_operator"}).json()
    assert sub_after["used_today"] == used_before

    # Historical reads still work
    hist_res = client.get("/runs", headers={"Authorization": "Bearer pro_operator"})
    assert hist_res.status_code == 200
    assert len(hist_res.json()) >= 1


# --------------------------------------------------------------------------
# A11: Shared failure hook forces failure after acceptance; error recorded; 1 slot used
# --------------------------------------------------------------------------
def test_a11_forced_failure_hook():
    key = str(uuid.uuid4())

    sub_before = client.get("/subscription", headers={"Authorization": "Bearer pro_operator"}).json()
    used_before = sub_before["used_today"]

    # Trigger failure hook via header
    res = client.post(
        "/runs",
        headers={
            "Authorization": "Bearer pro_operator",
            "Idempotency-Key": key,
            "X-Force-Failure": "true",
        },
        json={"operation": "process", "records": VALID_FIXTURE},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "Failed"
    assert data["error"] is not None
    assert "Forced failure" in data["error"]
    failed_run_id = data["run_id"]

    # 1 quota slot was used
    sub_after = client.get("/subscription", headers={"Authorization": "Bearer pro_operator"}).json()
    assert sub_after["used_today"] == used_before + 1

    # Replay key returns recorded failure with 200 without re-execution or extra debit
    replay_res = client.post(
        "/runs",
        headers={"Authorization": "Bearer pro_operator", "Idempotency-Key": key},
        json={"operation": "process", "records": VALID_FIXTURE},
    )
    assert replay_res.status_code == 200
    assert replay_res.json()["run_id"] == failed_run_id
    assert replay_res.json()["status"] == "Failed"

    sub_after_replay = client.get("/subscription", headers={"Authorization": "Bearer pro_operator"}).json()
    assert sub_after_replay["used_today"] == sub_after["used_today"]
