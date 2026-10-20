"""
Quota and Entitlement Manager for UC-05 SaaS.
Enforces daily allowances per UTC day:
- Basic: validate only, 3 accepted runs per UTC day.
- Pro: validate and process, 10 accepted runs per UTC day.
Atomic reservation for concurrency safety.
"""
from datetime import datetime, timezone, date
import threading
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.models import DailyUsageModel

PLAN_QUOTAS = {
    "Basic": 3,
    "Pro": 10,
}

_QUOTA_LOCK = threading.Lock()


def get_plan_daily_quota(plan: str) -> int:
    return PLAN_QUOTAS.get(plan, 3)


def get_daily_usage(db: Session, tenant_id: str, usage_date: date) -> int:
    """Returns today's used quota count for the tenant."""
    row = db.execute(
        select(DailyUsageModel).where(
            DailyUsageModel.tenant_id == tenant_id,
            DailyUsageModel.usage_date == usage_date,
        )
    ).scalar_one_or_none()
    return row.count if row else 0


def try_reserve_quota_slot(db: Session, tenant_id: str, plan: str) -> bool:
    """
    Atomically reserves a quota slot for today (UTC).
    Returns True if slot was reserved successfully, False if quota is exhausted.
    """
    max_quota = get_plan_daily_quota(plan)
    today = datetime.now(timezone.utc).date()

    with _QUOTA_LOCK:
        usage = db.execute(
            select(DailyUsageModel).where(
                DailyUsageModel.tenant_id == tenant_id,
                DailyUsageModel.usage_date == today,
            )
        ).scalar_one_or_none()

        if usage is None:
            if max_quota <= 0:
                return False
            new_usage = DailyUsageModel(
                tenant_id=tenant_id,
                usage_date=today,
                count=1,
            )
            db.add(new_usage)
            db.commit()
            return True
        else:
            if usage.count >= max_quota:
                return False
            usage.count += 1
            db.commit()
            return True


def reset_daily_usage_for_test(db: Session, tenant_id: str) -> None:
    """Helper for test harness resets."""
    with _QUOTA_LOCK:
        today = datetime.now(timezone.utc).date()
        usage = db.execute(
            select(DailyUsageModel).where(
                DailyUsageModel.tenant_id == tenant_id,
                DailyUsageModel.usage_date == today,
            )
        ).scalar_one_or_none()
        if usage:
            usage.count = 0
            db.commit()
