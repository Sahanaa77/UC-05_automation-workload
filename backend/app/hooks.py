# STAND-IN - replace with organizer version
"""
Failure hook stand-in for UC-05 SaaS.
Only active when TEST_MODE=1.
"""
import os
from typing import Optional
from fastapi import Request

_FORCE_FAILURE: bool = False
_FAILURE_MESSAGE: str = "Injected processing failure after acceptance"


def set_force_failure(enabled: bool, message: str = "Injected processing failure after acceptance") -> None:
    """Set failure hook flag for test harness."""
    global _FORCE_FAILURE, _FAILURE_MESSAGE
    _FORCE_FAILURE = enabled
    _FAILURE_MESSAGE = message


def check_failure_hook(request: Optional[Request] = None) -> Optional[str]:
    """
    Failure hook called after run acceptance.
    Only active when TEST_MODE=1.
    Returns error string if failure is triggered, else None.
    """
    if os.getenv("TEST_MODE", "0") != "1":
        return None

    if _FORCE_FAILURE:
        return _FAILURE_MESSAGE

    if request is not None:
        if request.headers.get("x-force-failure", "").lower() in ("true", "1", "yes"):
            return "Forced failure via X-Force-Failure header"
        if request.headers.get("x-injected-failure", "").lower() in ("true", "1", "yes"):
            return "Forced failure via X-Injected-Failure header"

    return None
