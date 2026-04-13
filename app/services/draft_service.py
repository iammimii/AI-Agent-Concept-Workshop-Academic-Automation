from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from app.models.draft import Draft, DraftCreate, DraftStatus, DraftUpdate

# In-memory store for the PoC — swap for a DB later
_store: dict[str, Draft] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_draft(data: DraftCreate) -> Draft:
    draft = Draft(
        id=str(uuid.uuid4()),
        original_message_id=data.original_message_id,
        to=data.to,
        subject=data.subject,
        body=data.body,
        status=DraftStatus.pending,
        created_at=_now(),
        updated_at=_now(),
    )
    _store[draft.id] = draft
    return draft


def get_draft(draft_id: str) -> Optional[Draft]:
    return _store.get(draft_id)


def list_drafts() -> list[Draft]:
    return list(_store.values())


def update_draft(draft_id: str, data: DraftUpdate) -> Optional[Draft]:
    draft = _store.get(draft_id)
    if draft is None:
        return None
    updated = draft.model_copy(
        update={k: v for k, v in data.model_dump(exclude_none=True).items()}
    )
    updated = updated.model_copy(update={"updated_at": _now()})
    _store[draft_id] = updated
    return updated


def delete_draft(draft_id: str) -> bool:
    return _store.pop(draft_id, None) is not None
