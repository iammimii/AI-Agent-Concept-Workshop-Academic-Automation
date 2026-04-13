import pytest

from app.models.draft import DraftCreate, DraftStatus, DraftUpdate
from app.services import draft_service


@pytest.fixture(autouse=True)
def clear_store():
    draft_service._store.clear()
    yield
    draft_service._store.clear()


def test_create_and_get_draft():
    data = DraftCreate(
        original_message_id="msg-001",
        to=["bob@example.com"],
        subject="Re: Hello",
        body="Thanks for reaching out.",
    )
    draft = draft_service.create_draft(data)
    assert draft.status == DraftStatus.pending
    fetched = draft_service.get_draft(draft.id)
    assert fetched is not None
    assert fetched.id == draft.id


def test_list_drafts():
    for i in range(3):
        draft_service.create_draft(
            DraftCreate(
                original_message_id=f"msg-{i}",
                to=["x@example.com"],
                subject=f"Draft {i}",
                body="body",
            )
        )
    assert len(draft_service.list_drafts()) == 3


def test_update_draft():
    draft = draft_service.create_draft(
        DraftCreate(
            original_message_id="msg-001",
            to=["x@example.com"],
            subject="Original",
            body="Original body",
        )
    )
    updated = draft_service.update_draft(draft.id, DraftUpdate(subject="Updated", status=DraftStatus.approved))
    assert updated is not None
    assert updated.subject == "Updated"
    assert updated.status == DraftStatus.approved


def test_delete_draft():
    draft = draft_service.create_draft(
        DraftCreate(
            original_message_id="msg-001",
            to=["x@example.com"],
            subject="To delete",
            body="body",
        )
    )
    assert draft_service.delete_draft(draft.id) is True
    assert draft_service.get_draft(draft.id) is None


def test_get_nonexistent_draft():
    assert draft_service.get_draft("does-not-exist") is None
