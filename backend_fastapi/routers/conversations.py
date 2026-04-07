import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import get_current_user
from models.conversation import Conversation
from models.message import Message
from services.db import get_db

router = APIRouter()


class ConversationSummary(BaseModel):
    id: uuid.UUID
    title: str | None
    created_at: datetime
    message_count: int


class MessageOut(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    created_at: datetime


class ConversationDetail(BaseModel):
    id: uuid.UUID
    title: str | None
    created_at: datetime
    messages: list[MessageOut]


@router.get("/", response_model=list[ConversationSummary])
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user["id"] is None:
        return []  # Admin has no user_id — no conversations

    result = await db.execute(
        select(
            Conversation.id,
            Conversation.title,
            Conversation.created_at,
            func.count(Message.id).label("message_count"),
        )
        .outerjoin(Message, Message.conversation_id == Conversation.id)
        .where(Conversation.user_id == current_user["id"])
        .group_by(Conversation.id)
        .order_by(Conversation.updated_at.desc())
    )
    rows = result.all()
    return [
        ConversationSummary(
            id=r.id,
            title=r.title,
            created_at=r.created_at,
            message_count=r.message_count,
        )
        for r in rows
    ]


@router.post("/", status_code=201)
async def create_conversation(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user["id"] is None:
        raise HTTPException(status_code=403, detail="Admin cannot create conversations")

    conv = Conversation(user_id=current_user["id"])
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return {"id": conv.id}


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if not current_user["is_admin"] and conv.user_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    msgs_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
    )
    messages = [
        MessageOut(
            id=m.id,
            role=m.role.value,
            content=m.content,
            created_at=m.created_at,
        )
        for m in msgs_result.scalars()
    ]
    return ConversationDetail(
        id=conv.id, title=conv.title, created_at=conv.created_at, messages=messages
    )


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if not current_user["is_admin"] and conv.user_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    await db.delete(conv)
    await db.commit()
