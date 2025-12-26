

from fastapi import APIRouter, Request

from app.core.logging import logger

router = APIRouter()

@router.get("/login")
async def login(request: Request):
    logger.info("login_endpoint_called")
    return {"message": "Hello, World!"}

@router.post("/logout")
async def logout(request: Request):
    logger.info("logout_endpoint_called")
    return {"message": "Hello, World!"}