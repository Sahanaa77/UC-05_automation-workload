"""
Comprehensive tests for POST /runs flow in exact specified order.
"""
import copy
import threading
import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db import SessionLocal
from app.models import DailyUsageModel, RunModel
import tests.harness as harness

client = TestClient(app)

VALID_FIXTURE = [
    {"record_id": "J01", "tool": "EXPORT", "record_count": 20, "environment": "TEST"},
    {"record_id": "J02", "tool": "VALIDATE", "record_count": 10, "environment": "STAGE"},
]

INVALID_PROCESS_FIXTURE = [
    {"record_id": "J01", "tool": "EXPORT", "record_count": 20, "environment": "TEST"},
    {"record_id": "J02", "tool": "DELETE", "record_count": 10, "environment": "STAGE"},
]


@pytest.fixture(autouse=True)
def setup_teardown():
    harness.reset_all()
    yield


# --------------------------------------------------------------------------
# 1. Unauthenticated -> 401
# --------------------------------------------------------------------------
def test_unauthenticated_returns_401():
    res = client.post(
        "/runs",
        headers={"Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "validate", "records": VALID_FIXTURE},
    )
    assert res.status_code == 401


# --------------------------------------------------------------------------
# 2. Viewer -> 403, Basic+process -> 403, Suspended -> 403 (no debit)
# --------------------------------------------------------------------------
def test_forbidden_roles_and_subscriptions():
    # Viewer -> 403
    r_vw = client.post(
        "/runs",
        headers={"Authorization": "Bearer dev-token-a-viewer", "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "validate", "records": VALID_FIXTURE},
    )
    assert r_vw.status_code == 403

    # Basic + process -> 403
    r_bp = client.post(
        "/runs",
        headers={"Authorization": "Bearer dev-token-b-operator", "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "process", "records": VALID_FIXTURE},
    )
    assert r_bp.status_code == 403

    # Suspended -> 403, no debit
    harness.set_status("tenant-a", "Suspended")
    sub_before = client.get("/subscription", headers={"Authorization": "Bearer dev-token-a-operator"}).json()
    r_susp = client.post(
        "/runs",
        headers={"Authorization": "Bearer dev-token-a-operator", "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "validate", "records": VALID_FIXTURE},
    )
    assert r_susp.status_code == 403
    sub_after = client.get("/subscription", headers={"Authorization": "Bearer dev-token-a-operator"}).json()
    assert sub_after["used_today"] == sub_before["used_today"]


# --------------------------------------------------------------------------
# 3. Bad structure / missing Idempotency-Key -> 400
# --------------------------------------------------------------------------
def test_structure_and_missing_idempotency_key_400():
    # Missing Idempotency-Key -> 400
    r_no_key = client.post(
        "/runs",
        headers={"Authorization": "Bearer dev-token-a-operator"},
        json={"operation": "validate", "records": VALID_FIXTURE},
    )
    assert r_no_key.status_code == 400

    # 11 rows -> 400
    eleven_recs = [
        {"record_id": f"J{i:02d}", "tool": "EXPORT", "record_count": 10, "environment": "TEST"}
        for i in range(11)
    ]
    r_11 = client.post(
        "/runs",
        headers={"Authorization": "Bearer dev-token-a-operator", "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "validate", "records": eleven_recs},
    )
    assert r_11.status_code == 400

    # Extra keys in body (e.g. tenant_id) -> 400
    r_extra = client.post(
        "/runs",
        headers={"Authorization": "Bearer dev-token-a-operator", "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "validate", "records": VALID_FIXTURE, "tenant_id": "tenant-b"},
    )
    assert r_extra.status_code == 400


# --------------------------------------------------------------------------
# 4. Invalid process input -> 400, no run, no quota
# --------------------------------------------------------------------------
def test_invalid_process_input_400_no_debit():
    sub_before = client.get("/subscription", headers={"Authorization": "Bearer dev-token-a-operator"}).json()

    res = client.post(
        "/runs",
        headers={"Authorization": "Bearer dev-token-a-operator", "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "process", "records": INVALID_PROCESS_FIXTURE},
    )
    assert res.status_code == 400

    sub_after = client.get("/subscription", headers={"Authorization": "Bearer dev-token-a-operator"}).json()
    assert sub_after["used_today"] == sub_before["used_today"]

    # Verify no run was inserted
    db = SessionLocal()
    assert db.query(RunModel).count() == 0
    db.close()


# --------------------------------------------------------------------------
# 5. Idempotency: replay at exhausted quota -> 200, changed input -> 409
# --------------------------------------------------------------------------
def test_idempotency_replay_and_conflict():
    key = str(uuid.uuid4())

    # Initial successful run
    res1 = client.post(
        "/runs",
        headers={"Authorization": "Bearer dev-token-a-operator", "Idempotency-Key": key},
        json={"operation": "validate", "records": VALID_FIXTURE},
    )
    assert res1.status_code == 201
    run_id = res1.json()["run_id"]

    # Replay with same input -> 200 same run
    res2 = client.post(
        "/runs",
        headers={"Authorization": "Bearer dev-token-a-operator", "Idempotency-Key": key},
        json={"operation": "validate", "records": VALID_FIXTURE},
    )
    assert res2.status_code == 200
    assert res2.json()["run_id"] == run_id

    # Exhaust quota artificially to limit (10 for Pro)
    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).date()
    db = SessionLocal()
    usage = db.query(DailyUsageModel).filter_by(tenant_id="tenant-a", usage_date=today).first()
    usage.count = 10
    db.commit()
    db.close()

    # Replay at exhausted quota -> still returns 200 with original run, no debit
    res_replay_exhausted = client.post(
        "/runs",
        headers={"Authorization": "Bearer dev-token-a-operator", "Idempotency-Key": key},
        json={"operation": "validate", "records": VALID_FIXTURE},
    )
    assert res_replay_exhausted.status_code == 200
    assert res_replay_exhausted.json()["run_id"] == run_id

    # Changed input with same key -> 409
    changed_records = copy.deepcopy(VALID_FIXTURE)
    changed_records[0]["record_count"] = 99
    res_conflict = client.post(
        "/runs",
        headers={"Authorization": "Bearer dev-token-a-operator", "Idempotency-Key": key},
        json={"operation": "validate", "records": changed_records},
    )
    assert res_conflict.status_code == 409


# --------------------------------------------------------------------------
# 6. Basic 3 accepted then 429
# --------------------------------------------------------------------------
def test_basic_3_accepted_then_429():
    for i in range(3):
        res = client.post(
            "/runs",
            headers={"Authorization": "Bearer dev-token-b-operator", "Idempotency-Key": f"basic-key-{i}"},
            json={"operation": "validate", "records": VALID_FIXTURE},
        )
        assert res.status_code == 201

    # 4th run -> 429
    res_4th = client.post(
        "/runs",
        headers={"Authorization": "Bearer dev-token-b-operator", "Idempotency-Key": "basic-key-4"},
        json={"operation": "validate", "records": VALID_FIXTURE},
    )
    assert res_4th.status_code == 429


# --------------------------------------------------------------------------
# 7. One slot left + two concurrent threads -> exactly one accepted
# --------------------------------------------------------------------------
def test_concurrency_one_slot_left():
    # Set usage to 2 for tenant-b (limit is 3, so exactly 1 slot remains)
    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).date()
    db = SessionLocal()
    usage = DailyUsageModel(tenant_id="tenant-b", usage_date=today, count=2)
    db.add(usage)
    db.commit()
    db.close()

    status_codes = []

    def submit(caller_id):
        r = client.post(
            "/runs",
            headers={"Authorization": "Bearer dev-token-b-operator", "Idempotency-Key": f"concurrent-{caller_id}"},
            json={"operation": "validate", "records": VALID_FIXTURE},
        )
        status_codes.append(r.status_code)

    t1 = threading.Thread(target=submit, args=(1,))
    t2 = threading.Thread(target=submit, args=(2,))
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    # Exactly one 201, one 429
    assert sorted(status_codes) == [201, 429]


# --------------------------------------------------------------------------
# 8. Two simultaneous identical keys -> one run
# --------------------------------------------------------------------------
def test_two_simultaneous_identical_keys():
    shared_key = f"identical-key-{uuid.uuid4()}"
    status_codes = []
    run_ids = []

    def submit_identical():
        r = client.post(
            "/runs",
            headers={"Authorization": "Bearer dev-token-a-operator", "Idempotency-Key": shared_key},
            json={"operation": "validate", "records": VALID_FIXTURE},
        )
        status_codes.append(r.status_code)
        if r.status_code in (200, 201):
            run_ids.append(r.json()["run_id"])

    t1 = threading.Thread(target=submit_identical)
    t2 = threading.Thread(target=submit_identical)
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    # Only one run was created in DB
    db = SessionLocal()
    count = db.query(RunModel).filter_by(tenant_id="tenant-a", idempotency_key=shared_key).count()
    assert count == 1
    db.close()

    # Both requests succeeded (one 201 created, one 200 replayed / terminal) and got identical run_id
    assert all(code in (200, 201) for code in status_codes)
    assert len(set(run_ids)) == 1


# --------------------------------------------------------------------------
# 9. Forced failure -> Failed, 1 slot used, replay returns the failure
# --------------------------------------------------------------------------
def test_forced_failure_lifecycle():
    harness.set_force_failure(True, "Simulated processor error")
    key = str(uuid.uuid4())

    sub_before = client.get("/subscription", headers={"Authorization": "Bearer dev-token-a-operator"}).json()

    res = client.post(
        "/runs",
        headers={"Authorization": "Bearer dev-token-a-operator", "Idempotency-Key": key},
        json={"operation": "process", "records": VALID_FIXTURE},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "Failed"
    assert data["error"] == "Simulated processor error"
    failed_id = data["run_id"]

    # Quota slot was used
    sub_after = client.get("/subscription", headers={"Authorization": "Bearer dev-token-a-operator"}).json()
    assert sub_after["used_today"] == sub_before["used_today"] + 1

    # Replay returns same failure without re-executing or debiting quota
    harness.set_force_failure(False)
    res_replay = client.post(
        "/runs",
        headers={"Authorization": "Bearer dev-token-a-operator", "Idempotency-Key": key},
        json={"operation": "process", "records": VALID_FIXTURE},
    )
    assert res_replay.status_code == 200
    assert res_replay.json()["run_id"] == failed_id
    assert res_replay.json()["status"] == "Failed"
    assert res_replay.json()["error"] == "Simulated processor error"

    sub_final = client.get("/subscription", headers={"Authorization": "Bearer dev-token-a-operator"}).json()
    assert sub_final["used_today"] == sub_after["used_today"]


# --------------------------------------------------------------------------
# 10. History retrieval & cross-tenant isolation regression tests
# --------------------------------------------------------------------------
def test_history_retrieval_and_cross_tenant_isolation():
    key = str(uuid.uuid4())
    res = client.post(
        "/runs",
        headers={"Authorization": "Bearer token-tenant-a-operator", "Idempotency-Key": key},
        json={"operation": "validate", "records": VALID_FIXTURE},
    )
    assert res.status_code == 201
    run_id = res.json()["run_id"]

    # Same tenant lists runs -> includes new run
    runs_a = client.get("/runs", headers={"Authorization": "Bearer token-tenant-a-operator"}).json()
    assert any(r["run_id"] == run_id for r in runs_a)

    # Different tenant lists runs -> does NOT include run_id
    runs_b = client.get("/runs", headers={"Authorization": "Bearer token-tenant-b-operator"}).json()
    assert all(r["run_id"] != run_id for r in runs_b)

    # Cross-tenant result lookup -> 404
    fetch_b = client.get(f"/runs/{run_id}/result", headers={"Authorization": "Bearer token-tenant-b-operator"})
    assert fetch_b.status_code == 404

    # Same-tenant result lookup -> 200
    fetch_a = client.get(f"/runs/{run_id}/result", headers={"Authorization": "Bearer token-tenant-a-operator"})
    assert fetch_a.status_code == 200
    assert fetch_a.json()["run_id"] == run_id


def test_history_replay_same_key_no_duplicate_no_quota_debit():
    key = str(uuid.uuid4())
    res1 = client.post(
        "/runs",
        headers={"Authorization": "Bearer token-tenant-a-operator", "Idempotency-Key": key},
        json={"operation": "validate", "records": VALID_FIXTURE},
    )
    assert res1.status_code == 201
    run_id1 = res1.json()["run_id"]

    sub_after1 = client.get("/subscription", headers={"Authorization": "Bearer token-tenant-a-operator"}).json()
    used_after1 = sub_after1["used_today"]

    # Replay with same key and same payload
    res2 = client.post(
        "/runs",
        headers={"Authorization": "Bearer token-tenant-a-operator", "Idempotency-Key": key},
        json={"operation": "validate", "records": VALID_FIXTURE},
    )
    assert res2.status_code == 200
    assert res2.json()["run_id"] == run_id1

    # Verify quota did not change
    sub_after2 = client.get("/subscription", headers={"Authorization": "Bearer token-tenant-a-operator"}).json()
    assert sub_after2["used_today"] == used_after1

    # Verify exactly one row in history for this run
    runs_a = client.get("/runs", headers={"Authorization": "Bearer token-tenant-a-operator"}).json()
    matching_runs = [r for r in runs_a if r["run_id"] == run_id1]
    assert len(matching_runs) == 1


def test_persistence_across_cold_restart():
    key = str(uuid.uuid4())
    res = client.post(
        "/runs",
        headers={"Authorization": "Bearer token-tenant-a-operator", "Idempotency-Key": key},
        json={"operation": "process", "records": VALID_FIXTURE},
    )
    assert res.status_code == 201
    run_id = res.json()["run_id"]
    result_data = res.json()["result"]

    # Simulate restart by creating a new TestClient with fresh connection
    new_client = TestClient(app)
    get_res = new_client.get("/runs", headers={"Authorization": "Bearer token-tenant-a-operator"})
    assert get_res.status_code == 200
    runs = get_res.json()
    assert any(r["run_id"] == run_id for r in runs)

    # Result retrieval across restart boundary
    result_res = new_client.get(f"/runs/{run_id}/result", headers={"Authorization": "Bearer token-tenant-a-operator"})
    assert result_res.status_code == 200
    assert result_res.json()["result"] == result_data


def test_competition_evaluation_tokens_accepted():
    # Verify that organizer-provided competition evaluation identities work properly
    res_a = client.get("/subscription", headers={"Authorization": "Bearer token-tenant-a-operator"})
    assert res_a.status_code == 200
    assert res_a.json()["tenant_id"] == "tenant-a"
    assert res_a.json()["plan"] == "Pro"

    res_b = client.get("/subscription", headers={"Authorization": "Bearer token-tenant-b-operator"})
    assert res_b.status_code == 200
    assert res_b.json()["tenant_id"] == "tenant-b"
    assert res_b.json()["plan"] == "Basic"

    # Viewer role check
    viewer_submit = client.post(
        "/runs",
        headers={"Authorization": "Bearer token-tenant-a-viewer", "Idempotency-Key": str(uuid.uuid4())},
        json={"operation": "validate", "records": VALID_FIXTURE},
    )
    assert viewer_submit.status_code == 403
