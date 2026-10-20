"""
Unit and structural tests for validation.py and processor.py.
"""
import json
import pytest
from fastapi import HTTPException

from app.validation import validate_records, validate_request_structure
from app.processor import process


VALID_FIXTURE = [
    {"record_id": "J01", "tool": "EXPORT", "record_count": 20, "environment": "TEST"},
    {"record_id": "J02", "tool": "VALIDATE", "record_count": 10, "environment": "STAGE"},
]

INVALID_FIXTURE = [
    # 2 valid rows
    {"record_id": "J01", "tool": "EXPORT", "record_count": 20, "environment": "TEST"},
    {"record_id": "J02", "tool": "VALIDATE", "record_count": 10, "environment": "STAGE"},
    # 4 mutated copies of row 1:
    {"record_id": "J01", "tool": "EXPORT", "record_count": 20, "environment": "TEST"},  # X1: R1 duplicate J01
    {"record_id": "X2", "tool": "DELETE", "record_count": 20, "environment": "TEST"},   # X2: R2 tool DELETE
    {"record_id": "X3", "tool": "EXPORT", "record_count": 0, "environment": "TEST"},    # X3: R3 record_count 0
    {"record_id": "X4", "tool": "EXPORT", "record_count": 20, "environment": "PROD"},   # X4: R4 env PROD
]


def test_valid_fixture():
    res = validate_records(VALID_FIXTURE)
    assert res["valid_rows"] == 2
    assert res["invalid_rows"] == 0
    assert res["issues"] == []

    # Processor test on valid rows
    proc_res = process(res["cleaned_rows"])
    assert proc_res["summary"]["input_rows"] == 2
    assert proc_res["summary"]["total_records"] == 30
    assert proc_res["summary"]["total_estimated_ms"] == 300

    assert len(proc_res["rows"]) == 2
    assert proc_res["rows"][0] == {"record_id": "J01", "estimated_ms": 200}
    assert proc_res["rows"][1] == {"record_id": "J02", "estimated_ms": 100}
    assert proc_res["issues"] == []


def test_invalid_fixture():
    res = validate_records(INVALID_FIXTURE)
    assert res["valid_rows"] == 2
    assert res["invalid_rows"] == 4

    # Exactly one issue each for R1, R2, R3, R4
    issues = res["issues"]
    assert len(issues) == 4
    rule_map = {iss["rule_id"]: iss for iss in issues}
    assert set(rule_map.keys()) == {"R1", "R2", "R3", "R4"}
    assert rule_map["R1"]["field"] == "record_id"
    assert rule_map["R2"]["field"] == "tool"
    assert rule_map["R3"]["field"] == "record_count"
    assert rule_map["R4"]["field"] == "environment"


def test_record_count_rejects_bool_and_numeric_string():
    # Test bool (True)
    bool_row = [{"record_id": "B1", "tool": "EXPORT", "record_count": True, "environment": "TEST"}]
    res_bool = validate_records(bool_row)
    assert res_bool["invalid_rows"] == 1
    assert any(iss["rule_id"] == "R3" and iss["field"] == "record_count" for iss in res_bool["issues"])

    # Test bool (False)
    bool_row_f = [{"record_id": "B2", "tool": "EXPORT", "record_count": False, "environment": "TEST"}]
    res_bool_f = validate_records(bool_row_f)
    assert res_bool_f["invalid_rows"] == 1
    assert any(iss["rule_id"] == "R3" and iss["field"] == "record_count" for iss in res_bool_f["issues"])

    # Test numeric string "5"
    str_row = [{"record_id": "S1", "tool": "EXPORT", "record_count": "5", "environment": "TEST"}]
    res_str = validate_records(str_row)
    assert res_str["invalid_rows"] == 1
    assert any(iss["rule_id"] == "R3" and iss["field"] == "record_count" for iss in res_str["issues"])


def test_structure_errors_raise_400():
    valid_payload = {"operation": "validate", "records": VALID_FIXTURE}
    valid_bytes = json.dumps(valid_payload).encode("utf-8")
    # Valid structure should not raise
    validate_request_structure(valid_bytes, valid_payload)

    # 1. Body keys not exactly operation + records (extra tenant_id)
    with pytest.raises(HTTPException) as exc_info:
        extra_keys = {"operation": "validate", "records": VALID_FIXTURE, "tenant_id": "tenant-x"}
        validate_request_structure(json.dumps(extra_keys).encode(), extra_keys)
    assert exc_info.value.status_code == 400

    # 2. Missing operation
    with pytest.raises(HTTPException) as exc_info:
        missing_op = {"records": VALID_FIXTURE}
        validate_request_structure(json.dumps(missing_op).encode(), missing_op)
    assert exc_info.value.status_code == 400

    # 3. Operation not validate or process
    with pytest.raises(HTTPException) as exc_info:
        bad_op = {"operation": "delete", "records": VALID_FIXTURE}
        validate_request_structure(json.dumps(bad_op).encode(), bad_op)
    assert exc_info.value.status_code == 400

    # 4. Records not a list of 1..10 objects (0 objects)
    with pytest.raises(HTTPException) as exc_info:
        empty_rec = {"operation": "validate", "records": []}
        validate_request_structure(json.dumps(empty_rec).encode(), empty_rec)
    assert exc_info.value.status_code == 400

    # 5. Records > 10 objects (11 objects)
    eleven_recs = [
        {"record_id": f"J{i:02d}", "tool": "EXPORT", "record_count": 10, "environment": "TEST"}
        for i in range(11)
    ]
    with pytest.raises(HTTPException) as exc_info:
        eleven_payload = {"operation": "validate", "records": eleven_recs}
        validate_request_structure(json.dumps(eleven_payload).encode(), eleven_payload)
    assert exc_info.value.status_code == 400

    # 6. Record with missing or extra keys
    with pytest.raises(HTTPException) as exc_info:
        bad_row_payload = {
            "operation": "validate",
            "records": [{"record_id": "J01", "tool": "EXPORT", "record_count": 10}],
        }
        validate_request_structure(json.dumps(bad_row_payload).encode(), bad_row_payload)
    assert exc_info.value.status_code == 400

    # 7. Body > 64 KiB
    big_bytes = b"x" * 65537
    with pytest.raises(HTTPException) as exc_info:
        validate_request_structure(big_bytes, valid_payload)
    assert exc_info.value.status_code == 400
