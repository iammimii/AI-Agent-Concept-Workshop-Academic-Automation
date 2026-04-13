from __future__ import annotations

from app.models.email import ClassifiedEmail, ParsedEmail
from app.services.llm_service import llm_classify


async def classify_email(email: ParsedEmail) -> ClassifiedEmail:
    """Use the LLM to classify an email and produce a short summary."""
    result = await llm_classify(email)
    return ClassifiedEmail(
        email=email,
        urgency=result["urgency"],
        intent=result["intent"],
        course_relevance=result["course_relevance"],
        confidence=result["confidence"],
        summary=result["summary"],
    )
