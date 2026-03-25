"""
CIVITAS – Follow-up Q&A router for report conversations.

POST /api/v1/qa/{report_id}/ask
  Body:     { "question": str, "conversation_history": [...] }
  Response: { "answer": str }
"""

from __future__ import annotations

import json
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.app.database import get_conn
from backend.app.dependencies import get_current_user
from backend.app.services.claude_ai import ask_report_followup

router = APIRouter(prefix="/api/v1/qa", tags=["qa"])


class ConversationMessage(BaseModel):
    role: str
    content: str


class QARequest(BaseModel):
    question: str
    conversation_history: List[ConversationMessage] = []


@router.post("/{report_id}/ask")
async def ask_question(
    report_id: str,
    body: QARequest,
    user: dict = Depends(get_current_user),
):
    """Answer a follow-up question about a report."""
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT report_json FROM report_audit WHERE report_id = $1",
            report_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")

    raw = row["report_json"]
    report = json.loads(raw) if isinstance(raw, str) else dict(raw)

    history = [{"role": m.role, "content": m.content} for m in body.conversation_history]

    answer = await ask_report_followup(
        report_data=report,
        question=body.question,
        conversation_history=history,
    )

    return {"answer": answer}
