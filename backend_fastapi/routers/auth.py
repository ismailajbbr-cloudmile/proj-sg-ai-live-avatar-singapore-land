import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import get_current_user
from auth.jwt import create_access_token
from config import settings
from models.user import User
from services.db import get_db

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def login(body: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    # Check admin first — admin account never stored in DB
    if body.username == settings.admin_username:
        if body.password != settings.admin_password:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        token = create_access_token(body.username, is_admin=True)
        response.set_cookie(
            "auth-token",
            token,
            httponly=True,
            samesite="lax",
            secure=False,  # set True in production behind HTTPS
            max_age=60 * 60 * 24 * 7,
            path="/",
        )
        return {"success": True, "message": "Authenticated successfully"}

    # Regular DB user
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()
    if not user or not bcrypt.checkpw(body.password.encode(), user.hashed_password.encode()):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(user.username, is_admin=user.is_admin)
    response.set_cookie(
        "auth-token",
        token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=60 * 60 * 24 * 7,
        path="/",
    )
    return {"success": True, "message": "Authenticated successfully"}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("auth-token", path="/")
    return {"success": True}


@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    return {"username": current_user["username"], "is_admin": current_user["is_admin"]}
