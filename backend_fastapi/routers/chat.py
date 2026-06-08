import json
import secrets
import uuid
from datetime import datetime, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import get_current_user
from models.conversation import Conversation
from models.message import Message, MessageRole
from models.user import User
from services.db import async_session
from services.gemini import stream_gemini_response

router = APIRouter()

VALID_GESTURES = {"idle", "nod", "shake", "tilt", "lookup", "excited"}


async def _get_or_create_kiosk_user(username: str, db: AsyncSession) -> uuid.UUID:
    """Return the DB user id for the admin/kiosk account, creating a placeholder row if needed."""
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user:
        return user.id
    placeholder_pw = bcrypt.hashpw(secrets.token_bytes(32), bcrypt.gensalt()).decode()
    user = User(username=username, hashed_password=placeholder_pw, is_admin=True)
    db.add(user)
    try:
        await db.commit()
        await db.refresh(user)
    except Exception:
        await db.rollback()
        result = await db.execute(select(User).where(User.username == username))
        user = result.scalar_one()
    return user.id


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []
    conversation_id: uuid.UUID | None = None
    language: str = "en-US"


@router.post("/chat")
async def chat(
    body: ChatRequest,
    current_user: dict = Depends(get_current_user),
):
    # Capture values needed inside the generator closure
    user_id: uuid.UUID | None = current_user["id"]
    is_admin: bool = current_user["is_admin"]
    kiosk_username: str = current_user["username"]
    message: str = body.message
    conversation_id: uuid.UUID | None = body.conversation_id
    history: list[dict] = body.history
    language: str = body.language

    async def generate():
        nonlocal conversation_id

        # Use a fresh session inside the generator so it stays alive for the full stream
        async with async_session() as db:
            # ── 0. Resolve kiosk user — admin has no DB id, create a placeholder row ──
            resolved_user_id = user_id
            if resolved_user_id is None and is_admin:
                resolved_user_id = await _get_or_create_kiosk_user(kiosk_username, db)

            # ── 1. Resolve or create conversation ──────────────────────────
            conv: Conversation | None = None

            if resolved_user_id is not None:
                if conversation_id:
                    result = await db.execute(
                        select(Conversation).where(Conversation.id == conversation_id)
                    )
                    conv = result.scalar_one_or_none()
                    if not conv:
                        raise HTTPException(status_code=404, detail="Conversation not found")
                    if not is_admin and conv.user_id != resolved_user_id:
                        raise HTTPException(status_code=403, detail="Access denied")
                else:
                    conv = Conversation(user_id=resolved_user_id)
                    db.add(conv)
                    await db.commit()
                    await db.refresh(conv)
                    conversation_id = conv.id

            # No DB conversation only if user resolution fully failed
            conv_id_str = str(conversation_id) if conversation_id else None

            # ── 2. Save user message ────────────────────────────────────────
            if conv is not None:
                user_msg = Message(
                    conversation_id=conv.id,
                    role=MessageRole.user,
                    content=message,
                )
                db.add(user_msg)
                if not conv.title:
                    conv.title = message[:200]
                await db.commit()

            # ── 3. Build history for Gemini ─────────────────────────────────
            if conv is not None:
                msgs_result = await db.execute(
                    select(Message)
                    .where(Message.conversation_id == conv.id)
                    .order_by(Message.created_at)
                )
                all_msgs = list(msgs_result.scalars())
                # Exclude the last message (the one we just inserted)
                history_msgs = all_msgs[:-1]
                gemini_history = [
                    {"role": m.role.value, "parts": [{"text": m.content}]}
                    for m in history_msgs
                ]
            else:
                gemini_history = [
                    {
                        "role": "model" if m.get("role") in ("bot", "model") else "user",
                        "parts": [{"text": m.get("text", m.get("content", ""))}],
                    }
                    for m in history
                ]

            def sse(obj: dict) -> bytes:
                return f"data: {json.dumps(obj)}\n\n".encode()

            # ── 4. Stream Gemini ────────────────────────────────────────────
            collected_text = ""
            gesture_emitted = False
            line_buffer = ""

            # First event: conversation_id (only when a real DB conversation exists)
            if conv_id_str:
                yield sse({"type": "conversation_id", "value": conv_id_str})

            try:
                async for chunk_text in stream_gemini_response(message, gemini_history, language=language):
                    if not gesture_emitted:
                        line_buffer += chunk_text
                        newline_idx = line_buffer.find("\n")
                        if newline_idx != -1:
                            gesture_line = line_buffer[:newline_idx].strip().lower()
                            gesture = gesture_line if gesture_line in VALID_GESTURES else "idle"
                            yield sse({"type": "gesture", "value": gesture})
                            gesture_emitted = True
                            rest = line_buffer[newline_idx + 1:]
                            if rest:
                                collected_text += rest
                                yield sse({"type": "chunk", "value": rest})
                            line_buffer = ""
                    else:
                        collected_text += chunk_text
                        yield sse({"type": "chunk", "value": chunk_text})

                if not gesture_emitted:
                    yield sse({"type": "gesture", "value": "idle"})
                    if line_buffer:
                        collected_text += line_buffer
                        yield sse({"type": "chunk", "value": line_buffer})

                if "[SHOW_QR]" in collected_text:
                    yield sse({"type": "show_qr", "value": True})
                    collected_text = collected_text.replace("[SHOW_QR]", "").strip()

                yield sse({"type": "done"})

            except Exception as e:
                yield sse({"type": "error", "value": str(e)})

            finally:
                # ── 5. Save model response ──────────────────────────────────
                if conv is not None and collected_text.strip():
                    model_msg = Message(
                        conversation_id=conv.id,
                        role=MessageRole.model,
                        content=collected_text.strip(),
                    )
                    db.add(model_msg)
                    conv.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                    await db.commit()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
