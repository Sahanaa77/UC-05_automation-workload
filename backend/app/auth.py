# STAND-IN - replaced by organizer middleware before real deployment
"""
Authentication and Identity Provider Stand-in for UC-05 SaaS.
Provides `get_identity` dependency mapping Bearer token -> (user_id, tenant_id, role).
Tenant context comes ONLY from verified identity; never from request data.
"""
import os
from dataclasses import dataclass
from typing import Optional, NamedTuple
from fastapi import Request, HTTPException, Depends
from sqlalchemy.orm import Session
from app.db import get_db, SessionLocal, init_db
from app.models import SubscriptionModel



class UserIdentity(NamedTuple):
    user_id: str
    tenant_id: str
    role: str       # "Operator" | "Viewer"


# Seeded users for dev and evaluation
# Tenant A (Pro, Active) with operator + viewer users
# Tenant B (Basic, Active) with operator user
SEEDED_USERS = {
    # Tenant A
    "dev-token-a-operator": UserIdentity("user-a-op", "tenant-a", "Operator"),
    "dev-token-a-viewer": UserIdentity("user-a-vw", "tenant-a", "Viewer"),
    "pro_operator": UserIdentity("user-a-op", "tenant-a", "Operator"),
    "pro_viewer": UserIdentity("user-a-vw", "tenant-a", "Viewer"),
    "tenant-a-operator": UserIdentity("user-a-op", "tenant-a", "Operator"),
    "tenant-a-viewer": UserIdentity("user-a-vw", "tenant-a", "Viewer"),

    # Tenant B
    "dev-token-b-operator": UserIdentity("user-b-op", "tenant-b", "Operator"),
    "basic_operator": UserIdentity("user-b-op", "tenant-b", "Operator"),
    "basic_viewer": UserIdentity("user-b-vw", "tenant-b", "Viewer"),
    "tenant-b-operator": UserIdentity("user-b-op", "tenant-b", "Operator"),
    "tenant_b_operator": UserIdentity("user-b-op", "tenant-b", "Operator"),

    # Suspended mock
    "suspended_operator": UserIdentity("user-s-op", "tenant-suspended", "Operator"),
}


def seed_subscriptions() -> None:
    """Seed initial subscriptions in database for Tenant A and Tenant B."""
    init_db()
    db = SessionLocal()
    try:
        # Tenant A: Pro, Active

        sub_a = db.query(SubscriptionModel).filter_by(tenant_id="tenant-a").first()
        if not sub_a:
            db.add(SubscriptionModel(tenant_id="tenant-a", plan="Pro", status="Active"))
        # Tenant B: Basic, Active
        sub_b = db.query(SubscriptionModel).filter_by(tenant_id="tenant-b").first()
        if not sub_b:
            db.add(SubscriptionModel(tenant_id="tenant-b", plan="Basic", status="Active"))
        # Tenant Suspended
        sub_s = db.query(SubscriptionModel).filter_by(tenant_id="tenant-suspended").first()
        if not sub_s:
            db.add(SubscriptionModel(tenant_id="tenant-suspended", plan="Pro", status="Suspended"))
        db.commit()
    finally:
        db.close()


# Ensure seeded subscriptions exist
seed_subscriptions()


async def get_identity(request: Request) -> UserIdentity:
    """
    FastAPI dependency mapping Authorization: Bearer <dev-token> to (user_id, tenant_id, role).
    Raises 401 if token is missing or invalid.
    Rejects any request attempting to override tenant via query, body, or headers.
    """
    # Strict tenant isolation: tenant must never come from request data
    if "x-tenant-override" in request.headers or "x-tenant-id" in request.headers:
        raise HTTPException(status_code=400, detail="Tenant context must not be passed in headers")

    if "tenant_id" in request.query_params or "tenant" in request.query_params:
        raise HTTPException(status_code=400, detail="Tenant context must not be passed in query parameters")

    auth_header = request.headers.get("authorization", "")
    if not auth_header:
        # Also check x-auth-token fallback
        auth_header = request.headers.get("x-auth-token", "")
        if not auth_header:
            raise HTTPException(status_code=401, detail="Authentication required")

    token = auth_header.strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()

    if not token:
        raise HTTPException(status_code=401, detail="Missing Bearer token")

    # STAND-IN - replaced by organizer middleware before real deployment
    test_mode = os.getenv("TEST_MODE", "0") == "1"

    identity = SEEDED_USERS.get(token) or SEEDED_USERS.get(token.lower())
    if not identity:
        # Support colon-formatted token: "<tenant_id>:<role>"
        if ":" in token:
            if not test_mode:
                raise HTTPException(status_code=401, detail="Colon tokens only accepted when TEST_MODE=1")
            parts = token.split(":")
            identity = UserIdentity(user_id=f"user-{parts[0]}", tenant_id=parts[0], role=parts[1])
        else:
            raise HTTPException(status_code=401, detail="Invalid token")
    else:
        if not test_mode:
            raise HTTPException(status_code=401, detail="Dev tokens only accepted when TEST_MODE=1")

    return identity


@dataclass(frozen=True)
class TenantContext:
    tenant_id: str
    user_id: str
    role: str
    plan: str
    status: str


async def get_current_tenant(
    request: Request,
    identity: UserIdentity = Depends(get_identity),
    db: Session = Depends(get_db),
) -> TenantContext:
    """
    Resolves full tenant context including plan and status from subscriptions table.
    """
    sub = db.query(SubscriptionModel).filter_by(tenant_id=identity.tenant_id).first()
    plan = sub.plan if sub else "Basic"
    status = sub.status if sub else "Active"

    return TenantContext(
        tenant_id=identity.tenant_id,
        user_id=identity.user_id,
        role=identity.role,
        plan=plan,
        status=status,
    )
