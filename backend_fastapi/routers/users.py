import secrets
import string
import uuid
from datetime import datetime

import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import require_admin
from models.user import User
from services.db import get_db

router = APIRouter()


def _generate_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


class CreateUserRequest(BaseModel):
    username: str


class UserResponse(BaseModel):
    id: uuid.UUID
    username: str
    is_admin: bool
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/")
async def list_users(
    page: int = 1,
    page_size: int = 10,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    total = (await db.execute(select(func.count(User.id)))).scalar_one()
    offset = (page - 1) * page_size
    result = await db.execute(
        select(User).order_by(User.created_at.desc()).offset(offset).limit(page_size)
    )
    users = result.scalars().all()
    return {
        "users": [UserResponse.model_validate(u).model_dump(mode="json") for u in users],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/", status_code=201)
async def create_user(
    body: CreateUserRequest,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    # Check for duplicate username
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already exists")

    password = _generate_password()
    user = User(username=body.username, hashed_password=bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode())
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"id": user.id, "username": user.username, "password": password}


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(user)
    await db.commit()


@router.post("/{user_id}/reset-password")
async def reset_password(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    password = _generate_password()
    user.hashed_password = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    await db.commit()
    return {"id": user.id, "username": user.username, "password": password}
