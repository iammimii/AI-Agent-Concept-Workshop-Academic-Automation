from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, EmailStr


class DraftStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    sent = "sent"
    rejected = "rejected"


class DraftCreate(BaseModel):
    original_message_id: str
    to: list[EmailStr]
    subject: str
    body: str


class DraftUpdate(BaseModel):
    subject: Optional[str] = None
    body: Optional[str] = None
    status: Optional[DraftStatus] = None


class Draft(BaseModel):
    id: str
    original_message_id: str
    to: list[EmailStr]
    subject: str
    body: str
    status: DraftStatus = DraftStatus.pending
    created_at: datetime
    updated_at: datetime
