"""
Validation rules for UC-05: Automation Workload Preview.
Implements structural validation (400 before acceptance) and row rules R1 to R4.
"""
from typing import List, Dict, Any, Tuple
from fastapi import HTTPException

VALID_TOOLS = {"EXPORT", "VALIDATE"}
VALID_ENVIRONMENTS = {"TEST", "STAGE"}
REQUIRED_RECORD_KEYS = {"record_id", "tool", "record_count", "environment"}
ALLOWED_BODY_KEYS = {"operation", "records"}
ALLOWED_OPERATIONS = {"validate", "process"}
MAX_BODY_SIZE_BYTES = 65536  # 64 KiB


def validate_request_structure(body_bytes: bytes, body_data: Any) -> None:
    """
    Validates structural bounds before accepting any run.
    Raises HTTPException(400) for any structural violation.
    """
    # Check body size
    if len(body_bytes) > MAX_BODY_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="Request body exceeds 64 KiB limit")

    if not isinstance(body_data, dict):
        raise HTTPException(status_code=400, detail="Request body must be a JSON object")

    # Body keys must be exactly operation + records (no missing or extra fields like tenant_id)
    if set(body_data.keys()) != ALLOWED_BODY_KEYS:
        raise HTTPException(
            status_code=400,
            detail="Request body keys must be exactly 'operation' and 'records'",
        )

    # Operation must be validate or process
    op = body_data.get("operation")
    if op not in ALLOWED_OPERATIONS:
        raise HTTPException(
            status_code=400,
            detail="Operation must be 'validate' or 'process'",
        )

    # Records must be a list of 1 to 10 objects
    records = body_data.get("records")
    if not isinstance(records, list) or len(records) < 1 or len(records) > 10:
        raise HTTPException(
            status_code=400,
            detail="Records must be a list of 1 to 10 objects",
        )

    # Every record must have exactly the required keys
    for idx, row in enumerate(records, start=1):
        if not isinstance(row, dict):
            raise HTTPException(
                status_code=400,
                detail=f"Record at row {idx} must be a JSON object",
            )
        if set(row.keys()) != REQUIRED_RECORD_KEYS:
            raise HTTPException(
                status_code=400,
                detail=f"Record at row {idx} contains missing or extra keys",
            )


def validate_records(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Validates records against R1 to R4.
    Per row: trim strings, IDs case-sensitive.
    Report all failing rules per row, count each invalid row once.
    Returns:
      {
        "valid_rows": int,
        "invalid_rows": int,
        "issues": [{"row_index": int, "field": str, "rule_id": str}],
        "cleaned_rows": [...]
      }
    """
    issues = []
    seen_ids = set()
    invalid_row_indices = set()
    cleaned_rows = []

    for idx, row in enumerate(records, start=1):
        row_has_issue = False
        cleaned_row = dict(row)

        # R1: record_id nonempty string <= 20 chars, unique in batch (only LATER duplicates fail)
        raw_id = row.get("record_id")
        if not isinstance(raw_id, str):
            issues.append({"row_index": idx, "field": "record_id", "rule_id": "R1"})
            row_has_issue = True
        else:
            trimmed_id = raw_id.strip()
            cleaned_row["record_id"] = trimmed_id
            if len(trimmed_id) == 0 or len(trimmed_id) > 20:
                issues.append({"row_index": idx, "field": "record_id", "rule_id": "R1"})
                row_has_issue = True
            elif trimmed_id in seen_ids:
                # Duplicate ID: only later occurrences fail
                issues.append({"row_index": idx, "field": "record_id", "rule_id": "R1"})
                row_has_issue = True
            else:
                seen_ids.add(trimmed_id)

        # R2: tool in {EXPORT, VALIDATE}
        raw_tool = row.get("tool")
        if not isinstance(raw_tool, str):
            issues.append({"row_index": idx, "field": "tool", "rule_id": "R2"})
            row_has_issue = True
        else:
            trimmed_tool = raw_tool.strip()
            cleaned_row["tool"] = trimmed_tool
            if trimmed_tool not in VALID_TOOLS:
                issues.append({"row_index": idx, "field": "tool", "rule_id": "R2"})
                row_has_issue = True

        # R3: record_count is int (not bool, not numeric string) 1..1000
        raw_count = row.get("record_count")
        if isinstance(raw_count, bool) or not isinstance(raw_count, int):
            issues.append({"row_index": idx, "field": "record_count", "rule_id": "R3"})
            row_has_issue = True
        elif raw_count < 1 or raw_count > 1000:
            issues.append({"row_index": idx, "field": "record_count", "rule_id": "R3"})
            row_has_issue = True
        else:
            cleaned_row["record_count"] = raw_count

        # R4: environment in {TEST, STAGE}
        raw_env = row.get("environment")
        if not isinstance(raw_env, str):
            issues.append({"row_index": idx, "field": "environment", "rule_id": "R4"})
            row_has_issue = True
        else:
            trimmed_env = raw_env.strip()
            cleaned_row["environment"] = trimmed_env
            if trimmed_env not in VALID_ENVIRONMENTS:
                issues.append({"row_index": idx, "field": "environment", "rule_id": "R4"})
                row_has_issue = True

        if row_has_issue:
            invalid_row_indices.add(idx)
        else:
            cleaned_rows.append(cleaned_row)

    invalid_count = len(invalid_row_indices)
    valid_count = len(records) - invalid_count

    return {
        "valid_rows": valid_count,
        "invalid_rows": invalid_count,
        "issues": issues,
        "cleaned_rows": cleaned_rows,
    }
