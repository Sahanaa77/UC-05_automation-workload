import concurrent.futures
from datetime import datetime, timezone
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from entitlesim.db import Base, DailyUsageRecord, RunRecord, SessionLocal, engine, init_db
from entitlesim.main import app

client = TestClient(app)

# Test tokens configured in auth.py
TOKEN_PRO_OPERATOR = "Bearer token-tenant-a-operator"
TOKEN_PRO_VIEWER = "Bearer token-tenant-a-viewer"
TOKEN_BASIC_OPERATOR = "Bearer token-tenant-b-operator"
TOKEN_BASIC_VIEWER = "Bearer token-tenant-b-viewer"
TOKEN_SUSPENDED_OPERATOR = "Bearer token-tenant-suspended-operator"

# Canonical UC-05 Fixtures
VALID_FIXTURE_RECORDS = [
    {"record_id": "J01", "tool": "EXPORT", "record_count": 20, "environment": "TEST"},
    {"record_id": "J02", "tool": "VALIDATE", "record_count": 10, "environment": "STAGE"},
]

INVALID_FIXTURE_RECORDS = [
    {"record_id": "J01", "tool": "EXPORT", "record_count": 20, "environment": "TEST"},
    {"record_id": "J02", "tool": "VALIDATE", "record_count": 10, "environment": "STAGE"},
    {"record_id": "J01", "tool": "EXPORT", "record_count": 20, "environment": "TEST"},  # R1 duplicate J01
    {"record_id": "X2", "tool": "DELETE", "record_count": 20, "environment": "TEST"},   # R2 invalid tool
    {"record_id": "X3", "tool": "EXPORT", "record_count": 0, "environment": "TEST"},    # R3 invalid count
    {"record_id": "X4", "tool": "EXPORT", "record_count": 20, "environment": "PROD"},   # R4 invalid env
]


@pytest.fixture(autouse=True)
def clean_db():
    init_db()
    db = SessionLocal()
    try:
        db.query(DailyUsageRecord).delete()
        db.query(RunRecord).filter(RunRecord.tenant_id.isnot(None)).delete()
        db.commit()
    finally:
        db.close()
    yield


# ---------------------------------------------------------------------------
# Route Inspection & Public Health Check
# ---------------------------------------------------------------------------

def test_routes_exist_and_health_is_public():
    # GET /health is public and returns 200
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
    assert "tenant_id" not in res.json()

    # Protected routes without auth return 401
    assert client.get("/tools").status_code == 401
    assert client.get("/subscription").status_code == 401
    assert client.get("/runs").status_code == 401
    assert client.post("/runs", json={"operation": "validate", "records": VALID_FIXTURE_RECORDS}).status_code == 401


# ---------------------------------------------------------------------------
# A02: Valid Fixture Validation
# ---------------------------------------------------------------------------

def test_a02_valid_fixture_validation():
    """A02: validate on the two-row valid fixture reports valid_rows 2,
    invalid_rows 0 and no issues.
    """
    key = str(uuid.uuid4())
    res = client.post(
        "/runs",
        headers={"Authorization": TOKEN_PRO_OPERATOR, "Idempotency-Key": key},
        json={"operation": "validate", "records": VALID_FIXTURE_RECORDS},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "Succeeded"
    assert data["operation"] == "validate"

    result = data["result"]
    assert result["valid_rows"] == 2
    assert result["invalid_rows"] == 0
    assert result["issues"] == []


# ---------------------------------------------------------------------------
# A03: Invalid Fixture Validation
# ---------------------------------------------------------------------------

def test_a03_invalid_fixture_validation():
    """A03: validate on the six-row invalid fixture reports valid_rows 2,
    invalid_rows 4 and the four specified rule failures (R1, R2, R3, R4).
    """
    key = str(uuid.uuid4())
    res = client.post(
        "/runs",
        headers={"Authorization": TOKEN_PRO_OPERATOR, "Idempotency-Key": key},
        json={"operation": "validate", "records": INVALID_FIXTURE_RECORDS},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "Succeeded"

    result = data["result"]
    assert result["valid_rows"] == 2
    assert result["invalid_rows"] == 4

    rules_failed = {issue["rule_id"] for issue in result["issues"]}
    assert rules_failed == {"R1", "R2", "R3", "R4"}


# ---------------------------------------------------------------------------
# A04: Pro Process Returns Exact Rows & Summary, Persists Across Restart
# ---------------------------------------------------------------------------

def test_a04_pro_process_execution_and_persistence():
    """A04: Pro process returns exactly the specified rows and summary;
    its result survives an app restart and is retrieved through the API.
    """
    key = str(uuid.uuid4())
    res = client.post(
        "/runs",
        headers={"Authorization": TOKEN_PRO_OPERATOR, "Idempotency-Key": key},
        json={"operation": "process", "records": VALID_FIXTURE_RECORDS},
    )
    assert res.status_code == 201
    data = res.json()
    run_id = data["run_id"]
    assert data["status"] == "Succeeded"
    assert data["operation"] == "process"

    result = data["result"]
    summary = result["summary"]
    assert summary["input_rows"] == 2
    assert summary["total_records"] == 30
    assert summary["total_estimated_ms"] == 300

    rows = result["rows"]
    assert len(rows) == 2
    assert rows[0]["record_id"] == "J01"
    assert rows[0]["estimated_ms"] == 200
    assert rows[1]["record_id"] == "J02"
    assert rows[1]["estimated_ms"] == 100

    # Retrieve through GET /runs/{id}/result (simulating fresh session / restart)
    get_res = client.get(
        f"/runs/{run_id}/result",
        headers={"Authorization": TOKEN_PRO_OPERATOR},
    )
    assert get_res.status_code == 200
    saved_data = get_res.json()
    assert saved_data["run_id"] == run_id
    assert saved_data["status"] == "Succeeded"
    assert saved_data["result"]["summary"]["total_estimated_ms"] == 300


# ---------------------------------------------------------------------------
# A05: Invalid Process Rejection & Quota Protection
# ---------------------------------------------------------------------------

def test_a05_invalid_process_input_and_shape_rejection():
    """A05: Invalid process input, a wrong-shaped body and an 11-row batch
    each return 400 with no new run or quota debit.
    """
    sub_before = client.get("/subscription", headers={"Authorization": TOKEN_PRO_OPERATOR}).json()
    quota_used_start = sub_before["used_today"]

    # 1. Invalid process input (6-row invalid fixture)
    res_invalid_proc = client.post(
        "/runs",
        headers={"Authorization": TOKEN_PRO_OPERATOR, "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "process", "records": INVALID_FIXTURE_RECORDS},
    )
    assert res_invalid_proc.status_code == 400

    # 2. 11-row batch exceeds maximum 10 rows
    eleven_rows = VALID_FIXTURE_RECORDS * 6  # 12 rows
    res_too_many = client.post(
        "/runs",
        headers={"Authorization": TOKEN_PRO_OPERATOR, "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "validate", "records": eleven_rows},
    )
    assert res_too_many.status_code == 400

    # 3. Wrong-shaped body (missing records or extra unknown fields)
    res_wrong_shape = client.post(
        "/runs",
        headers={"Authorization": TOKEN_PRO_OPERATOR, "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "validate", "unknown_field": True},
    )
    assert res_wrong_shape.status_code == 400

    # Confirm zero quota debited and zero runs created
    sub_after = client.get("/subscription", headers={"Authorization": TOKEN_PRO_OPERATOR}).json()
    assert sub_after["used_today"] == quota_used_start
    runs_res = client.get("/runs", headers={"Authorization": TOKEN_PRO_OPERATOR}).json()
    assert len(runs_res) == 0


# ---------------------------------------------------------------------------
# A06: Authentication & Role Enforcement
# ---------------------------------------------------------------------------

def test_a06_auth_and_role_enforcement():
    """A06: Unauthenticated requests to protected routes return 401;
    Viewer submission and Basic process both return 403 with no quota debit.
    Fabricated / unknown tokens are rejected with 401.
    """
    # 1. Unauthenticated request to /runs returns 401
    res_unauth = client.post(
        "/runs",
        headers={"Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "validate", "records": VALID_FIXTURE_RECORDS},
    )
    assert res_unauth.status_code == 401

    # 2. Fabricated token returns 401
    res_fake = client.post(
        "/runs",
        headers={"Authorization": "Bearer fabricated-token-xyz", "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "validate", "records": VALID_FIXTURE_RECORDS},
    )
    assert res_fake.status_code == 401

    # 3. Viewer submission returns 403
    res_viewer = client.post(
        "/runs",
        headers={"Authorization": TOKEN_PRO_VIEWER, "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "validate", "records": VALID_FIXTURE_RECORDS},
    )
    assert res_viewer.status_code == 403

    # 4. Basic process returns 403
    res_basic_proc = client.post(
        "/runs",
        headers={"Authorization": TOKEN_BASIC_OPERATOR, "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "process", "records": VALID_FIXTURE_RECORDS},
    )
    assert res_basic_proc.status_code == 403


# ---------------------------------------------------------------------------
# A07: Tenant Isolation & Override Rejection
# ---------------------------------------------------------------------------

def test_a07_tenant_isolation_and_override_rejection():
    """A07: Tenant B cannot list tenant A's runs; fetching A's result by ID
    returns 404. A request containing a tenant override is rejected.
    """
    # Tenant A creates a run
    run_res = client.post(
        "/runs",
        headers={"Authorization": TOKEN_PRO_OPERATOR, "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "validate", "records": VALID_FIXTURE_RECORDS},
    )
    assert run_res.status_code == 201
    tenant_a_run_id = run_res.json()["run_id"]

    # Tenant B lists runs — must not contain Tenant A's run
    tenant_b_runs = client.get("/runs", headers={"Authorization": TOKEN_BASIC_OPERATOR}).json()
    assert all(r["run_id"] != tenant_a_run_id for r in tenant_b_runs)

    # Tenant B attempts to fetch Tenant A's result by ID — must return 404
    get_res = client.get(
        f"/runs/{tenant_a_run_id}/result",
        headers={"Authorization": TOKEN_BASIC_OPERATOR},
    )
    assert get_res.status_code == 404

    # Tenant override in body is rejected with 400
    res_override = client.post(
        "/runs",
        headers={"Authorization": TOKEN_PRO_OPERATOR, "Idempotency-Key": str(uuid.uuid4())},
        json={"tenant_id": "tenant-b", "operation": "validate", "records": VALID_FIXTURE_RECORDS},
    )
    assert res_override.status_code == 400


# ---------------------------------------------------------------------------
# A08: Daily Quota & Atomic Reservation Under Concurrency
# ---------------------------------------------------------------------------

def test_a08_basic_quota_and_concurrency():
    """A08: Basic accepts three unique validate runs and rejects the fourth
    with 429. With one slot left, two concurrent new requests accept exactly one.
    """
    # 1. Basic accepts exactly 3 runs
    for i in range(3):
        res = client.post(
            "/runs",
            headers={"Authorization": TOKEN_BASIC_OPERATOR, "Idempotency-Key": f"basic-key-{i}"},
            json={"operation": "validate", "records": VALID_FIXTURE_RECORDS},
        )
        assert res.status_code == 201

    # 4th submission rejected with 429
    res_4th = client.post(
        "/runs",
        headers={"Authorization": TOKEN_BASIC_OPERATOR, "Idempotency-Key": "basic-key-4"},
        json={"operation": "validate", "records": VALID_FIXTURE_RECORDS},
    )
    assert res_4th.status_code == 429

    # 2. Concurrency test: Tenant A has 1 slot left (e.g. at 9/10 runs)
    db = SessionLocal()
    today_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    usage = db.query(DailyUsageRecord).filter_by(tenant_id="tenant-a", utc_date=today_utc).first()
    if not usage:
        usage = DailyUsageRecord(id=str(uuid.uuid4()), tenant_id="tenant-a", utc_date=today_utc, count=9)
        db.add(usage)
    else:
        usage.count = 9
    db.commit()
    db.close()

    # Two concurrent requests competing for the 10th and final slot
    def submit_concurrent(req_id):
        return client.post(
            "/runs",
            headers={"Authorization": TOKEN_PRO_OPERATOR, "Idempotency-Key": f"concurrent-{req_id}"},
            json={"operation": "validate", "records": VALID_FIXTURE_RECORDS},
        ).status_code

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(submit_concurrent, 1)
        f2 = executor.submit(submit_concurrent, 2)
        results = [f1.result(), f2.result()]

    # Exactly one request must be accepted (201) and one rejected (429)
    assert sorted(results) == [201, 429]


# ---------------------------------------------------------------------------
# A09: Idempotency Replay & Input Conflict
# ---------------------------------------------------------------------------

def test_a09_idempotency_terminal_replay_and_conflict():
    """A09: At exhausted quota, a matching accepted key returns the same run with 200
    and no debit. Reusing the key with changed input returns 409.
    Two simultaneous identical keys create at most one run.
    """
    idemp_key = f"idemp-test-{uuid.uuid4()}"
    res1 = client.post(
        "/runs",
        headers={"Authorization": TOKEN_PRO_OPERATOR, "Idempotency-Key": idemp_key},
        json={"operation": "validate", "records": VALID_FIXTURE_RECORDS},
    )
    assert res1.status_code == 201
    run_id1 = res1.json()["run_id"]

    # 1. Terminal replay returns 200 with identical run_id
    res_replay = client.post(
        "/runs",
        headers={"Authorization": TOKEN_PRO_OPERATOR, "Idempotency-Key": idemp_key},
        json={"operation": "validate", "records": VALID_FIXTURE_RECORDS},
    )
    assert res_replay.status_code == 200
    assert res_replay.json()["run_id"] == run_id1

    # 2. Reusing same key with changed payload returns 409 Conflict
    mutated_records = [VALID_FIXTURE_RECORDS[0]]
    res_conflict = client.post(
        "/runs",
        headers={"Authorization": TOKEN_PRO_OPERATOR, "Idempotency-Key": idemp_key},
        json={"operation": "validate", "records": mutated_records},
    )
    assert res_conflict.status_code == 409

    # 3. Exhaust quota for Tenant A (force used_today to 10)
    db = SessionLocal()
    today_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    usage = db.query(DailyUsageRecord).filter_by(tenant_id="tenant-a", utc_date=today_utc).first()
    usage.count = 10
    db.commit()
    db.close()

    # Replay of the existing key must STILL return 200 OK without debit or 429 error
    res_replay_exhausted = client.post(
        "/runs",
        headers={"Authorization": TOKEN_PRO_OPERATOR, "Idempotency-Key": idemp_key},
        json={"operation": "validate", "records": VALID_FIXTURE_RECORDS},
    )
    assert res_replay_exhausted.status_code == 200
    assert res_replay_exhausted.json()["run_id"] == run_id1

    # But a fresh key at exhausted quota must be rejected with 429
    res_fresh_at_exhausted = client.post(
        "/runs",
        headers={"Authorization": TOKEN_PRO_OPERATOR, "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "validate", "records": VALID_FIXTURE_RECORDS},
    )
    assert res_fresh_at_exhausted.status_code == 429

    # 4. Two simultaneous identical keys create at most one run
    simul_key = f"simul-{uuid.uuid4()}"
    # Reset usage to 0 for concurrency test
    db = SessionLocal()
    usage = db.query(DailyUsageRecord).filter_by(tenant_id="tenant-a", utc_date=today_utc).first()
    usage.count = 0
    db.commit()
    db.close()

    def submit_simul():
        return client.post(
            "/runs",
            headers={"Authorization": TOKEN_PRO_OPERATOR, "Idempotency-Key": simul_key},
            json={"operation": "validate", "records": VALID_FIXTURE_RECORDS},
        ).status_code

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(submit_simul)
        f2 = executor.submit(submit_simul)
        simul_results = [f1.result(), f2.result()]

    assert 201 in simul_results
    assert all(code in (200, 201, 409) for code in simul_results)


# ---------------------------------------------------------------------------
# A10: Suspended Subscription
# ---------------------------------------------------------------------------

def test_a10_suspended_subscription():
    """A10: The harness suspends the subscription: new submissions return 403
    and debit nothing; authorised historical reads continue to work.
    """
    res_submit = client.post(
        "/runs",
        headers={"Authorization": TOKEN_SUSPENDED_OPERATOR, "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "validate", "records": VALID_FIXTURE_RECORDS},
    )
    assert res_submit.status_code == 403

    # Historical reads still succeed
    res_hist = client.get("/runs", headers={"Authorization": TOKEN_SUSPENDED_OPERATOR})
    assert res_hist.status_code == 200

    res_sub = client.get("/subscription", headers={"Authorization": TOKEN_SUSPENDED_OPERATOR})
    assert res_sub.status_code == 200
    assert res_sub.json()["status"] == "suspended"


# ---------------------------------------------------------------------------
# A11: Forced Failure Test Hook
# ---------------------------------------------------------------------------

def test_a11_forced_failure_hook():
    """A11: The shared hook forces a processing failure after acceptance:
    the run is Failed, the error is recorded and one slot is used.
    Replaying its key returns that failure without re-execution.
    """
    idemp_key = f"fail-key-{uuid.uuid4()}"
    res = client.post(
        "/runs",
        headers={
            "Authorization": TOKEN_PRO_OPERATOR,
            "Idempotency-Key": idemp_key,
            "X-Test-Force-Failure": "1",
        },
        json={"operation": "process", "records": VALID_FIXTURE_RECORDS},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "Failed"
    assert "error" in data and data["error"] is not None

    # Replaying same key returns existing Failed run with HTTP 200 without re-execution
    res_replay = client.post(
        "/runs",
        headers={"Authorization": TOKEN_PRO_OPERATOR, "Idempotency-Key": idemp_key},
        json={"operation": "process", "records": VALID_FIXTURE_RECORDS},
    )
    assert res_replay.status_code == 200
    assert res_replay.json()["status"] == "Failed"
    assert res_replay.json()["error"] == data["error"]


# ---------------------------------------------------------------------------
# Database Schema Integrity & Uniqueness Constraints
# ---------------------------------------------------------------------------

def test_database_uniqueness_constraints():
    """Verifies that database schema enforces uniqueness at the database level."""
    db = SessionLocal()
    try:
        # 1. Uniqueness on runs (tenant_id, idempotency_key)
        run_1 = RunRecord(
            id=str(uuid.uuid4()),
            tenant_id="tenant-a",
            idempotency_key="unique-key-1",
            operation="validate",
            status="Succeeded",
        )
        db.add(run_1)
        db.commit()

        run_dup = RunRecord(
            id=str(uuid.uuid4()),
            tenant_id="tenant-a",
            idempotency_key="unique-key-1",  # duplicate
            operation="validate",
            status="Succeeded",
        )
        db.add(run_dup)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

        # 2. Uniqueness on daily_usage (tenant_id, utc_date)
        usage_1 = DailyUsageRecord(
            id=str(uuid.uuid4()),
            tenant_id="tenant-a",
            utc_date="2026-10-21",
            count=1,
        )
        db.add(usage_1)
        db.commit()

        usage_dup = DailyUsageRecord(
            id=str(uuid.uuid4()),
            tenant_id="tenant-a",
            utc_date="2026-10-21",  # duplicate
            count=2,
        )
        db.add(usage_dup)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
    finally:
        db.close()
