import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from app.ai.agents import ExploreAgent
from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_explore_session
from app.core.limiter import limiter
from app.core.logging import logger
from app.models import ChatSession, MessageRole, MessageStatus
from app.schemas.chat import ChatRequest, MessageResponse, StreamResponse
from app.services import chat_service

router = APIRouter()


@router.post("/{session_id}/chat", response_model=MessageResponse)
@limiter.limit(settings.RATE_LIMIT_ENDPOINTS["chat"][0])
async def chat(
    request: Request,
    chat_request: ChatRequest,
    explore_session: ChatSession = Depends(get_current_explore_session),
    db: Session = Depends(get_db),
):
    """Process a chat request using the Explore Agent.

    Args:
        request: The FastAPI request object for rate limiting.
        chat_request: The chat request containing messages.
        explore_session: The current chat session.
        db: The database session.

    Returns:
        MessageResponse: The processed chat response.

    Raises:
        HTTPException: If there's an error processing the request or if trying to send to shared session.
    """
    try:
        logger.info("chat_request_received", session_id=explore_session.id)

        agent = ChatAgent()

        # Determine the ordinal for the new messages
        next_ordinal = len(explore_session.messages)

        # Save user message to database
        chat_service.create_message(
            chat_session=explore_session,
            role=MessageRole.USER,
            content=chat_request.message,
            ordinal=next_ordinal,
            db=db,
        )

        # Get AI response
        try:
            # Use the first connection for the agent (for backward compatibility)
            primary_connection = explore_session.connections[0] if explore_session.connections else None
            if not primary_connection:
                raise Exception("No connections available for this session")

            ai_response = await agent.get_response(
                chat_request.message,
                session_id=str(explore_session.id),
                connection_id=str(primary_connection.id),
                user_id=str(explore_session.user_id),
            )

            # Create AI message with elements from response
            # ai_response is a list of response blocks from the agent
            if ai_response and isinstance(ai_response, list) and len(ai_response) > 0:
                ai_message = chat_service.create_message(
                    chat_session=explore_session,
                    role=MessageRole.AI,
                    content=ai_response,
                    ordinal=next_ordinal + 1,
                    db=db,
                )
            else:
                ai_message = chat_service.create_message(
                    chat_session=explore_session,
                    role=MessageRole.AI,
                    content=[],
                    ordinal=next_ordinal + 1,
                    db=db,
                    status=MessageStatus.ERROR,
                    response_error="No response from AI agent.",
                )
        except Exception as e:
            ai_message = chat_service.create_message(
                chat_session=explore_session,
                role=MessageRole.AI,
                content=[],
                ordinal=next_ordinal + 1,
                db=db,
                status=MessageStatus.ERROR,
                response_error=str(e),
            )

        db.commit()
        db.refresh(explore_session)

        logger.info("chat_request_processed", session_id=explore_session.id)

        # Convert message to EXPLORE-specific response format
        explore_message_response = chat_service.to_explore_message_response(ai_message)

        return explore_message_response
    except Exception as e:
        logger.error("chat_request_failed", session_id=explore_session.id, error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{session_id}/chat/stream")
@limiter.limit(settings.RATE_LIMIT_ENDPOINTS["chat_stream"][0])
async def chat_stream(
    request: Request,
    chat_request: ChatRequest,
    explore_session: ChatSession = Depends(get_current_explore_session),
    db: Session = Depends(get_db),
):
    """Process a chat request using LangGraph with streaming response.

    Args:
        request: The FastAPI request object for rate limiting.
        chat_request: The chat request containing messages.
        explore_session: The current session.

    Returns:
        StreamingResponse: A streaming response of the chat completion.

    Raises:
        HTTPException: If there's an error processing the request.
    """
    try:
        logger.info("stream_chat_request_received", session_id=explore_session.id)

        async def event_generator():
            """Generate streaming events.

            Yields:
                str: Server-sent events in JSON format.

            Raises:
                Exception: If there's an error during streaming.
            """
            import asyncio
            
            agent = ExploreAgent()

            # Determine the ordinal for the new messages
            next_ordinal = len(explore_session.messages)

            # Save user message to database
            chat_service.create_message(
                chat_session=explore_session,
                role=MessageRole.USER,
                content=chat_request.message,
                ordinal=next_ordinal,
                db=db,
            )

            # Get AI response
            try:
                # Use the first connection for the agent (for backward compatibility)
                primary_connection = explore_session.connections[0] if explore_session.connections else None
                if not primary_connection:
                    raise Exception("No connections available for this session")

                # Send initial heartbeat to establish connection
                yield f"data: {json.dumps({'heartbeat': True, 'done': False}, default=str)}\n\n"
                
                last_yield_time = asyncio.get_event_loop().time()
                heartbeat_interval = 25  # Send heartbeat every 25 seconds if no data
                
                async for update in agent.get_stream_response(
                    chat_request.message,
                    session_id=str(explore_session.id),
                    connection_id=str(primary_connection.id),
                    user_id=str(explore_session.user_id),
                ):
                    # Check if client disconnected
                    if await request.is_disconnected():
                        logger.info("client_disconnected_during_stream", session_id=explore_session.id)
                        return
                    
                    current_time = asyncio.get_event_loop().time()
                    # Send heartbeat if it's been too long since last yield
                    if current_time - last_yield_time >= heartbeat_interval:
                        yield f"data: {json.dumps({'heartbeat': True, 'done': False}, default=str)}\n\n"
                        last_yield_time = current_time
                    
                    for _, state_update in update.items():
                        for key, value in state_update.items():
                            if key == "action_history":
                                action_response = {"action": value, "done": False}
                                yield f"data: {json.dumps(action_response, default=str)}\n\n"
                                last_yield_time = asyncio.get_event_loop().time()
                            elif key == "final_response":
                                # Create message elements from final response
                                ai_message = chat_service.create_message(
                                    chat_session=explore_session,
                                    role=MessageRole.AI,
                                    content=value,
                                    ordinal=next_ordinal + 1,
                                    db=db,
                                )
                                last_yield_time = asyncio.get_event_loop().time()

                # Send full response using MessageResponse schema
                explore_message_response = chat_service.to_explore_message_response(ai_message)
                message_response = {"message": explore_message_response.model_dump(), "done": False}
                yield f"data: {json.dumps(message_response, default=str)}\n\n"

                logger.info("chat_request_processed", session_id=explore_session.id)

                # Send final message indicating completion
                yield f"data: {json.dumps({'done': True}, default=str)}\n\n"

            except asyncio.CancelledError:
                # Client disconnected or request cancelled - this is expected behavior
                logger.info("stream_cancelled", session_id=explore_session.id)
                raise  # Re-raise to properly handle cancellation
            except Exception as e:
                logger.error(
                    "stream_chat_request_failed",
                    session_id=explore_session.id,
                    error=str(e),
                    exc_info=True,
                )
                # Create error message
                ai_message = chat_service.create_message(
                    chat_session=explore_session,
                    role=MessageRole.AI,
                    content=[],
                    ordinal=next_ordinal + 1,
                    db=db,
                    status=MessageStatus.ERROR,
                    response_error=str(e),
                )
                error_response = StreamResponse(content=str(e), done=True)
                yield f"data: {json.dumps(error_response.model_dump())}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",  # Disable buffering in nginx
            }
        )

    except Exception as e:
        logger.error(
            "stream_chat_request_failed",
            session_id=explore_session.id,
            error=str(e),
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail=str(e))
