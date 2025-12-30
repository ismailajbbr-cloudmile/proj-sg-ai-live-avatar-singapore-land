
from fastapi import APIRouter, Request
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from app.core.logging import logger
from app.core.database import get_db
from app.core.config import settings
from app.schemas.auth import UserCreateRequest, UserListResponse, UserPublicResponse, UserRoleUpdateRequest
from app.services.auth_service import AuthService
from app.services.user import user_management_service
from sqlmodel import Session
from app.utils.sanitizer import sanitize_string, sanitize_email
from app.utils.password import validate_password_strength
from app.utils.auth import get_current_admin_user
from app.models.user import User, UserRole

router = APIRouter()


@router.post(
    "/users",
    response_model=UserPublicResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(get_current_admin_user)],
)
async def create_user(user_data: UserCreateRequest, db: Session = Depends(get_db)):
    """Create a new user (admin only).
    
    Args:
        user_data: User creation request data
        db: Database session
        
    Returns:
        UserPublicResponse: The created user
        
    Raises:
        HTTPException: If email already exists or validation fails
    """
    try:
        # Sanitize email
        sanitized_email = sanitize_email(user_data.email)

        # Sanitize full name
        sanitized_full_name = sanitize_string(user_data.full_name)

        # Extract and validate password
        password = user_data.password.get_secret_value()
        validate_password_strength(password)

        # Check if user exists
        if await user_management_service.get_user_by_email(sanitized_email, db=db):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered",
            )

        # Create user
        user = await user_management_service.create_user(
            email=sanitized_email,
            full_name=sanitized_full_name,
            password=User.hash_password(password),
            role=user_data.role,
            db=db,
        )

        return user

    except ValueError as ve:
        logger.error("user_creation_validation_failed", error=str(ve), exc_info=True)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(ve))


@router.get("/users", response_model=UserListResponse, dependencies=[Depends(get_current_admin_user)])
async def list_users(db: Session = Depends(get_db)):
    """List all users (admin only).
    
    Args:
        db: Database session
        
    Returns:
        UserListResponse: List of all users
    """
    users = await user_management_service.get_users(db=db)
    return UserListResponse(users=users)


@router.patch(
    "/users/{user_id}/role",
    response_model=UserPublicResponse,
    dependencies=[Depends(get_current_admin_user)],
)
async def update_user_role(user_id: int, role_update: UserRoleUpdateRequest, db: Session = Depends(get_db)):
    """Update a user's role (admin only).
    
    Args:
        user_id: The ID of the user to update
        role_update: The new role for the user
        db: Database session
        
    Returns:
        UserPublicResponse: The updated user
        
    Raises:
        HTTPException: If user not found
    """
    user = await user_management_service.update_user_role(user_id=user_id, role=role_update.role, db=db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return user


@router.delete(
    "/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(get_current_admin_user)],
)
async def delete_user(user_id: int, db: Session = Depends(get_db)):
    """Delete a user (admin only).
    
    Args:
        user_id: The ID of the user to delete
        db: Database session
        
    Returns:
        Response: 204 No Content on success
        
    Raises:
        HTTPException: If user not found
    """
    deleted = await user_management_service.delete_user(user_id=user_id, db=db)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
