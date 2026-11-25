import json
import re
import secrets
import uuid
from datetime import UTC, datetime

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
from services.background_jobs import followup_message, get_job, start_job
from services.chat_provider import stream_chat_response
from services.db import async_session

router = APIRouter()

VALID_GESTURES = {"idle", "nod", "shake", "tilt", "lookup", "excited"}

# Models sometimes repeat the tool name before the gesture line. It is noise, not speech.
_TOOL_NAME_PREFIX = re.compile(
    r"^(?:browse_web|continue_browse|get_browse_screen|stop_browse|web_search|"
    r"create_image|edit_image|create_video)\b[\s:,.-]*",
    re.IGNORECASE,
)


def _parse_leading_gesture(text: str) -> tuple[str, str]:
    """Parse optional leading gesture token. Returns (gesture, visible_text)."""
    if not text:
        return "idle", ""

    stripped = _TOOL_NAME_PREFIX.sub("", text.lstrip("\ufeff"), count=1)
    if not stripped:
        return "idle", text

    newline_idx = stripped.find("\n")
    first_line = (
        stripped[:newline_idx].strip().lower()
        if newline_idx != -1
        else stripped.strip().lower()
    )

    if first_line in VALID_GESTURES:
        if newline_idx != -1:
            remainder = stripped[newline_idx + 1 :].lstrip("\n")
        else:
            remainder = ""
        return first_line, remainder

    lower = stripped.lower()
    for gesture in sorted(VALID_GESTURES, key=len, reverse=True):
        for sep in (" ", "\t"):
            prefix = gesture + sep
            if lower.startswith(prefix):
                return gesture, stripped[len(gesture) :].lstrip()

    return "idle", text


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
    # Set when announcing a finished background job; message is then ignored.
    job_id: str | None = None


@router.post("/chat")
async def chat(
    body: ChatRequest,
    current_user: dict = Depends(get_current_user),
):
    # Capture values needed inside the generator closure
    user_id: uuid.UUID | None = current_user["id"]
    is_admin: bool = current_user["is_admin"]
    kiosk_username: str = current_user["username"]
    job = None
    if body.job_id:
        job = get_job(body.job_id, kiosk_username)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        if job.status == "running":
            raise HTTPException(status_code=409, detail="Job is still running")
        if job.announced:
            raise HTTPException(status_code=409, detail="Job result was already announced")
        job.announced = True
    message: str = followup_message(job) if job else body.message
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

            # ── 2. Save user message (job follow-ups are not visitor input) ──
            if conv is not None and job is None:
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
                history_msgs = all_msgs if job else all_msgs[:-1]
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
            media_lines: list[str] = []
            gesture_emitted = False
            line_buffer = ""

            # First event: conversation_id (only when a real DB conversation exists)
            if conv_id_str:
                yield sse({"type": "conversation_id", "value": conv_id_str})

            try:
                if job is not None and job.media is not None:
                    media_lines.append(f"[{job.media.kind}] {job.media.url}")
                    yield sse({"type": "media", "kind": job.media.kind, "url": job.media.url})

                async for item in stream_chat_response(
                    message,
                    gemini_history,
                    language=language,
                    followup=job is not None,
                    owner=kiosk_username,
                ):
                    if isinstance(item, dict):
                        if item.get("type") == "job_request":
                            started = start_job(
                                owner=kiosk_username,
                                operation=str(item.get("operation", "")),
                                arguments=item.get("arguments") or {},
                                request=str(item.get("request") or message),
                            )
                            yield sse({"type": "job", "id": started.id, "operation": started.operation})
                            continue
                        url = str(item.get("url") or "")
                        if item.get("type") == "media" and url and not url.startswith("data:"):
                            media_lines.append(f"[{item.get('kind', 'image')}] {url}")
                        yield sse(item)
                        continue
                    chunk_text = item
                    if not gesture_emitted:
                        line_buffer += chunk_text
                        newline_idx = line_buffer.find("\n")
                        if newline_idx != -1:
                            gesture, remainder = _parse_leading_gesture(line_buffer)
                            yield sse({"type": "gesture", "value": gesture})
                            gesture_emitted = True
                            if remainder:
                                collected_text += remainder
                                yield sse({"type": "chunk", "value": remainder})
                            line_buffer = ""
                    else:
                        collected_text += chunk_text
                        yield sse({"type": "chunk", "value": chunk_text})

                if not gesture_emitted:
                    gesture, remainder = _parse_leading_gesture(line_buffer)
                    yield sse({"type": "gesture", "value": gesture})
                    if remainder:
                        collected_text += remainder
                        yield sse({"type": "chunk", "value": remainder})

                if "[SHOW_QR]" in collected_text:
                    yield sse({"type": "show_qr", "value": True})
                    collected_text = collected_text.replace("[SHOW_QR]", "").strip()

                yield sse({"type": "done"})

            except Exception as e:
                yield sse({"type": "error", "value": str(e)})

            finally:
                # ── 5. Save model response ──────────────────────────────────
                saved = collected_text.strip()
                if media_lines:
                    saved = (saved + "\n" + "\n".join(media_lines)).strip()
                if conv is not None and saved:
                    model_msg = Message(
                        conversation_id=conv.id,
                        role=MessageRole.model,
                        content=saved,
                    )
                    db.add(model_msg)
                    conv.updated_at = datetime.now(UTC).replace(tzinfo=None)
                    await db.commit()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
