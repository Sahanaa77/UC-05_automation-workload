from __future__ import annotations
from typing import Any, Dict, List, Set, Tuple
from fastapi import HTTPException

from entitlesim.workload.schemas import (
    RecordItem,
    RunCreateRequest,
    ValidationIssue,
    ValidationSummary,
)

MAX_PAYLOAD_BYTES = 64 * 1024  # 64 KiB
MIN_BATCH_ROWS = 1
MAX_BATCH_ROWS = 10


def validate_batch_bounds(raw_body_bytes: bytes, request: RunCreateRequest) -> None:
    """Validates batch size (1-10 rows) and payload size (<=64 KiB).
    Rejects violations with HTTP 400.
    """
    if len(raw_body_bytes) > MAX_PAYLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Payload exceeds maximum allowed size of 64 KiB ({len(raw_body_bytes)} bytes)",
        )

    if len(request.records) < MIN_BATCH_ROWS or len(request.records) > MAX_BATCH_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"Batch size must be between {MIN_BATCH_ROWS} and {MAX_BATCH_ROWS} rows (got {len(request.records)})",
        )


def validate_records(
    records: List[RecordItem],
) -> Tuple[List[Dict[str, Any]], ValidationSummary]:
    """Applies rules R1–R4 to every row:
    - R1: record_id is a non-empty string <= 20 chars, unique within batch (only later duplicates flagged).
    - R2: tool is EXPORT or VALIDATE.
    - R3: record_count is an integer 1..1000 (rejects booleans and strings).
    - R4: environment is TEST or STAGE.

    Strings are trimmed, IDs remain case-sensitive.
    Every applicable rule failure is reported; each invalid row is counted once.
    """
    seen_ids: Set[str] = set()
    normalized_records: List[Dict[str, Any]] = []
    issues: List[ValidationIssue] = []
    invalid_rows_count = 0

    for idx, item in enumerate(records, start=1):
        row_issues: List[ValidationIssue] = []
        raw_id = item.record_id
        raw_tool = item.tool
        raw_count = item.record_count
        raw_env = item.environment

        # Normalize strings if string type
        norm_id = raw_id.strip() if isinstance(raw_id, str) else raw_id
        norm_tool = raw_tool.strip() if isinstance(raw_tool, str) else raw_tool
        norm_env = raw_env.strip() if isinstance(raw_env, str) else raw_env
        norm_count = raw_count

        # Rule R1: record_id nonempty string <= 20 chars, unique within batch
        r1_failed = False
        if not isinstance(raw_id, str) or not norm_id or len(norm_id) > 20:
            row_issues.append(
                ValidationIssue(row_index=idx, field="record_id", rule_id="R1")
            )
            r1_failed = True
        else:
            # Check duplicate (case-sensitive)
            if norm_id in seen_ids:
                row_issues.append(
                    ValidationIssue(row_index=idx, field="record_id", rule_id="R1")
                )
                r1_failed = True
            else:
                seen_ids.add(norm_id)

        # Rule R2: tool is EXPORT or VALIDATE
        if not isinstance(raw_tool, str) or norm_tool not in ("EXPORT", "VALIDATE"):
            row_issues.append(
                ValidationIssue(row_index=idx, field="tool", rule_id="R2")
            )

        # Rule R3: record_count is integer 1..1000 (reject booleans & strings)
        if (
            isinstance(raw_count, bool)
            or not isinstance(raw_count, int)
            or raw_count < 1
            or raw_count > 1000
        ):
            row_issues.append(
                ValidationIssue(row_index=idx, field="record_count", rule_id="R3")
            )

        # Rule R4: environment is TEST or STAGE
        if not isinstance(raw_env, str) or norm_env not in ("TEST", "STAGE"):
            row_issues.append(
                ValidationIssue(row_index=idx, field="environment", rule_id="R4")
            )

        if row_issues:
            invalid_rows_count += 1
            issues.extend(row_issues)

        normalized_records.append(
            {
                "record_id": norm_id,
                "tool": norm_tool,
                "record_count": norm_count,
                "environment": norm_env,
            }
        )

    valid_rows_count = len(records) - invalid_rows_count
    summary = ValidationSummary(
        valid_rows=valid_rows_count,
        invalid_rows=invalid_rows_count,
        issues=issues,
    )
    return normalized_records, summary
