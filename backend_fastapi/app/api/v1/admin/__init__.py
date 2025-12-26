from fastapi import APIRouter
from app.api.v1.admin.user import router as users_router

router = APIRouter()
# User management
router.include_router(users_router, prefix="/users", tags=["admin-users"])

