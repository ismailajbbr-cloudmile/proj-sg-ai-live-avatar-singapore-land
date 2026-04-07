import uuid

from fastapi import Cookie, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.jwt import decode_token
from config import settings
from models.user import User
from services.db import get_db


async def get_current_user(
    auth_token: str | None = Cookie(default=None, alias="auth-token"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if not auth_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(auth_token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    username: str = payload.get("sub", "")
    is_admin: bool = payload.get("is_admin", False)

    if is_admin and username == settings.admin_username:
        return {"id": None, "username": username, "is_admin": True}

    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return {"id": user.id, "username": user.username, "is_admin": user.is_admin}


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if not current_user["is_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
