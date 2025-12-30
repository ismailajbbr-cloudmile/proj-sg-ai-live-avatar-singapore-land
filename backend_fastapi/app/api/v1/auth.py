

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from app.core.limiter import limiter
from app.core.logging import logger
from app.utils.cookies import delete_auth_cookies
from app.core.database import get_db
from app.core.config import settings
from app.schemas.auth import LoginRequest, TokenResponse
from app.services.auth import auth_service
from sqlmodel import Session
from app.utils.sanitizer import sanitize_string
from app.models.user import User
from app.utils.auth import get_current_user
from app.schemas.auth import UserPublicResponse

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
@limiter.limit(settings.RATE_LIMIT_ENDPOINTS["login"][0])
async def login(
    request: Request,
    login_data: LoginRequest,
    db: Session = Depends(get_db),
):
    """Login a user.

    Args:
        request: The FastAPI request object for rate limiting.
        login_data: Login credentials (email, password, grant_type) as JSON
        db: Database session

    Returns:
        TokenResponse: Access token information

    Raises:
        HTTPException: If credentials are invalid or grant type is unsupported
    """
    try:
        # Sanitize inputs
        email = sanitize_string(login_data.email)
        password = login_data.password.get_secret_value()
        password = sanitize_string(password)
        grant_type = sanitize_string(login_data.grant_type)

        # Verify grant type
        if grant_type != "password":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsupported grant type. Must be 'password'",
            )

        user = await auth_service.get_user_by_email(email, db=db)
        if not user or not user.verify_password(password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        token = create_access_token(str(user.id))
        return TokenResponse(access_token=token.access_token, token_type="bearer", expires_at=token.expires_at)

    except ValueError as ve:
        logger.error("login_validation_failed", error=str(ve), exc_info=True)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(ve))

@router.post("/logout")
async def logout(request: Request):
    """Logout a user by deleting authentication cookies.
    
    Removes all authentication cookies (access_token, id_token, refresh_token)
    from the response. This endpoint is idempotent - it will succeed even if
    the user is already logged out.
    
    Args:
        request: The FastAPI request object
        
    Returns:
        JSONResponse: Success message with cookies deleted
    """
    logger.info("logout_endpoint_called")
    
    # Create response with success message
    response = JSONResponse(content={"message": "Successfully logged out"})
    
    # Delete all authentication cookies
    response = delete_auth_cookies(response)
    
    return response


@router.post("/reset-password", status_code=status.HTTP_200_OK)
async def reset_password(request: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Reset a user's password using a token.
    
    Args:
        request: Reset password request data
        db: Database session
        
    Returns:
        dict: Success message
        
    Raises:
        HTTPException: If token is invalid or expired
    """
    success = await auth_service.reset_password(request.token, request.password.get_secret_value(), db=db)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired token",
        )
    return {"message": "Password has been reset successfully."}


@router.get("/me", response_model=UserPublicResponse)
async def read_users_me(current_user: User = Depends(get_current_user)):
    """Retrieve the profile of the currently authenticated user.
    
    Args:
        current_user: The current authenticated user
        
    Returns:
        UserPublicResponse: The user's public profile
    """
    # Explicitly construct response to ensure all fields including role are serialized
    return UserPublicResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role
    )


