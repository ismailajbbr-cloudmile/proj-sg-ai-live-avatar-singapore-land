from fastapi import APIRouter
from config import settings

router = APIRouter()

@router.get("/config")
async def get_config():
    """Public endpoint — no auth required. Returns kiosk configuration."""
    return {
        "session_idle_timeout_minutes": settings.session_idle_timeout_minutes,
    }
