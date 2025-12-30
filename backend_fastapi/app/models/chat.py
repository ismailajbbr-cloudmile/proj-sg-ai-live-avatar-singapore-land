import enum
from datetime import datetime, UTC
from typing import Any, Dict, List, Optional, TYPE_CHECKING
from uuid import UUID, uuid4

from sqlmodel import Field, Relationship, SQLModel
from app.models.association import SessionConnection

if TYPE_CHECKING:
    from app.models.connection import Connection
    from app.models.user import User


class SessionType(str, enum.Enum):
    CHAT = "CHAT"

class MessageRole(str, enum.Enum):
    USER = "USER"
    AI = "AI"


class MessageStatus(str, enum.Enum):
    """Represents the processing status of an AI-generated message."""

    PROCESSING = "PROCESSING"
    SUCCESS = "SUCCESS"
    ERROR = "ERROR"


class ElementType(str, enum.Enum):
    """Type of message element.
    
    Each element type has a specific content structure:
    - TEXT: {"content": "..."}
    - TABLE: {"sql": "...", "data": [...]}
    - CHART: {"config": {...}, "python_code": "..." (optional)}
    """
    TEXT = "TEXT"
    AUDIO = "AUDIO"  # audio URL
    TABLE = "TABLE"  # SQL/table pairs
    IMAGE = "IMAGE"  # image URL
    VIDEO = "VIDEO"  # video URL
    FILE = "FILE"  # file URL
    LINK = "LINK"  # link URL
    CODE = "CODE"  # code block
    CHART = "CHART"  # chart.js config


class FeedbackRating(str, enum.Enum):
    UPVOTE = "UPVOTE"
    DOWNVOTE = "DOWNVOTE"


class ChatSession(SQLModel, table=True):
    __tablename__ = "chat_session"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    title: str
    session_type: SessionType = Field(default=SessionType.EXPLORE)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    # Relationships
    user_id: int = Field(foreign_key="user.id")
    user: "User" = Relationship(back_populates="chat_sessions")
    connections: List["Connection"] = Relationship(back_populates="chat_sessions", link_model=SessionConnection)
    messages: List["Message"] = Relationship(
        back_populates="chat_session", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )


class Message(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    ordinal: int  # The order of the message in the chat
    role: MessageRole
    status: Optional[MessageStatus] = None  # Null for user messages
    response_error: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    # Relationships
    chat_session_id: UUID = Field(foreign_key="chat_session.id")
    chat_session: ChatSession = Relationship(back_populates="messages")
    elements: List["MessageElement"] = Relationship(
        back_populates="message", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )
    feedback: Optional["Feedback"] = Relationship(
        back_populates="message", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )


class MessageElement(SQLModel, table=True):
    __tablename__ = "message_element"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    message_id: UUID = Field(foreign_key="message.id")
    element_type: ElementType
    ordinal: int  # Order within the message
    content: Optional[str] = None  # Content formatted as JSON string
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    # Relationship
    message: "Message" = Relationship(back_populates="elements")


class Feedback(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    rating: FeedbackRating
    comment: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    # Relationships
    message_id: UUID = Field(foreign_key="message.id", unique=True)
    message: Message = Relationship(back_populates="feedback")