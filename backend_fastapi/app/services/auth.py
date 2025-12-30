from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select
from typing import Optional
from datetime import datetime, timedelta, UTC
import secrets
import hashlib

from app.core.database import get_db
from app.core.logging import logger
from app.models import User, UserRole
from app.utils.auth import verify_token, generate_api_key, hash_api_key
from app.utils.sanitization import sanitize_string
from app.services.email_service import email_service

security = HTTPBearer()


class AuthService:
    """Service class for auth operations."""

    async def get_current_user(
        self, credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)
    ) -> User:
        """Get the current user from the token.

        Args:
            credentials: The HTTP authorization credentials containing the JWT token.

        Returns:
            User: The user extracted from the token.

        Raises:
            HTTPException: If the token is invalid or missing.
        """
        try:
            # Sanitize token
            token = sanitize_string(credentials.credentials)

            user_id = verify_token(token)
            if user_id is None:
                logger.error("invalid_token", token_part=token[:10] + "...")
                raise HTTPException(
                    status_code=401,
                    detail="Invalid authentication credentials",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            # Verify user exists in database
            user_id_int = int(user_id)
            user = await self.get_user(user_id_int, db=db)
            if user is None:
                logger.error("user_not_found", user_id=user_id_int)
                raise HTTPException(
                    status_code=404,
                    detail="User not found",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            return user
        except ValueError as ve:
            logger.error("token_validation_failed", error=str(ve), exc_info=True)
            raise HTTPException(
                status_code=422,
                detail="Invalid token format",
                headers={"WWW-Authenticate": "Bearer"},
            )

    async def get_user(self, user_id: int, db: Session = None) -> Optional[User]:
        """Get a user by ID.

        Args:
            user_id: The ID of the user to retrieve
            db: The database session

        Returns:
            Optional[User]: The user if found, None otherwise
            
        Raises:
            ValueError: If db is None or user_id is invalid.
        """
        if db is None:
            raise ValueError("Database session is required")
        if not user_id:
            raise ValueError("User ID is required")
        
        user = db.get(User, user_id)
        return user

    async def request_password_reset(self, email: str, db: Session) -> None:
        """Request a password reset for a user.
        
        Generates a secure token, stores it in the database, and sends a password
        reset email to the user if the email exists in the system.
        
        Args:
            email: The email address of the user requesting password reset
            db: The database session
            
        Raises:
            ValueError: If db is None or email is empty.
        """
        if db is None:
            raise ValueError("Database session is required")
        if not email:
            raise ValueError("Email is required")
        
        user = await self.get_user_by_email(email, db=db)
        if user:
            try:
                raw_token = secrets.token_urlsafe(32)
                hashed_token = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()

                user.password_reset_token = hashed_token
                user.password_reset_token_expires_at = datetime.now(UTC) + timedelta(hours=1)
                db.add(user)
                db.commit()

                email_service.send_password_reset_email(email, raw_token)
                logger.info("password_reset_requested", email=email)
            except Exception as e:
                db.rollback()
                logger.error(
                    "password_reset_request_failed",
                    email=email,
                    error=str(e),
                    exc_info=True,
                )
                raise

    async def reset_password(self, token: str, new_password: str, db: Session) -> bool:
        """Reset a user's password using a reset token.
        
        Args:
            token: The password reset token
            new_password: The new password to set
            db: The database session
            
        Returns:
            bool: True if password was reset successfully, False if token is invalid or expired
            
        Raises:
            ValueError: If db is None, token is empty, or new_password is empty.
        """
        if db is None:
            raise ValueError("Database session is required")
        if not token:
            raise ValueError("Reset token is required")
        if not new_password:
            raise ValueError("New password is required")
        
        hashed_token = hashlib.sha256(token.encode('utf-8')).hexdigest()
        statement = select(User).where(User.password_reset_token == hashed_token)
        user = db.exec(statement).first()

        if not user:
            logger.warning("password_reset_token_not_found")
            return False
        
        # Check if token is expired
        if user.password_reset_token_expires_at is None:
            logger.warning("password_reset_token_no_expiry", user_id=user.id)
            return False
        
        # Ensure both datetimes are timezone-aware for comparison
        expires_at = user.password_reset_token_expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        
        if expires_at < datetime.now(UTC):
            logger.warning("password_reset_token_expired", user_id=user.id)
            return False

        try:
            user.hashed_password = User.hash_password(new_password)
            user.password_reset_token = None
            user.password_reset_token_expires_at = None
            db.add(user)
            db.commit()
            logger.info("password_reset_successful", user_id=user.id)
            return True
        except Exception as e:
            db.rollback()
            logger.error(
                "password_reset_failed",
                user_id=user.id if user else None,
                error=str(e),
                exc_info=True,
            )
            raise



auth_service = AuthService()
