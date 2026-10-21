from __future__ import annotations
import uuid
from sqlalchemy import update
from sqlalchemy.orm import Session

from entitlesim.db import DailyUsageRecord


def reserve_daily_quota(
    db: Session,
    tenant_id: str,
    utc_date: str,
    max_quota: int,
) -> bool:
    """Atomically checks and increments the daily quota counter for a tenant.
    Returns True if a slot was successfully reserved.
    Returns False if the daily quota has been exhausted.
    Safe under high concurrency in both SQLite and PostgreSQL.
    """
    # 1. Ensure daily usage row exists for (tenant_id, utc_date)
    existing = (
        db.query(DailyUsageRecord)
        .filter_by(tenant_id=tenant_id, utc_date=utc_date)
        .first()
    )
    if not existing:
        try:
            new_rec = DailyUsageRecord(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                utc_date=utc_date,
                count=0,
            )
            db.add(new_rec)
            db.commit()
        except Exception:
            db.rollback()

    # 2. Atomic conditional increment: only update if count < max_quota
    res = db.execute(
        update(DailyUsageRecord)
        .where(
            DailyUsageRecord.tenant_id == tenant_id,
            DailyUsageRecord.utc_date == utc_date,
            DailyUsageRecord.count < max_quota,
        )
        .values(count=DailyUsageRecord.count + 1)
    )
    db.commit()

    return res.rowcount > 0
