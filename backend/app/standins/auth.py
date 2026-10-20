# STAND-IN - replaced by organizer middleware before real deployment
"""
Authentication and Identity Provider Stand-in.
Extracts verified tenant context and role strictly from the authentication credentials.
Tenant context comes ONLY from the verified session. Never accept tenant identity from request data.
"""
import os
from dataclasses import dataclass
from typing import Optional, Dict
import json
from fastapi import Request, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class TenantContext:
    tenant_id: str
    user_id: str
    role: str       # "Operator" | "Viewer"
    plan: str       # "Basic" | "Pro"
    status: str     # "Active" | "Suspended"


# Seeded demo / test accounts
MOCK_ACCOUNTS: Dict[str, TenantContext] = {
    # Default active Pro Operator
    "pro_operator": TenantContext("tenant-a", "user-a-op", "Operator", "Pro", "Active"),
    "pro_viewer": TenantContext("tenant-a", "user-a-vw", "Viewer", "Pro", "Active"),
    "basic_operator": TenantContext("tenant-basic", "user-b-op", "Operator", "Basic", "Active"),
    "basic_viewer": TenantContext("tenant-basic", "user-b-vw", "Viewer", "Basic", "Active"),
    "tenant_b_operator": TenantContext("tenant-b", "user-b1-op", "Operator", "Pro", "Active"),
    "tenant_b_viewer": TenantContext("tenant-b", "user-b1-vw", "Viewer", "Pro", "Active"),
    "suspended_operator": TenantContext("tenant-suspended", "user-s-op", "Operator", "Pro", "Suspended"),
}


# In-memory dynamic overrides for harness subscription suspension/activation
TENANT_SUBSCRIPTION_OVERRIDES: Dict[str, str] = {}


def set_tenant_subscription_status(tenant_id: str, status: str) -> None:
    """Allow test harness to suspend/activate subscriptions."""
    TENANT_SUBSCRIPTION_OVERRIDES[tenant_id] = status


def reset_auth_state() -> None:
    TENANT_SUBSCRIPTION_OVERRIDES.clear()


async def get_current_tenant(
    request: Request,
    auth: Optional[HTTPAuthorizationCredentials] = Security(security_scheme),
) -> TenantContext:
    """
    FastAPI dependency to extract verified tenant context.
    Raises 401 if authentication is missing or invalid.
    Rejects any request attempting to provide tenant override in query/headers/body.
    """
    # Reject forbidden tenant override attempts
    if "x-tenant-override" in request.headers or "x-tenant-id" in request.headers:
        raise HTTPException(status_code=400, detail="Explicit tenant override is forbidden")

    query_params = request.query_params
    if "tenant_id" in query_params or "tenant" in query_params:
        raise HTTPException(status_code=400, detail="Tenant context must not be passed in request data")

    token: Optional[str] = None
    if auth and auth.credentials:
        token = auth.credentials.strip()
    elif "authorization" in request.headers:
        raw_header = request.headers["authorization"].strip()
        if raw_header.lower().startswith("bearer "):
            token = raw_header[7:].strip()
        else:
            token = raw_header
    elif "x-auth-token" in request.headers:
        token = request.headers["x-auth-token"].strip()

    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    # STAND-IN - replaced by organizer middleware before real deployment
    test_mode = os.getenv("TEST_MODE", "0") == "1"

    # Check direct mock tokens
    matched_ctx: Optional[TenantContext] = None
    token_lower = token.lower()

    if token_lower in MOCK_ACCOUNTS:
        if not test_mode:
            raise HTTPException(status_code=401, detail="Dev tokens only accepted when TEST_MODE=1")
        matched_ctx = MOCK_ACCOUNTS[token_lower]
    elif token.startswith("{") and token.endswith("}"):
        if not test_mode:
            raise HTTPException(status_code=401, detail="Tokens only accepted when TEST_MODE=1")
        try:
            data = json.loads(token)
            matched_ctx = TenantContext(
                tenant_id=data.get("tenant_id", "tenant-a"),
                user_id=data.get("user_id", "user-1"),
                role=data.get("role", "Operator"),
                plan=data.get("plan", "Pro"),
                status=data.get("status", "Active"),
            )
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid token payload")
    else:
        # Heuristic matching for token naming in test harnesses (e.g., "tenant-b:Operator:Pro" or "tenant:role")
        parts = token.split(":")
        if len(parts) >= 2:
            if not test_mode:
                raise HTTPException(status_code=401, detail="Colon tokens only accepted when TEST_MODE=1")
            matched_ctx = TenantContext(
                tenant_id=parts[0],
                user_id=f"user-{parts[0]}",
                role=parts[1],
                plan=parts[2] if len(parts) >= 3 else "Pro",
                status=parts[3] if len(parts) >= 4 else "Active",
            )
        elif token == "default" or token == "test-token":
            if not test_mode:
                raise HTTPException(status_code=401, detail="Dev tokens only accepted when TEST_MODE=1")
            matched_ctx = MOCK_ACCOUNTS["pro_operator"]
        else:
            raise HTTPException(status_code=401, detail="Invalid credentials")

    # Check dynamic subscription override (e.g. A10 harness suspends subscription)
    current_status = TENANT_SUBSCRIPTION_OVERRIDES.get(matched_ctx.tenant_id, matched_ctx.status)
    if current_status != matched_ctx.status:
        return TenantContext(
            tenant_id=matched_ctx.tenant_id,
            user_id=matched_ctx.user_id,
            role=matched_ctx.role,
            plan=matched_ctx.plan,
            status=current_status,
        )

    return matched_ctx
