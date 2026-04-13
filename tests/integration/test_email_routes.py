from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

SAMPLE_MSG = {
    "id": "msg-001",
    "subject": "Test",
    "sender": {"emailAddress": {"name": "Alice", "address": "alice@example.com"}},
    "toRecipients": [],
    "body": {"contentType": "text", "content": "Hello"},
    "receivedDateTime": "2024-01-01T10:00:00Z",
    "conversationId": "thread-001",
}

MOCK_CLASSIFY = {"category": "inquiry", "confidence": 0.9, "summary": "Test email."}


def test_process_email_success():
    with patch("app.services.llm_service.get_client") as mock_get:
        mock_client = AsyncMock()
        mock_client.aio.models.generate_content.return_value = AsyncMock(
            text='{"urgency":"medium","intent":"inquiry","course_relevance":0.1,"confidence":0.9,"summary":"Test."}'
        )
        mock_get.return_value = mock_client

        resp = client.post("/emails/process", json={"raw_message": SAMPLE_MSG})

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["intent"] == "inquiry"


def test_process_email_invalid_payload():
    resp = client.post("/emails/process", json={})
    assert resp.status_code == 422
