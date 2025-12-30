"""This file contains the database service for the application."""

from typing import (
    List,
    Optional,
)

from fastapi import HTTPException
from sqlmodel import (
    Session,
    select,
)

from app.core.logging import logger
from app.models.chat import ChatSession
from app.models.user import User


class DatabaseService:
    """Service class for database operations.

    This class handles all database operations for Users, Sessions, and Messages.
    It uses SQLModel for ORM operations and follows FastAPI dependency injection pattern.
    
    Note: All methods accept a `db: Session` parameter that should be injected
    via FastAPI's `Depends(get_db)` in API endpoints.
    """

    async def create_session(
        self, session_id: str, user_id: int, db: Session, name: str = ""
    ) -> ChatSession:
        """Create a new chat session.

        Args:
            session_id: The ID for the new session
            user_id: The ID of the user who owns the session
            db: Database session (from dependency injection)
            name: Optional name for the session (defaults to empty string)

        Returns:
            ChatSession: The created session
        """
        chat_session = ChatSession(id=session_id, user_id=user_id, name=name)
        db.add(chat_session)
        db.commit()
        db.refresh(chat_session)
        logger.info(
            "session_created", session_id=session_id, user_id=user_id, name=name
        )
        return chat_session

    async def get_session(self, session_id: str, db: Session) -> Optional[ChatSession]:
        """Get a session by ID.

        Args:
            session_id: The ID of the session to retrieve
            db: Database session (from dependency injection)

        Returns:
            Optional[ChatSession]: The session if found, None otherwise
        """
        chat_session = db.get(ChatSession, session_id)
        return chat_session

    async def get_user_sessions(self, user_id: int, db: Session) -> List[ChatSession]:
        """Get all sessions for a user.

        Args:
            user_id: The ID of the user
            db: Database session (from dependency injection)

        Returns:
            List[ChatSession]: List of user's sessions
        """
        statement = (
            select(ChatSession)
            .where(ChatSession.user_id == user_id)
            .order_by(ChatSession.created_at)
        )
        sessions = db.exec(statement).all()
        return sessions

    async def update_session_name(self, session_id: str, name: str, db: Session) -> ChatSession:
        """Update a session's name.

        Args:
            session_id: The ID of the session to update
            name: The new name for the session
            db: Database session (from dependency injection)

        Returns:
            ChatSession: The updated session

        Raises:
            HTTPException: If session is not found
        """
        chat_session = db.get(ChatSession, session_id)
        if not chat_session:
            raise HTTPException(status_code=404, detail="Session not found")

        chat_session.name = name
        db.add(chat_session)
        db.commit()
        db.refresh(chat_session)
        logger.info("session_name_updated", session_id=session_id, name=name)
        return chat_session


# Create a singleton instance
database_service = DatabaseService()
