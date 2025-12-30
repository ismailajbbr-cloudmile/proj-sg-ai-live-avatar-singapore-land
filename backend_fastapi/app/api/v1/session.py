import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session
from typing import List, Optional

from app.core.config import settings
from app.core.database import get_db
from app.core.limiter import limiter
from app.core.logging import logger
from app.core.dependencies import get_current_user, get_current_chat_session, get_shared_chat_session
from app.models import ChatSession, User, SessionType
from app.schemas.chat import (
    ChatSessionCreateRequest,
    ChatSessionUpdateRequest,
    ChatSessionListResponse,
    ChatSessionResponse,
    ChatSessionDetailResponse,
    ChatSessionShareResponse,
    MessageResponse,
    MessageRole,
)
from app.services import chat_service
from app.utils.sanitization import sanitize_string

router = APIRouter()


@router.post("", response_model=ChatSessionDetailResponse)
@limiter.limit(settings.RATE_LIMIT_ENDPOINTS["chat"][0])
async def create_chat_session(
    request: Request,
    create_request: ChatSessionCreateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new chat session for the authenticated user.

    Args:
        request: The FastAPI request object for rate limiting.
        create_request: The chat session creation request containing title and connection ID
        user: The authenticated user

    Returns:
        ChatSessionDetailResponse: The session ID, title, and connection info
    """
    try:
        # Generate a unique session ID
        session_id = uuid.uuid4()

        # Create session in database
        chat_session = chat_service.create_chat_session(
            session_id=session_id,
            user=user,
            title=create_request.title,
            connection_ids=create_request.connection_ids,
            session_type=create_request.session_type,
            db=db,
        )

        logger.info("session_created", session_id=session_id, user_id=user.id, title=chat_session.title)

        return ChatSessionDetailResponse(
            id=chat_session.id,
            title=chat_session.title,
            session_type=chat_session.session_type,
            connections=chat_session.connections,
            messages=chat_session.messages,
        )
    except ValueError as ve:
        logger.error("session_creation_validation_failed", error=str(ve), user_id=user.id, exc_info=True)
        raise HTTPException(status_code=422, detail=str(ve))


@router.patch("/{session_id}", response_model=ChatSessionDetailResponse)
@limiter.limit(settings.RATE_LIMIT_ENDPOINTS["chat"][0])
async def update_chat_session(
    request: Request,
    update_request: ChatSessionUpdateRequest,
    chat_session: ChatSession = Depends(get_current_chat_session),
    db: Session = Depends(get_db),
):
    """Update a chat session's title."""
    try:
        chat_session = chat_service.update_chat_session(
            chat_session=chat_session,
            new_title=update_request.title,
            db=db,
        )

        return ChatSessionDetailResponse(
            id=chat_session.id,
            title=chat_session.title,
            session_type=chat_session.session_type,
            connections=chat_session.connections,
            messages=chat_session.messages,
        )
    except ValueError as ve:
        logger.error("session_update_validation_failed", error=str(ve), session_id=chat_session.id, exc_info=True)
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        logger.error("session_update_failed", error=str(e), session_id=chat_session.id, exc_info=True)
        raise HTTPException(status_code=500, detail="Could not update session.")


@router.delete("/{session_id}", status_code=204)
@limiter.limit(settings.RATE_LIMIT_ENDPOINTS["chat"][0])
async def delete_session(
    request: Request,
    chat_session: ChatSession = Depends(get_current_chat_session),
    db: Session = Depends(get_db),
):
    """Delete a chat session for the authenticated user.

    Args:
        chat_session: The current chat session

    Raises:
        HTTPException: If the session does not exist or belongs to another user
    """
    try:
        chat_service.delete_chat_session(chat_session=chat_session, db=db)
        logger.info("session_deleted", session_id=chat_session.id)
    except ValueError as ve:
        logger.error("session_deletion_validation_failed", error=str(ve), session_id=chat_session.id, exc_info=True)
        raise HTTPException(status_code=422, detail=str(ve))


@router.get("", response_model=ChatSessionListResponse)
@limiter.limit(settings.RATE_LIMIT_ENDPOINTS["chat"][0])
async def get_user_sessions(
    request: Request,
    offset: int = 0,
    limit: int = 20,
    session_type: Optional[SessionType] = None,
    search: Optional[str] = None,
    order_by: Optional[str] = "created_at",
    order: Optional[str] = "desc",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all chat session IDs for the authenticated user with pagination and search.

    Args:
        offset: The number of items to skip before starting to collect the result set.
        limit: The maximum number of items to return.
        session_type: Optional session type to filter by. If None, returns sessions of any type.
        search: Optional search term to filter sessions by title.
        order_by: Field to order by ("created_at" or "title"). Defaults to "created_at".
        order: Order direction ("asc" or "desc"). Defaults to "desc".
        user: The authenticated user

    Returns:
        ChatSessionListResponse: A list of chat session IDs and total count.
    """
    try:
        # Sanitize search if provided
        if search:
            search = sanitize_string(search)
            # If search is empty after sanitization, set to None
            if not search:
                search = None
        
        # Validation for order_by and order is handled in chat_service
        sessions_data = chat_service.get_user_chat_sessions(
            user_id=user.id,
            session_type=session_type,
            offset=offset,
            limit=limit,
            search=search,
            order_by=order_by,
            order=order,
            db=db,
        )
        return ChatSessionListResponse(
            sessions=[
                ChatSessionResponse(
                    id=session.id,  # Use alias 'id' as defined in schema (alias="id")
                    title=sanitize_string(session.title),
                    session_type=session.session_type,
                )
                for session in sessions_data["items"]
            ],
            total=sessions_data["total"],
        )
    except ValueError as ve:
        logger.error("get_sessions_validation_failed", user_id=user.id, error=str(ve), exc_info=True)
        raise HTTPException(status_code=422, detail=str(ve))


@router.get("/{session_id}", response_model=ChatSessionDetailResponse)
@limiter.limit(settings.RATE_LIMIT_ENDPOINTS["chat"][0])
async def get_chat_session(request: Request, chat_session: ChatSession = Depends(get_current_chat_session)):
    """Get all details for a chat session, including connection info and messages.

    Args:
        request: The FastAPI request object for rate limiting.
        chat_session: The current chat session.

    Returns:
        ChatSessionDetailResponse: All details for the chat session.

    Raises:
        HTTPException: If there's an error retrieving the chat session details.
    """
    try:
        # Populate EXPLORE-specific fields if session type is EXPLORE
        if chat_session.session_type == SessionType.EXPLORE:
            messages = []
            for message in chat_session.messages:
                if message.role == MessageRole.AI:
                    messages.append(chat_service.to_explore_message_response(message))
                else:
                    messages.append(MessageResponse.model_validate(message))
        else:
            messages = chat_session.messages
        return ChatSessionDetailResponse(
            id=chat_session.id,
            title=chat_session.title,
            session_type=chat_session.session_type,
            connections=chat_session.connections,
            messages=messages,
        )
    except Exception as e:
        logger.error("get_session_failed", session_id=chat_session.id, error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))



@router.post("/{session_id}/messages/{message_id}/feedback", response_model=FeedbackResponse)
@limiter.limit(settings.RATE_LIMIT_ENDPOINTS["chat"][0])
async def submit_feedback(
    request: Request,
    message_id: uuid.UUID,
    feedback_request: FeedbackCreateRequest,
    chat_session: ChatSession = Depends(get_current_chat_session),
    db: Session = Depends(get_db),
):
    """Submit feedback for a specific message.

    Args:
        request: The FastAPI request object for rate limiting.
        message_id: The ID of the message to submit feedback for.
        feedback_request: The feedback request containing rating and optional comment.
        chat_session: The current chat session (ensures user access).
        db: The database session.

    Raises:
        HTTPException: If the message is not found or feedback already exists.
    """
    try:
        # Verify the message belongs to the current chat session
        message_found = False
        for message in chat_session.messages:
            if message.id == message_id:
                message_found = True
                break
        if not message_found:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found in this session.")

        feedback = chat_service.submit_message_feedback(
            message_id=message_id,
            rating=feedback_request.rating,
            comment=feedback_request.comment,
            db=db,
        )
        logger.info("feedback_submitted", message_id=message_id, rating=feedback_request.rating)
        return feedback
    except HTTPException as e:
        raise e
    except ValueError as ve:
        logger.error("feedback_submission_validation_failed", message_id=message_id, error=str(ve), exc_info=True)
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        logger.error("feedback_submission_failed", message_id=message_id, error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Could not submit feedback.")
