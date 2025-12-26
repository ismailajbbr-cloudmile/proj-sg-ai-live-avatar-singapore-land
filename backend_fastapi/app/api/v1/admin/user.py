
from fastapi import APIRouter, Request

from app.core.logging import logger

router = APIRouter()

@router.get("/users")
async def get_users(request: Request):
    logger.info("get_users_endpoint_called")
    return {"message": "Hello, World!"}

@router.post("/users")
async def create_user(request: Request):
    logger.info("create_user_endpoint_called")
    return {"message": "Hello, World!"}