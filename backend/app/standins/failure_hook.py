# STAND-IN - replace with organizer version
"""
Shared Injected Failure Hook Stand-in.
Forces a failure after run acceptance during processing when triggered by the test harness or header.
"""
import os
from typing import Optional
from fastapi import Request

_GLOBAL_FORCE_FAILURE: bool = False
_GLOBAL_FAILURE_MESSAGE: str = "Injected processing failure after acceptance"


def set_forced_failure(enabled: bool, message: str = "Injected processing failure after acceptance") -> None:
    """Set global forced failure flag for test harness."""
    global _GLOBAL_FORCE_FAILURE, _GLOBAL_FAILURE_MESSAGE
    _GLOBAL_FORCE_FAILURE = enabled
    _GLOBAL_FAILURE_MESSAGE = message


def should_force_failure(request: Optional[Request] = None) -> Optional[str]:
    """
    Check if a forced failure should occur after run acceptance.
    Returns error message if failure is forced, else None.
    """
    if os.getenv("TEST_MODE", "0") != "1":
        return None

    if _GLOBAL_FORCE_FAILURE:
        return _GLOBAL_FAILURE_MESSAGE

    if request is not None:
        if request.headers.get("x-force-failure", "").lower() in ("true", "1", "yes"):
            return "Forced failure via X-Force-Failure header"
        if request.headers.get("x-injected-failure", "").lower() in ("true", "1", "yes"):
            return "Forced failure via X-Injected-Failure header"

    return None
