from __future__ import annotations
from typing import Any, Dict, List

from entitlesim.workload.schemas import (
    ProcessResult,
    ProcessRowResult,
    ProcessSummary,
)

RATE_MS_PER_RECORD = 10


def process_workload_records(records: List[Dict[str, Any]]) -> ProcessResult:
    """UC-05 pure processing helper:
    Calculates 10 ms per record for either tool (EXPORT or VALIDATE).
    Preserves input row order.
    """
    total_records = 0
    total_estimated_ms = 0
    row_results: List[ProcessRowResult] = []

    for item in records:
        count = int(item["record_count"])
        est_ms = count * RATE_MS_PER_RECORD
        total_records += count
        total_estimated_ms += est_ms

        row_results.append(
            ProcessRowResult(
                record_id=str(item["record_id"]),
                tool=str(item["tool"]),
                record_count=count,
                environment=str(item["environment"]),
                estimated_ms=est_ms,
            )
        )

    summary = ProcessSummary(
        input_rows=len(records),
        total_records=total_records,
        total_estimated_ms=total_estimated_ms,
    )

    return ProcessResult(
        summary=summary,
        rows=row_results,
        issues=[],
    )
