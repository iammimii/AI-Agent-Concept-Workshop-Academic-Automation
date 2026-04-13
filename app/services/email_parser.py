from __future__ import annotations

import html
import re
from typing import Any

from app.models.email import EmailAddress, ParsedEmail


def _strip_html(raw: str) -> str:
    text = re.sub(r"<[^>]+>", " ", raw)
    return html.unescape(re.sub(r"\s+", " ", text)).strip()


def parse_graph_message(msg: dict[str, Any]) -> ParsedEmail:
    """Convert a Microsoft Graph message object into a ParsedEmail."""
    sender_raw = msg.get("sender", {}).get("emailAddress", {})
    sender = EmailAddress(
        name=sender_raw.get("name"),
        address=sender_raw.get("address", "unknown@example.com"),
    )

    recipients = [
        EmailAddress(
            name=r["emailAddress"].get("name"),
            address=r["emailAddress"]["address"],
        )
        for r in msg.get("toRecipients", [])
    ]

    body_content_type = msg.get("body", {}).get("contentType", "text")
    body_raw = msg.get("body", {}).get("content", "")
    body_text = _strip_html(body_raw) if body_content_type == "html" else body_raw
    body_html = body_raw if body_content_type == "html" else None

    return ParsedEmail(
        message_id=msg["id"],
        subject=msg.get("subject", "(no subject)"),
        sender=sender,
        recipients=recipients,
        body_text=body_text,
        body_html=body_html,
        received_at=msg.get("receivedDateTime"),
        thread_id=msg.get("conversationId"),
    )
