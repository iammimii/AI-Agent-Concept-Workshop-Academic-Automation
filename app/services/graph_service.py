from __future__ import annotations

import asyncio
from typing import Any

import msal
import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_SCOPES = ["https://graph.microsoft.com/Mail.Read", "https://graph.microsoft.com/Mail.Send"]
_token_cache = msal.SerializableTokenCache()
_cached_token: str | None = None


def _get_msal_app() -> msal.PublicClientApplication:
    return msal.PublicClientApplication(
        client_id=settings.azure_client_id,
        authority="https://login.microsoftonline.com/consumers",
        token_cache=_token_cache,
    )


def get_access_token() -> str | None:
    """Return a cached token if available."""
    app = _get_msal_app()
    accounts = app.get_accounts()
    if accounts:
        result = app.acquire_token_silent(_SCOPES, account=accounts[0])
        if result and "access_token" in result:
            return result["access_token"]
    return None


def initiate_device_flow() -> dict[str, Any]:
    """Start device code flow — returns user_code and verification_uri."""
    app = _get_msal_app()
    flow = app.initiate_device_flow(scopes=_SCOPES)
    if "user_code" not in flow:
        raise RuntimeError(f"Device flow error: {flow.get('error_description')}")
    return flow


def complete_device_flow(flow: dict[str, Any]) -> str:
    """Poll until the user completes sign-in, return access token."""
    app = _get_msal_app()
    result = app.acquire_token_by_device_flow(flow)
    if "access_token" not in result:
        raise RuntimeError(f"Auth error: {result.get('error_description')}")
    return result["access_token"]


async def fetch_inbox_messages(top: int = 25) -> list[dict[str, Any]]:
    token = get_access_token()
    if not token:
        raise RuntimeError("Not authenticated. Call GET /auth/login first.")
    url = f"{settings.graph_api_base}/me/mailFolders/inbox/messages"
    params = {
        "$top": top,
        "$select": "id,subject,sender,toRecipients,body,receivedDateTime,conversationId",
        "$orderby": "receivedDateTime desc",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            url,
            headers={"Authorization": f"Bearer {token}"},
            params=params,
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json().get("value", [])


async def send_message(to: list[str], subject: str, body: str) -> None:
    token = get_access_token()
    if not token:
        raise RuntimeError("Not authenticated. Call GET /auth/login first.")
    url = f"{settings.graph_api_base}/me/sendMail"
    payload = {
        "message": {
            "subject": subject,
            "body": {"contentType": "Text", "content": body},
            "toRecipients": [{"emailAddress": {"address": addr}} for addr in to],
        }
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=15,
        )
        resp.raise_for_status()
    logger.info("Email sent to %s", to)
