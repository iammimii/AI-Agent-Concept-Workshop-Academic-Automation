from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.email import ClassifiedEmail, ParsedEmail
from app.models.responses import APIResponse
from app.services.classifier import classify_email
from app.services.email_parser import parse_graph_message
from app.services.graph_service import fetch_inbox_messages

router = APIRouter(prefix="/emails", tags=["emails"])


class ProcessRequest(BaseModel):
    raw_message: dict  # raw Graph API message object


@router.post("/process", response_model=APIResponse[ClassifiedEmail], include_in_schema=False)
async def process_email(req: ProcessRequest) -> APIResponse[ClassifiedEmail]:
    try:
        parsed: ParsedEmail = parse_graph_message(req.raw_message)
        classified: ClassifiedEmail = await classify_email(parsed)
        return APIResponse(success=True, data=classified)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/inbox", response_model=APIResponse[list[ClassifiedEmail]], summary="Step 2 — Fetch & classify inbox emails")
async def get_inbox(top: int = 10) -> APIResponse[list[ClassifiedEmail]]:
    try:
        messages = await fetch_inbox_messages(top=top)
        results: list[ClassifiedEmail] = []
        for msg in messages:
            parsed = parse_graph_message(msg)
            classified = await classify_email(parsed)
            results.append(classified)
        return APIResponse(success=True, data=results)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
