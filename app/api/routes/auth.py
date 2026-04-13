from __future__ import annotations

import threading
from typing import Any

from fastapi import APIRouter, HTTPException

from app.models.responses import APIResponse
from app.services.graph_service import initiate_device_flow, complete_device_flow

router = APIRouter(prefix="/auth", tags=["auth"])

# Store the active flow between the two calls
_active_flow: dict[str, Any] | None = None


@router.get("/login", response_model=APIResponse[dict], summary="Step 1 — Authenticate with Outlook")
async def login() -> APIResponse[dict]:
    """Start device code flow. Visit the returned URL, enter the code, and sign in with your Outlook account."""
    global _active_flow
    try:
        flow = initiate_device_flow()
        _active_flow = flow
        # Kick off background polling so token gets cached automatically
        threading.Thread(target=_poll_flow, args=(flow,), daemon=True).start()
        return APIResponse(
            success=True,
            data={
                "message": flow["message"],
                "user_code": flow["user_code"],
                "verification_url": flow["verification_uri"],
            },
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def _poll_flow(flow: dict[str, Any]) -> None:
    """Background thread — polls until sign-in completes and caches the token."""
    try:
        complete_device_flow(flow)
    except Exception as exc:
        pass  # Will surface as 401 on next inbox request
