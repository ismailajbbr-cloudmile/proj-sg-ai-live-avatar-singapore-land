import json
import uuid
import secrets
from datetime import datetime, UTC, timedelta

from fastapi import HTTPException, status
from typing import List, Optional, Union
from sqlalchemy import func
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.core.logging import logger
from app.core.config import settings
from app.models import (
    ChatSession,
    Message,
    MessageElement,
    MessageRole,
    MessageStatus,
    User,
    UserRole,
    ConnectionAccess,
    Connection,
    Feedback,
    FeedbackRating,
    ChatSessionShare,
    SessionConnection,
    SessionType,
    ElementType,
)
from app.schemas.chat import (
    MessageResponse,
    TextElementPayload,
    TableElementPayload,
    ChartElementPayload,
)
from pydantic import ValidationError


class ChatService:
    """Service class for managing chat messages within sessions."""

    def get_current_chat_session(self, session_id: uuid.UUID, user: User, db: Session) -> ChatSession:
        """Get the current chat session given the session ID.

        Args:
            session_id: The ID of the session to retrieve
            user: The current user

        Returns:
            ChatSession: The chat session if found, None otherwise

        Raises:
            HTTPException: If the session ID or JWT token is invalid or missing.
        """
        chat_session = self.get_chat_session(session_id=session_id, db=db)
        if not chat_session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

        if chat_session.user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to access this session"
            )

        return chat_session

    def create_chat_session(
        self,
        session_id: uuid.UUID,
        user: User,
        connection_ids: List[uuid.UUID],
        db: Session,
        title: str = "",
        session_type: SessionType = SessionType.EXPLORE,
    ) -> ChatSession:
        """Create a new chat session and associate it with connections.

        Args:
            session_id: The ID for the new session.
            user: The user who owns the session.
            connection_ids: List of connection IDs to associate with the session.
            db: The database session.
            title: Optional title for the session.
            session_type: Type of session (EXPLORE or RESEARCH).

        Returns:
            The created chat session with its associated connections.

        Raises:
            HTTPException: If no connection IDs are provided, or if the user
                         lacks access to any of the specified connections.
        """
        if not connection_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="At least one connection ID is required."
            )

        # Validate session type constraints
        if session_type == SessionType.EXPLORE and len(connection_ids) != 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Chat sessions must have exactly one connection."
            )
        elif session_type == SessionType.RESEARCH and len(connection_ids) < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Research sessions must have at least one connection."
            )

        # Verify user has access to all specified connections
        # Admin and Owner users have access to all connections
        logger.info(
            "checking_connection_access",
            user_id=user.id,
            user_role=user.role,
            connection_ids=[str(cid) for cid in connection_ids]
        )
        if user.role not in (UserRole.ADMIN, UserRole.OWNER):
            accessible_connections = db.exec(
                select(Connection)
                .join(ConnectionAccess)
                .where(
                    ConnectionAccess.user_id == user.id,
                    ConnectionAccess.connection_id.in_(connection_ids),
                )
            ).all()

            accessible_connection_ids = {conn.id for conn in accessible_connections}
            missing_connections = set(connection_ids) - accessible_connection_ids

            if missing_connections:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"User does not have access to connections: {list(missing_connections)}",
                )
        else:
            # Admin and Owner can access any connection
            connections = db.exec(select(Connection).where(Connection.id.in_(connection_ids))).all()

            if len(connections) != len(connection_ids):
                found_ids = {conn.id for conn in connections}
                missing_ids = set(connection_ids) - found_ids
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Connections not found: {list(missing_ids)}",
                )

        # Create the session
        chat_session = ChatSession(
            id=session_id,
            user_id=user.id,
            title=title,
            session_type=session_type,
        )
        db.add(chat_session)
        db.commit()
        db.refresh(chat_session)

        # Create session-connection associations
        for connection_id in connection_ids:
            session_connection = SessionConnection(
                session_id=session_id,
                connection_id=connection_id,
            )
            db.add(session_connection)

        db.commit()
        db.refresh(chat_session)

        logger.info(
            "session_created",
            session_id=session_id,
            user_id=user.id,
            title=title,
            session_type=session_type.value,
            connection_ids=[str(cid) for cid in connection_ids],
        )
        return chat_session

    def get_chat_session(
        self, session_id: uuid.UUID, db: Session, session_type: Optional[SessionType] = None
    ) -> Optional[ChatSession]:
        """Get a session by ID, including its associated connections and messages with elements.

        Args:
            session_id: The ID of the session to retrieve.
            db: The database session.
            session_type: Optional session type to filter by. If None, returns sessions of any type.

        Returns:
            The session with connections, messages, and message elements pre-loaded, or None if not found.
        """
        statement = (
            select(ChatSession)
            .where(ChatSession.id == session_id)
            .options(
                selectinload(ChatSession.connections), selectinload(ChatSession.messages).selectinload(Message.elements)
            )
        )

        # Only filter by session_type if specified
        if session_type is not None:
            statement = statement.where(ChatSession.session_type == session_type)
        chat_session = db.exec(statement).first()

        if chat_session and chat_session.messages:
            chat_session.messages.sort(key=lambda m: m.created_at)
            # Sort elements within each message
            for message in chat_session.messages:
                if message.elements:
                    message.elements.sort(key=lambda e: e.ordinal)

        return chat_session

    def get_user_chat_sessions(
        self,
        user_id: int,
        db: Session,
        session_type: Optional[SessionType] = None,
        offset: int = 0,
        limit: int = 20,
        search: Optional[str] = None,
        order_by: Optional[str] = "updated_at",
        order: Optional[str] = "desc",
    ) -> dict:
        """Get all sessions for a user with pagination and search.

        Args:
            user_id: The ID of the user.
            db: The database session.
            session_type: Optional session type to filter by. If None, returns sessions of any type.
            offset: The number of items to skip before starting to collect the result set.
            limit: The maximum number of items to return.
            search: Optional search term to filter sessions by title.
            order_by: Field to order by ("created_at", "updated_at", or "title"). Defaults to "created_at".
            order: Order direction ("asc" or "desc"). Defaults to "desc".

        Returns:
            A dictionary containing 'items' (list of sessions) and 'total' (total count).
        """
        # Validate input parameters
        if offset < 0:
            offset = 0
        if limit < 1:
            limit = 20
        if limit > 100:  # Prevent excessive queries
            limit = 100

        # Base statement for sessions
        statement = select(ChatSession).where(ChatSession.user_id == user_id)

        # Apply session type filter if provided
        if session_type is not None:
            statement = statement.where(ChatSession.session_type == session_type)

        # Apply search filter if provided
        if search:
            statement = statement.where(ChatSession.title.ilike(f"%{search}%"))

        # Get total count before applying limit and offset
        total_statement = select(func.count()).select_from(statement.subquery())
        total_sessions = db.exec(total_statement).one()

        # Validate and apply order_by
        valid_order_by = ["created_at", "updated_at", "title"]
        if order_by not in valid_order_by:
            order_by = "updated_at"  # Default to updated_at if invalid
        
        # Validate and apply order direction
        valid_order = ["asc", "desc"]
        if order not in valid_order:
            order = "desc"  # Default to desc if invalid
        
        # Apply ordering
        if order_by == "updated_at":
            if order == "desc":
                statement = statement.order_by(ChatSession.updated_at.desc())
            else:
                statement = statement.order_by(ChatSession.updated_at.asc())
        elif order_by == "created_at":
            if order == "desc":
                statement = statement.order_by(ChatSession.created_at.desc())
            else:
                statement = statement.order_by(ChatSession.created_at.asc())
        elif order_by == "title":
            if order == "desc":
                statement = statement.order_by(ChatSession.title.desc())
            else:
                statement = statement.order_by(ChatSession.title.asc())

        statement = statement.offset(offset).limit(limit)

        sessions = db.exec(statement).all()

        return {"items": sessions, "total": total_sessions}

    def update_chat_session(
        self,
        chat_session: ChatSession,
        new_title: str = None,
        db: Session = None,
    ) -> ChatSession:
        """
        Updates the chat session title.

        Args:
            session_id: The ID of the session to update.
            user_id: The ID of the user performing the update (for authorization).
            new_title: The new title for the session.
            db: The database session.

        Returns:
            The updated session object.

        Raises:
            HTTPException: If session is not found, user is not authorized, or
                         datastore access is denied.
        """
        if new_title:
            chat_session.title = new_title

        db.add(chat_session)
        db.commit()
        db.refresh(chat_session)

        logger.info(
            "chat_session_updated",
            session_id=chat_session.id,
            new_title=chat_session.title,
        )
        return chat_session

    def delete_chat_session(self, chat_session: ChatSession, db: Session) -> None:
        """
        Deletes a chat session and all associated messages.
        Args:
            session_id: The ID of the session to delete.
            user_id: The ID of the user performing the deletion (for authorization).
            db: The database session.
        """
        # Delete all messages associated with this session
        db.delete(chat_session)
        db.commit()
        logger.info("chat_session_deleted", session_id=chat_session.id)
        return

    def create_message(
        self,
        chat_session: ChatSession,
        role: MessageRole,
        content: Union[str, List[dict]],
        ordinal: int,
        db: Session,
        status: MessageStatus = MessageStatus.SUCCESS,
        response_error: Optional[str] = None,
    ) -> Message:
        """Create a message with its elements and save to database.

        Args:
            chat_session: The chat session to add the message to.
            role: The role of the message (USER or AI).
            elements: String or List of element dictionaries with 'type' and 'payload' keys.
            ordinal: The ordinal position of the message in the session.
            db: The database session.
            status: The status of the message (default: SUCCESS).
            response_error: Optional error message if the message failed.

        Returns:
            The created Message object.
        """
        # Create the message
        message = Message(
            ordinal=ordinal,
            role=role,
            status=status,
            response_error=response_error,
        )

        # Create elements for the message
        if isinstance(content, str):
            message_element = MessageElement(
                message_id=message.id,
                element_type=ElementType.TEXT,
                content=json.dumps({"content": content}, default=str),
                ordinal=0,
            )
            message.elements.append(message_element)
        elif isinstance(content, list):
            for index, element in enumerate(content):
                message_element = MessageElement(
                    message_id=message.id,
                    element_type=element["type"].upper(),
                    content=json.dumps(element["payload"], default=str),
                    ordinal=index,
                )
                message.elements.append(message_element)

        chat_session.messages.append(message)
        db.add(chat_session)
        db.commit()
        db.refresh(message)

        return message

    def submit_message_feedback(
        self,
        message_id: uuid.UUID,
        rating: FeedbackRating,
        comment: Optional[str],
        db: Session,
    ) -> Feedback:
        """Submits or updates feedback for a specific message.

        Args:
            message_id: The ID of the message to submit feedback for.
            rating: The feedback rating (UPVOTE or DOWNVOTE).
            comment: Optional comment for the feedback.
            db: The database session.

        Returns:
            The created or updated Feedback object.

        Raises:
            HTTPException: If the message is not found.
        """
        message = db.exec(select(Message).where(Message.id == message_id)).first()

        if not message:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=f"Message with ID {message_id} not found."
            )

        # Check if feedback already exists for this message
        existing_feedback = db.exec(select(Feedback).where(Feedback.message_id == message_id)).first()

        if existing_feedback:
            existing_feedback.rating = rating
            existing_feedback.comment = comment
            db.add(existing_feedback)
            db.commit()
            db.refresh(existing_feedback)
            logger.info("feedback_updated", message_id=message_id, rating=rating)
            return existing_feedback
        else:
            new_feedback = Feedback(
                message_id=message_id,
                rating=rating,
                comment=comment,
            )
            db.add(new_feedback)
            db.commit()
            db.refresh(new_feedback)
            logger.info("feedback_created", message_id=message_id, rating=rating)
            return new_feedback


chat_service = ChatService()
