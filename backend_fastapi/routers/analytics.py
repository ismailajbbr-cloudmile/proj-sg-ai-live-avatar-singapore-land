import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import require_admin
from models.conversation import Conversation
from models.message import Message
from models.user import User
from services.db import get_db

router = APIRouter()

@router.get("")
async def get_analytics(
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None)

    total_users = (await db.execute(select(func.count(User.id)))).scalar_one()
    total_conversations = (await db.execute(select(func.count(Conversation.id)))).scalar_one()
    total_messages = (await db.execute(select(func.count(Message.id)))).scalar_one()

    conversations_today = (await db.execute(
        select(func.count(Conversation.id)).where(Conversation.created_at >= today_start)
    )).scalar_one()

    messages_today = (await db.execute(
        select(func.count(Message.id)).where(Message.created_at >= today_start)
    )).scalar_one()

    # Per-user conversation + message counts
    rows = (await db.execute(
        select(
            User.username,
            func.count(Conversation.id.distinct()).label("conversation_count"),
            func.count(Message.id).label("message_count"),
        )
        .join(Conversation, Conversation.user_id == User.id, isouter=True)
        .join(Message, Message.conversation_id == Conversation.id, isouter=True)
        .group_by(User.id, User.username)
        .order_by(func.count(Conversation.id.distinct()).desc())
        .limit(10)
    )).all()
    top_users = [
        {"username": r.username, "conversation_count": r.conversation_count, "message_count": r.message_count}
        for r in rows
    ]

    # Recent conversations with message counts (paginated)
    offset = (page - 1) * page_size
    recent_rows = (await db.execute(
        select(
            Conversation.id,
            Conversation.title,
            Conversation.created_at,
            Conversation.updated_at,
            User.username,
            func.count(Message.id).label("message_count"),
        )
        .join(User, User.id == Conversation.user_id)
        .outerjoin(Message, Message.conversation_id == Conversation.id)
        .group_by(Conversation.id, Conversation.title, Conversation.created_at, Conversation.updated_at, User.username)
        .order_by(Conversation.updated_at.desc())
        .offset(offset)
        .limit(page_size)
    )).all()
    recent_conversations = [
        {
            "id": str(r.id),
            "title": r.title,
            "username": r.username,
            "created_at": r.created_at.isoformat(),
            "updated_at": r.updated_at.isoformat(),
            "message_count": r.message_count,
        }
        for r in recent_rows
    ]

    return {
        "total_users": total_users,
        "total_conversations": total_conversations,
        "total_messages": total_messages,
        "conversations_today": conversations_today,
        "messages_today": messages_today,
        "top_users": top_users,
        "recent_conversations": recent_conversations,
        "conversations_page": page,
        "conversations_page_size": page_size,
    }
