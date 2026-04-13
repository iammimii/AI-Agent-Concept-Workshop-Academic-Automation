from __future__ import annotations

import json
from typing import Any

from groq import AsyncGroq

from app.core.config import settings
from app.core.logging import get_logger
from app.models.email import ParsedEmail

logger = get_logger(__name__)

_client: AsyncGroq | None = None


def get_client() -> AsyncGroq:
    global _client
    if _client is None:
        _client = AsyncGroq(api_key=settings.groq_api_key)
    return _client


_CLASSIFY_SYSTEM = """\
You are an academic email classification assistant. Given an email, respond ONLY
with a JSON object with exactly these keys:
  "urgency": one of ["high", "medium", "low"]
  "intent": one of ["inquiry", "complaint", "feedback", "spam", "administrative", "other"]
  "course_relevance": float 0-1 (how relevant this email is to a university course or academic matter)
  "confidence": float 0-1 (your overall classification confidence)
  "summary": one-sentence plain-English summary (max 30 words)
No markdown, no explanation — raw JSON only."""

_DRAFT_SYSTEM = """\
You are a professional academic email assistant. Write a helpful, concise reply
to the email provided. Respond ONLY with the plain-text body of the reply — no
salutation line, no subject, no markdown."""


async def llm_classify(email: ParsedEmail) -> dict[str, Any]:
    body_excerpt = email.body_text[: settings.max_email_body_chars]
    prompt = f"Subject: {email.subject}\n\nBody:\n{body_excerpt}"

    response = await get_client().chat.completions.create(
        model=settings.groq_model,
        messages=[
            {"role": "system", "content": _CLASSIFY_SYSTEM},
            {"role": "user", "content": prompt},
        ],
        max_tokens=256,
        temperature=0.1,
    )
    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    logger.debug("llm_classify raw response: %s", raw)
    return json.loads(raw.strip())


async def llm_draft_reply(email: ParsedEmail, instructions: str = "") -> str:
    body_excerpt = email.body_text[: settings.max_email_body_chars]
    prompt = (
        f"Subject: {email.subject}\n\nOriginal email:\n{body_excerpt}"
        + (f"\n\nAdditional instructions: {instructions}" if instructions else "")
    )

    response = await get_client().chat.completions.create(
        model=settings.groq_model,
        messages=[
            {"role": "system", "content": _DRAFT_SYSTEM},
            {"role": "user", "content": prompt},
        ],
        max_tokens=512,
        temperature=0.7,
    )
    return response.choices[0].message.content.strip()
