from unittest.mock import AsyncMock, patch

import pytest

from app.models.email import EmailAddress, ParsedEmail
from app.services.classifier import classify_email

SAMPLE_EMAIL = ParsedEmail(
    message_id="msg-001",
    subject="Product question",
    sender=EmailAddress(address="user@example.com"),
    body_text="Hi, I have a question about your product.",
)


@pytest.mark.asyncio
async def test_classify_email_returns_classified():
    mock_result = {
        "urgency": "medium",
        "intent": "inquiry",
        "course_relevance": 0.2,
        "confidence": 0.95,
        "summary": "User asks about the product.",
    }
    with patch("app.services.classifier.llm_classify", new=AsyncMock(return_value=mock_result)):
        classified = await classify_email(SAMPLE_EMAIL)

    assert classified.urgency == "medium"
    assert classified.intent == "inquiry"
    assert classified.course_relevance == 0.2
    assert classified.confidence == 0.95
    assert classified.email.message_id == "msg-001"
