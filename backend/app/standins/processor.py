# STAND-IN - replace with organizer version
"""
Supplied Pure Processing Helper Stand-in.
For UC-05: Automation Workload Preview.
Fixed teaching rule: 10 ms per record for either tool (EXPORT or VALIDATE).
Produces summary (input_rows, total_records, total_estimated_ms) and rows (record_id, estimated_ms).
Preserves row order.
"""
from typing import List, Dict, Any


def process_workload(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Pure processing function for UC-05 workload records.
    Input records must already be validated.
    """
    result_rows = []
    total_records = 0
    total_estimated_ms = 0

    for row in records:
        record_id = row["record_id"]
        record_count = int(row["record_count"])
        estimated_ms = record_count * 10

        result_rows.append({
            "record_id": record_id,
            "estimated_ms": estimated_ms,
        })
        total_records += record_count
        total_estimated_ms += estimated_ms

    summary = {
        "input_rows": len(records),
        "total_records": total_records,
        "total_estimated_ms": total_estimated_ms,
    }

    return {
        "summary": summary,
        "rows": result_rows,
        "issues": [],
    }
