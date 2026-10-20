"""
Test harness for UC-05 SaaS.
Test-only, NOT exposed via API.
Provides test controls: reset_all, set_status, set_plan, force_failure flag.
"""
from app.db import SessionLocal, init_db
from app.db import SessionLocal, init_db
from app.models import RunModel, DailyUsageModel, SubscriptionModel
import app.standins.failure_hook as failure_hook
import app.hooks as hooks

# Global flag accessible directly as harness.force_failure
force_failure: bool = False


def set_force_failure(enabled: bool, message: str = "Injected processing failure after acceptance") -> None:
    """Toggle forced failure hook."""
    global force_failure
    force_failure = enabled
    failure_hook.set_forced_failure(enabled, message)
    hooks.set_force_failure(enabled, message)



def set_status(tenant: str, status: str) -> None:
    """Set subscription status ('Active' or 'Suspended') for tenant."""
    db = SessionLocal()
    try:
        sub = db.query(SubscriptionModel).filter_by(tenant_id=tenant).first()
        if not sub:
            sub = SubscriptionModel(tenant_id=tenant, plan="Basic", status=status)
            db.add(sub)
        else:
            sub.status = status
        db.commit()
    finally:
        db.close()


def set_plan(tenant: str, plan: str) -> None:
    """Set plan ('Basic' or 'Pro') for tenant."""
    db = SessionLocal()
    try:
        sub = db.query(SubscriptionModel).filter_by(tenant_id=tenant).first()
        if not sub:
            sub = SubscriptionModel(tenant_id=tenant, plan=plan, status="Active")
            db.add(sub)
        else:
            sub.plan = plan
        db.commit()
    finally:
        db.close()


def reset_all() -> None:
    """
    Resets database tables and test flags to initial state.
    Cleans runs, daily_usage, and resets seeded subscriptions.
    """
    global force_failure
    force_failure = False
    failure_hook.set_forced_failure(False)

    init_db()
    db = SessionLocal()
    try:
        db.query(RunModel).delete()
        db.query(DailyUsageModel).delete()

        # Reset seeded subscriptions
        db.query(SubscriptionModel).delete()
        db.add(SubscriptionModel(tenant_id="tenant-a", plan="Pro", status="Active"))
        db.add(SubscriptionModel(tenant_id="tenant-b", plan="Basic", status="Active"))
        db.commit()
    finally:
        db.close()
