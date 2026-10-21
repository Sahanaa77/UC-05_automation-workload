from __future__ import annotations
from datetime import datetime, timezone
import hashlib
import json
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from entitlesim.db import DailyUsageRecord, RunRecord, get_db
from entitlesim.workload.auth import TenantContext, get_tenant_context
from entitlesim.workload.processor import process_workload_records
from entitlesim.workload.quota import reserve_daily_quota
from entitlesim.workload.schemas import (
    RunCreateRequest,
    SubscriptionResponse,
    ToolMetadata,
    ToolsResponse,
    WorkloadRunResponse,
)
from entitlesim.workload.validation import validate_batch_bounds, validate_records

router = APIRouter(tags=["workload"])


@router.get("/tools", response_model=ToolsResponse)
def get_tools(tenant: TenantContext = Depends(get_tenant_context)):
    """GET /tools — returns available workload tools and metadata."""
    return ToolsResponse(
        tools=[
            ToolMetadata(
                name="EXPORT",
                description="Export automation job workload and estimate execution time",
                rate_ms_per_record=10,
            ),
            ToolMetadata(
                name="VALIDATE",
                description="Validate automation job request parameters against rules R1-R4",
                rate_ms_per_record=10,
            ),
        ]
    )


@router.get("/subscription", response_model=SubscriptionResponse)
def get_subscription(
    tenant: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """GET /subscription — returns tenant's plan, status, and daily quota usage."""
    today_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    usage = (
        db.query(DailyUsageRecord)
        .filter(
            DailyUsageRecord.tenant_id == tenant.tenant_id,
            DailyUsageRecord.utc_date == today_utc,
        )
        .first()
    )
    used_today = usage.count if usage else 0
    remaining = max(0, tenant.daily_quota - used_today)

    return SubscriptionResponse(
        tenant_id=tenant.tenant_id,
        plan=tenant.plan.capitalize(),
        status=tenant.status,
        daily_quota=tenant.daily_quota,
        used_today=used_today,
        remaining_quota=remaining,
    )


@router.post("/runs")
async def create_run(
    request: Request,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    x_test_force_failure: Optional[str] = Header(None, alias="X-Test-Force-Failure"),
    force_failure: bool = Query(False),
    tenant: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """POST /runs — Submits an automation workload request for validation or processing."""
    # 1. Enforce Idempotency-Key header requirement
    if not idempotency_key or not idempotency_key.strip():
        raise HTTPException(
            status_code=400,
            detail="Idempotency-Key header is required on POST /runs",
        )
    idempotency_key = idempotency_key.strip()

    # 2. Enforce Role and Subscription Status
    if not tenant.can_submit:
        raise HTTPException(
            status_code=403,
            detail="Viewer role cannot submit runs. Operator role required.",
        )
    if tenant.is_suspended:
        raise HTTPException(
            status_code=403,
            detail="Subscription is suspended. New submissions are blocked.",
        )

    # 3. Read raw payload bytes to verify size limit (<= 64 KiB)
    raw_body_bytes = await request.body()
    if len(raw_body_bytes) > 64 * 1024:
        raise HTTPException(
            status_code=400,
            detail=f"Payload exceeds maximum allowed size of 64 KiB ({len(raw_body_bytes)} bytes)",
        )

    # 4. Parse JSON and validate shape
    try:
        raw_json = json.loads(raw_body_bytes.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(raw_json, dict):
        raise HTTPException(status_code=400, detail="Request body must be a JSON object")

    # Reject attempts to pass tenant_id in body
    if "tenant_id" in raw_json:
        raise HTTPException(
            status_code=400,
            detail="Tenant identity must come from authenticated session, not request body",
        )

    try:
        run_req = RunCreateRequest(**raw_json)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid request shape: {str(e)}")

    # Verify batch bounds (1-10 rows)
    validate_batch_bounds(raw_body_bytes, run_req)

    # 5. Row validation R1–R4
    normalized_records, validation_summary = validate_records(run_req.records)

    # If operation is "process", any invalid row triggers immediate HTTP 400 without run or quota debit
    if run_req.operation == "process":
        if validation_summary.invalid_rows > 0:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Processing rejected due to invalid rows",
                    "valid_rows": validation_summary.valid_rows,
                    "invalid_rows": validation_summary.invalid_rows,
                    "issues": [i.model_dump() for i in validation_summary.issues],
                },
            )
        # Check plan entitlement: Basic does not allow process
        if not tenant.allows_processing:
            raise HTTPException(
                status_code=403,
                detail="Basic plan permits validation only. Pro plan required for workload processing.",
            )

    # 6. Compute canonical input fingerprint for idempotency
    canonical_payload = {
        "operation": run_req.operation,
        "records": normalized_records,
    }
    input_fingerprint = hashlib.sha256(
        json.dumps(canonical_payload, sort_keys=True).encode("utf-8")
    ).hexdigest()

    # 7. Check for existing run under (tenant_id, idempotency_key)
    existing_run = (
        db.query(RunRecord)
        .filter(
            RunRecord.tenant_id == tenant.tenant_id,
            RunRecord.idempotency_key == idempotency_key,
        )
        .first()
    )

    if existing_run:
        # Check if payload matches
        if existing_run.input_fingerprint != input_fingerprint:
            raise HTTPException(
                status_code=409,
                detail="Idempotency-Key reuse with changed input payload",
            )
        # Check if still running
        if existing_run.status == "Running":
            raise HTTPException(
                status_code=409,
                detail="RUN_IN_PROGRESS",
            )
        # Terminal replay: return existing run with HTTP 200 without debiting quota
        return JSONResponse(
            status_code=200,
            content={
                "run_id": str(existing_run.id),
                "status": existing_run.status,
                "operation": existing_run.operation,
                "result": existing_run.result,
                "error": existing_run.error,
                "created_at": existing_run.created_at.isoformat()
                if existing_run.created_at
                else None,
            },
        )

    # 8. Check and atomically reserve daily quota
    today_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    reserved = reserve_daily_quota(
        db=db,
        tenant_id=tenant.tenant_id,
        utc_date=today_utc,
        max_quota=tenant.daily_quota,
    )
    if not reserved:
        raise HTTPException(
            status_code=429,
            detail=f"Daily quota exceeded ({tenant.daily_quota}/{tenant.daily_quota} runs used for UTC day {today_utc})",
        )

    # 9. Persist run with initial status 'Running'
    run_id = str(uuid.uuid4())
    run_record = RunRecord(
        id=run_id,
        tenant_id=tenant.tenant_id,
        idempotency_key=idempotency_key,
        operation=run_req.operation,
        input_fingerprint=input_fingerprint,
        status="Running",
        created_at=datetime.now(timezone.utc),
    )
    try:
        db.add(run_record)
        db.commit()
    except IntegrityError:
        db.rollback()
        # Another concurrent request inserted the exact same (tenant_id, idempotency_key)
        existing = (
            db.query(RunRecord)
            .filter(
                RunRecord.tenant_id == tenant.tenant_id,
                RunRecord.idempotency_key == idempotency_key,
            )
            .first()
        )
        if existing:
            if existing.status == "Running":
                raise HTTPException(status_code=409, detail="RUN_IN_PROGRESS")
            return JSONResponse(
                status_code=200,
                content={
                    "run_id": str(existing.id),
                    "status": existing.status,
                    "operation": existing.operation,
                    "result": existing.result,
                    "error": existing.error,
                    "created_at": existing.created_at.isoformat()
                    if existing.created_at
                    else None,
                },
            )
        raise HTTPException(status_code=409, detail="Duplicate request in progress")

    # 10. Execute operation or injected failure
    should_fail = (
        x_test_force_failure == "1"
        or x_test_force_failure == "true"
        or force_failure
    )

    if should_fail:
        # A11 test hook: force processing failure after acceptance
        run_record.status = "Failed"
        run_record.error = "Simulated processing failure (forced by test hook)"
        run_record.result = None
        db.commit()

        return JSONResponse(
            status_code=201,
            content={
                "run_id": run_id,
                "status": "Failed",
                "operation": run_req.operation,
                "error": run_record.error,
                "result": None,
                "created_at": run_record.created_at.isoformat(),
            },
        )

    if run_req.operation == "validate":
        result_dict = validation_summary.model_dump()
        run_record.status = "Succeeded"
        run_record.result = result_dict
        run_record.error = None
        db.commit()

        return JSONResponse(
            status_code=201,
            content={
                "run_id": run_id,
                "status": "Succeeded",
                "operation": "validate",
                "result": result_dict,
                "error": None,
                "created_at": run_record.created_at.isoformat(),
            },
        )

    elif run_req.operation == "process":
        process_res = process_workload_records(normalized_records)
        result_dict = process_res.model_dump()
        run_record.status = "Succeeded"
        run_record.result = result_dict
        run_record.error = None
        db.commit()

        return JSONResponse(
            status_code=201,
            content={
                "run_id": run_id,
                "status": "Succeeded",
                "operation": "process",
                "result": result_dict,
                "error": None,
                "created_at": run_record.created_at.isoformat(),
            },
        )


@router.get("/runs", response_model=List[WorkloadRunResponse])
def list_runs(
    tenant: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """GET /runs — returns history of runs for the authenticated tenant only."""
    records = (
        db.query(RunRecord)
        .filter(
            RunRecord.tenant_id == tenant.tenant_id,
            RunRecord.operation.isnot(None),
        )
        .order_by(RunRecord.created_at.desc())
        .all()
    )

    return [
        WorkloadRunResponse(
            run_id=str(r.id),
            status=r.status,
            operation=r.operation or "validate",
            result=r.result,
            error=r.error,
            created_at=r.created_at.isoformat() if r.created_at else None,
        )
        for r in records
    ]


@router.get("/runs/{run_id}/result")
def get_run_result(
    run_id: str,
    tenant: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    """GET /runs/{id}/result — retrieves the result or recorded error for a run.
    Enforces tenant isolation: requests for other tenants' runs return HTTP 404.
    """
    record = db.query(RunRecord).filter(RunRecord.id == run_id).first()

    # Cross-tenant run access or unknown ID returns 404
    if not record or record.tenant_id != tenant.tenant_id:
        raise HTTPException(
            status_code=404,
            detail=f"Run '{run_id}' not found",
        )

    return {
        "run_id": str(record.id),
        "status": record.status,
        "operation": record.operation,
        "result": record.result,
        "error": record.error,
        "created_at": record.created_at.isoformat() if record.created_at else None,
    }
