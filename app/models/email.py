from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class EmailAddress(BaseModel):
    name: Optional[str] = None
    address: EmailStr


class ParsedEmail(BaseModel):
    message_id: str
    subject: str
    sender: EmailAddress
    recipients: list[EmailAddress] = Field(default_factory=list)
    body_text: str
    body_html: Optional[str] = None
    received_at: Optional[datetime] = None
    thread_id: Optional[str] = None


class ClassifiedEmail(BaseModel):
    email: ParsedEmail
    urgency: str          # "high" | "medium" | "low"
    intent: str           # "inquiry" | "complaint" | "feedback" | "spam" | "administrative" | "other"
    course_relevance: float = Field(ge=0.0, le=1.0)  # 0 = not relevant, 1 = highly relevant
    confidence: float = Field(ge=0.0, le=1.0)
    summary: str
