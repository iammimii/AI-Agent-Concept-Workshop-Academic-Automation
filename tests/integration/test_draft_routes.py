import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import draft_service

client = TestClient(app)

DRAFT_PAYLOAD = {
    "original_message_id": "msg-001",
    "to": ["bob@example.com"],
    "subject": "Re: Hello",
    "body": "Thanks for reaching out.",
}


@pytest.fixture(autouse=True)
def clear_store():
    draft_service._store.clear()
    yield
    draft_service._store.clear()


def test_create_draft():
    resp = client.post("/drafts", json=DRAFT_PAYLOAD)
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["status"] == "pending"
    assert data["subject"] == "Re: Hello"


def test_list_drafts_empty():
    resp = client.get("/drafts")
    assert resp.status_code == 200
    assert resp.json()["data"] == []


def test_get_draft_not_found():
    resp = client.get("/drafts/nonexistent-id")
    assert resp.status_code == 404


def test_update_draft():
    create_resp = client.post("/drafts", json=DRAFT_PAYLOAD)
    draft_id = create_resp.json()["data"]["id"]

    update_resp = client.patch(f"/drafts/{draft_id}", json={"status": "approved"})
    assert update_resp.status_code == 200
    assert update_resp.json()["data"]["status"] == "approved"


def test_delete_draft():
    create_resp = client.post("/drafts", json=DRAFT_PAYLOAD)
    draft_id = create_resp.json()["data"]["id"]

    del_resp = client.delete(f"/drafts/{draft_id}")
    assert del_resp.status_code == 200

    get_resp = client.get(f"/drafts/{draft_id}")
    assert get_resp.status_code == 404
