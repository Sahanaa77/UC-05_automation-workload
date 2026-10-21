import os
from pathlib import Path
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import hashlib
import json
import uuid
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Header, Request, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import select, update, text
from sqlalchemy.exc import IntegrityError

from app.db import init_db, get_db, engine, SessionLocal, DATABASE_URL
from app.models import RunModel, DailyUsageModel, SubscriptionModel

from app.schemas import (
    RunRequestSchema,
    RunResponse,
    SubscriptionResponse,
    ToolsResponse,
    ToolItem,
)
from app.auth import (
    TenantContext,
    get_current_tenant,
)
from app.processor import process
from app.hooks import check_failure_hook, set_force_failure
from app.validation import validate_records, validate_request_structure

from app.quota import (
    get_plan_daily_quota,
    get_daily_usage,
)
import app.blob_store as blob_store
import logging

logger = logging.getLogger("workloadlens.main")

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

# Read configuration from environment variables
# DATABASE_URL imported from app.db
TEST_MODE = os.getenv("TEST_MODE", "0")
BLOB_ACCOUNT_URL = os.getenv("BLOB_ACCOUNT_URL", "")
BLOB_CONTAINER = os.getenv("BLOB_CONTAINER", "")


INLINE_DDL_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS subscriptions (
        tenant_id VARCHAR(64) PRIMARY KEY,
        plan VARCHAR(16) NOT NULL,
        status VARCHAR(16) NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS DailyUsage (
        tenant_id VARCHAR(64) NOT NULL,
        usage_date DATE NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT pk_tenant_DailyUsage PRIMARY KEY (tenant_id, usage_date)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS Runs (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL,
        idempotency_key VARCHAR(128) NOT NULL,
        operation VARCHAR(16) NOT NULL,
        input_fingerprint VARCHAR(64) NOT NULL,
        status VARCHAR(16) NOT NULL,
        result_json TEXT,
        error TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        finished_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT uq_Runs_tenant_idempotency_key UNIQUE (tenant_id, idempotency_key)
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_Runs_tenant_created ON Runs(tenant_id, created_at DESC)",
]


def find_migration_file(filename: str = "001_runs_dailyusage.sql") -> Optional[Path]:
    """Locate migration file relative to the app (works locally and in container at /app/migrations)."""
    candidates = [
        # In container: /app/migrations/
        Path(__file__).resolve().parent.parent / "migrations" / filename,
        # Locally from backend/app/main.py: ../../migrations/
        Path(__file__).resolve().parent.parent.parent / "migrations" / filename,
        # Direct container path
        Path("/app/migrations") / filename,
        # Current working directory or parent
        Path.cwd() / "migrations" / filename,
        Path.cwd().parent / "migrations" / filename,
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def run_migrations() -> None:
    """
    Run idempotent SQL migrations.
    Executes migrations/001_runs_dailyusage.sql statement by statement as the single source of truth.
    """
    init_db()
    migration_path = find_migration_file("001_runs_dailyusage.sql")
    if migration_path and migration_path.is_file():
        content = migration_path.read_text(encoding="utf-8")
        clean_lines = [line for line in content.splitlines() if not line.strip().startswith("--")]
        clean_sql = "\n".join(clean_lines)
        statements = [stmt.strip() for stmt in clean_sql.split(";") if stmt.strip()]
    else:
        statements = INLINE_DDL_STATEMENTS

    with engine.connect() as conn:
        for stmt in statements:
            try:
                conn.execute(text(stmt))
            except Exception:
                pass
        conn.commit()


def seed_test_subscriptions() -> None:
    """Seed initial subscriptions in database only when TEST_MODE=1."""
    db = SessionLocal()
    try:
        sub_a = db.query(SubscriptionModel).filter_by(tenant_id="tenant-a").first()
        if not sub_a:
            db.add(SubscriptionModel(tenant_id="tenant-a", plan="Pro", status="Active"))
        sub_b = db.query(SubscriptionModel).filter_by(tenant_id="tenant-b").first()
        if not sub_b:
            db.add(SubscriptionModel(tenant_id="tenant-b", plan="Basic", status="Active"))
        sub_s = db.query(SubscriptionModel).filter_by(tenant_id="tenant-suspended").first()
        if not sub_s:
            db.add(SubscriptionModel(tenant_id="tenant-suspended", plan="Pro", status="Suspended"))
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # On startup: run idempotent SQL migration and seed only when TEST_MODE=1
    run_migrations()
    if os.getenv("TEST_MODE", "0") == "1":
        seed_test_subscriptions()
    yield


app = FastAPI(
    title="WorkloadLens",
    description="Automation workload preview SaaS",
    version="1.0.0",
    docs_url="/docs",
    redoc_url=None,
    lifespan=lifespan,
)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Spec mandates: Reject missing/extra fields and wrong shapes with 400 before acceptance."""
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": "Invalid request payload format", "errors": exc.errors()},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def compute_input_fingerprint(operation: str, records: List[Dict[str, Any]]) -> str:
    """Computes a deterministic SHA-256 fingerprint for input body."""
    payload = {
        "operation": operation,
        "records": records,
    }
    canonical_bytes = json.dumps(payload, sort_keys=True).encode("utf-8")
    return hashlib.sha256(canonical_bytes).hexdigest()


router = APIRouter()


# --------------------------------------------------------------------------
# Route 1: GET /health (Public)
# --------------------------------------------------------------------------
@router.get("/health", tags=["Health"])
def health():
    """Public health check route. Reveals no tenant data."""
    return {"status": "ok"}


# --------------------------------------------------------------------------
# Route 2: GET /tools (Authenticated)
# --------------------------------------------------------------------------
@router.get("/tools", response_model=ToolsResponse, tags=["Tools"])
def get_tools(tenant: TenantContext = Depends(get_current_tenant)):
    """Lists available automation tools and allowed operations for tenant."""
    allowed_ops = ["validate"]
    if tenant.plan == "Pro":
        allowed_ops.append("process")

    return ToolsResponse(
        tools=[
            ToolItem(
                name="EXPORT",
                description="Automation export workload generator",
                environments=["TEST", "STAGE"],
            ),
            ToolItem(
                name="VALIDATE",
                description="Automation validation and verification suite",
                environments=["TEST", "STAGE"],
            ),
        ],
        allowed_operations=allowed_ops,
        rate_ms_per_record=10,
    )


# --------------------------------------------------------------------------
# Route 3: GET /subscription (Authenticated)
# --------------------------------------------------------------------------
@router.get("/subscription", response_model=SubscriptionResponse, tags=["SaaS"])
def get_subscription(
    tenant: TenantContext = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    """Returns subscription details, plan, and daily quota usage."""
    today = datetime.now(timezone.utc).date()
    daily_quota = get_plan_daily_quota(tenant.plan)
    used_today = get_daily_usage(db, tenant.tenant_id, today)
    remaining = max(0, daily_quota - used_today)

    return SubscriptionResponse(
        tenant_id=tenant.tenant_id,
        plan=tenant.plan,
        status=tenant.status,
        daily_limit=daily_quota,
        daily_quota=daily_quota,
        used_today=used_today,
        remaining=remaining,
        remaining_quota=remaining,
    )



# --------------------------------------------------------------------------
# Route 4: POST /runs (Authenticated Operator only)
# --------------------------------------------------------------------------
@router.post("/runs", status_code=status.HTTP_201_CREATED, tags=["Runs"])
async def create_run(
    request: Request,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    tenant: TenantContext = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    """
    POST /runs executed in exact required order:
    1) 401 if unauthenticated (enforced via get_current_tenant).
    2) 403 if role is Viewer, or subscription suspended, or plan Basic with operation=process.
    3) 400 for bad structure / missing Idempotency-Key.
    4) For process with any invalid row: 400, no run, no quota.
    5) Compute fingerprint of operation+records. If a run exists for (tenant, key):
       same fingerprint and terminal -> return it with 200, no debit;
       same fingerprint and Running -> 409 code RUN_IN_PROGRESS;
       different fingerprint -> 409.
    6) New run: in ONE transaction insert the Running row and atomically reserve quota
       with conditional UPDATE DailyUsage SET count=count+1 WHERE tenant_id=? AND usage_date=? AND count<limit
       (insert the row first if missing). If 0 rows updated, roll back and return 429.
       Limits: Basic 3, Pro 10, per tenant per UTC day.
    7) Commit, run validate or process, save the result, status Succeeded, return 201 {run_id, status}.
    8) If processing raises or the test failure hook is on, set Failed with the error recorded;
       quota stays used; a replay returns that same failure without re-executing.
    """
    body_bytes = await request.body()
    try:
        body_json = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
    except Exception:
        body_json = None

    # Step 2: 403 checks
    if tenant.role == "Viewer":
        raise HTTPException(status_code=403, detail="Viewer role cannot submit runs")

    if tenant.status != "Active":
        raise HTTPException(status_code=403, detail="Subscription is suspended")

    raw_op = body_json.get("operation") if isinstance(body_json, dict) else None
    if raw_op == "process" and tenant.plan == "Basic":
        raise HTTPException(status_code=403, detail="Basic plan cannot submit process operations")

    # Step 3: 400 for bad structure / missing Idempotency-Key
    if not idempotency_key or not idempotency_key.strip():
        raise HTTPException(status_code=400, detail="Idempotency-Key header is required")
    idempotency_key = idempotency_key.strip()

    validate_request_structure(body_bytes, body_json)
    operation = body_json["operation"]
    records = body_json["records"]

    # Step 4: For process with any invalid row: 400, no run, no quota
    val_res = validate_records(records)
    valid_count = val_res["valid_rows"]
    invalid_count = val_res["invalid_rows"]
    issues = val_res["issues"]
    cleaned_records = val_res.get("cleaned_rows", records)

    if operation == "process" and invalid_count > 0:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Process operation rejects invalid input rows",
                "valid_rows": valid_count,
                "invalid_rows": invalid_count,
                "issues": issues,
            },
        )

    # Step 5: Compute fingerprint of operation+records
    fingerprint = compute_input_fingerprint(operation, records)

    def handle_replay(existing: RunModel):
        if existing.input_fingerprint != fingerprint:
            raise HTTPException(status_code=409, detail="Idempotency key reuse with different input payload")
        if existing.status == "Running":
            import time
            for _ in range(50):
                time.sleep(0.02)
                try:
                    db.expire(existing)
                    db.refresh(existing)
                    if existing.status != "Running":
                        break
                except Exception:
                    break
            if existing.status == "Running":
                raise HTTPException(status_code=409, detail="RUN_IN_PROGRESS")
        return JSONResponse(status_code=200, content=existing.to_dict())

    existing_run = db.execute(
        select(RunModel).where(
            RunModel.tenant_id == tenant.tenant_id,
            RunModel.idempotency_key == idempotency_key,
        )
    ).scalar_one_or_none()

    if existing_run:
        return handle_replay(existing_run)

    # Step 6: New run in ONE transaction with atomic conditional quota reservation
    run_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    today = now.date()
    limit = 3 if tenant.plan == "Basic" else 10

    new_run = RunModel(
        id=run_id,
        tenant_id=tenant.tenant_id,
        idempotency_key=idempotency_key,
        operation=operation,
        input_fingerprint=fingerprint,
        status="Running",
        result_json=None,
        error=None,
        created_at=now,
        finished_at=None,
    )

    try:
        db.add(new_run)

        # Ensure daily_usage row exists
        usage_row = db.query(DailyUsageModel).filter_by(
            tenant_id=tenant.tenant_id, usage_date=today
        ).first()
        if not usage_row:
            usage_row = DailyUsageModel(
                tenant_id=tenant.tenant_id, usage_date=today, count=0
            )
            db.add(usage_row)
            db.flush()

        # Conditional atomic increment
        res = db.execute(
            update(DailyUsageModel)
            .where(
                DailyUsageModel.tenant_id == tenant.tenant_id,
                DailyUsageModel.usage_date == today,
                DailyUsageModel.count < limit,
            )
            .values(count=DailyUsageModel.count + 1)
        )
        if res.rowcount == 0:
            db.rollback()
            raise HTTPException(status_code=429, detail="Daily quota exhausted for tenant")

        # Step 7: Commit transaction
        db.commit()

    except IntegrityError:
        db.rollback()
        existing = db.execute(
            select(RunModel).where(
                RunModel.tenant_id == tenant.tenant_id,
                RunModel.idempotency_key == idempotency_key,
            )
        ).scalar_one_or_none()
        if existing:
            return handle_replay(existing)
        raise HTTPException(status_code=409, detail="Concurrent run conflict")

    # Step 8: Execution & failure hook check
    force_err = check_failure_hook(request)
    if force_err:
        new_run.status = "Failed"
        new_run.error = force_err
        new_run.finished_at = datetime.now(timezone.utc)
        db.commit()
        return new_run.to_dict()

    if operation == "validate":
        validation_output = {
            "valid_rows": valid_count,
            "invalid_rows": invalid_count,
            "issues": issues,
        }
        new_run.status = "Succeeded"
        new_run.result_json = json.dumps(validation_output)
        new_run.finished_at = datetime.now(timezone.utc)
        db.commit()
        try:
            blob_store.put_result(new_run.tenant_id, new_run.id, new_run.result_json)
        except Exception as e:
            logger.warning("Blob upload failed (non-fatal): %s", type(e).__name__)
        return new_run.to_dict()

    elif operation == "process":
        try:
            proc_out = process(cleaned_records)
            new_run.status = "Succeeded"
            new_run.result_json = json.dumps(proc_out)
            new_run.finished_at = datetime.now(timezone.utc)
            db.commit()
            try:
                blob_store.put_result(new_run.tenant_id, new_run.id, new_run.result_json)
            except Exception as e:
                logger.warning("Blob upload failed (non-fatal): %s", type(e).__name__)
            return new_run.to_dict()
        except Exception as e:
            new_run.status = "Failed"
            new_run.error = str(e)
            new_run.finished_at = datetime.now(timezone.utc)
            db.commit()
            return new_run.to_dict()





# --------------------------------------------------------------------------
# Route 5: GET /runs (Authenticated)
# --------------------------------------------------------------------------
@router.get("/runs", tags=["Runs"])
def list_runs(
    tenant: TenantContext = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    """Lists runs for the authenticated tenant only."""
    runs = db.execute(
        select(RunModel)
        .where(RunModel.tenant_id == tenant.tenant_id)
        .order_by(RunModel.created_at.desc())
    ).scalars().all()

    return [r.to_dict() for r in runs]


# --------------------------------------------------------------------------
# Route 6: GET /runs/{id}/result (Authenticated)
# --------------------------------------------------------------------------
@router.get("/runs/{run_id}/result", tags=["Runs"])
def get_run_result(
    run_id: str,
    tenant: TenantContext = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    """
    Returns the result or recorded error for a run.
    Enforces tenant authorization: returns 404 for unknown or other tenant's run ID.
    """
    run = db.execute(
        select(RunModel).where(
            RunModel.id == run_id,
            RunModel.tenant_id == tenant.tenant_id,
        )
    ).scalar_one_or_none()

    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    parsed_result = None
    if run.result_json:
        try:
            parsed_result = json.loads(run.result_json)
        except Exception:
            parsed_result = run.result_json

    out = {
        "run_id": run.id,
        "status": run.status,
    }
    if run.status == "Failed":
        out["error"] = run.error
    else:
        out["result"] = parsed_result

    return out



app.include_router(router)
app.include_router(router, prefix="/api")

# Serve frontend static build if present (AFTER all routers)
from fastapi.staticfiles import StaticFiles

static_candidates = [
    os.path.join(os.getcwd(), "static"),
    os.path.join(os.getcwd(), "..", "static"),
    os.path.join(os.getcwd(), "frontend", "dist"),
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "frontend", "dist"),
]
for candidate in static_candidates:
    if os.path.isdir(candidate):
        app.mount("/", StaticFiles(directory=candidate, html=True), name="static")
        break

