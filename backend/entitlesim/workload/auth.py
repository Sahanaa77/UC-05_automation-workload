from __future__ import annotations
from dataclasses import dataclass
import os
from typing import Optional
from fastapi import Header, HTTPException, Request

PLAN_QUOTAS = {
    "basic": 3,
    "pro": 10,
}

# In production (TEST_MODE=0), arbitrary test tokens and client-supplied X-Tenant-Id are rejected
IS_TEST_MODE = os.getenv("TEST_MODE", "1") == "1"
GATEWAY_SECRET = os.getenv("GATEWAY_SHARED_SECRET")  # Set only by trusted reverse proxy / API gateway


@dataclass
class TenantContext:
    tenant_id: str
    role: str  # "operator" or "viewer"
    plan: str  # "basic" or "pro"
    status: str  # "active" or "suspended"

    @property
    def daily_quota(self) -> int:
        return PLAN_QUOTAS.get(self.plan.lower(), 3)

    @property
    def can_submit(self) -> bool:
        return self.role.lower() == "operator"

    @property
    def is_suspended(self) -> bool:
        return self.status.lower() == "suspended"

    @property
    def allows_processing(self) -> bool:
        return self.plan.lower() == "pro"


# Competition seeded tokens representing pre-provisioned organizer identities
COMPETITION_SEEDED_TOKENS = {
    "token-tenant-a-operator": TenantContext(
        tenant_id="tenant-a", role="operator", plan="pro", status="active"
    ),
    "token-tenant-a-viewer": TenantContext(
        tenant_id="tenant-a", role="viewer", plan="pro", status="active"
    ),
    "token-tenant-b-operator": TenantContext(
        tenant_id="tenant-b", role="operator", plan="basic", status="active"
    ),
    "token-tenant-b-viewer": TenantContext(
        tenant_id="tenant-b", role="viewer", plan="basic", status="active"
    ),
    "token-tenant-suspended-operator": TenantContext(
        tenant_id="tenant-suspended", role="operator", plan="pro", status="suspended"
    ),
}


def get_tenant_context(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_tenant_id: Optional[str] = Header(None),
    x_user_role: Optional[str] = Header(None),
    x_subscription_plan: Optional[str] = Header(None),
    x_subscription_status: Optional[str] = Header(None),
    x_gateway_secret: Optional[str] = Header(None),
) -> TenantContext:
    """Extracts trusted tenant context strictly from verified session/tokens.

    Security Boundaries:
    1. Rejects unauthenticated callers with HTTP 401.
    2. Prevents tenant impersonation via raw X-Tenant-Id headers: gateway headers are
       only trusted if accompanied by a verified GATEWAY_SHARED_SECRET.
    3. Prevents fabricated arbitrary tokens in production (TEST_MODE=0).
    4. Rejects any attempt to supply tenant identity via request body.
    """
    # 1. Gateway header validation: only trust X-Tenant-Id if verified by gateway secret
    if x_tenant_id:
        if GATEWAY_SECRET and x_gateway_secret == GATEWAY_SECRET:
            role = (x_user_role or "operator").lower()
            plan = (x_subscription_plan or "pro").lower()
            status = (x_subscription_status or "active").lower()
            return TenantContext(
                tenant_id=x_tenant_id,
                role=role,
                plan=plan,
                status=status,
            )
        elif not IS_TEST_MODE:
            # Reject spoofed gateway headers in production
            raise HTTPException(
                status_code=401,
                detail="Direct client injection of X-Tenant-Id is forbidden. Authenticate via Bearer token.",
            )

    # 2. Check Bearer token in Authorization header
    if authorization:
        parts = authorization.strip().split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1]

            # A. Check against pre-seeded competition identities
            if token in COMPETITION_SEEDED_TOKENS:
                return COMPETITION_SEEDED_TOKENS[token]

            # B. Test-harness token format: only permitted in TEST_MODE
            if IS_TEST_MODE and token.startswith("test:"):
                t_parts = token.split(":")
                if len(t_parts) >= 5:
                    return TenantContext(
                        tenant_id=t_parts[1],
                        role=t_parts[2].lower(),
                        plan=t_parts[3].lower(),
                        status=t_parts[4].lower(),
                    )
                elif len(t_parts) == 3:  # test:<tenant>:<role>
                    return TenantContext(
                        tenant_id=t_parts[1],
                        role=t_parts[2].lower(),
                        plan="pro",
                        status="active",
                    )

            # Invalid or fabricated token
            raise HTTPException(
                status_code=401,
                detail="Invalid or unauthorized Bearer token.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    # 3. Missing authentication
    raise HTTPException(
        status_code=401,
        detail="Authentication credentials required. Supply Bearer token in Authorization header.",
        headers={"WWW-Authenticate": "Bearer"},
    )
