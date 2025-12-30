import enum
from datetime import datetime, UTC
from typing import List, Optional, TYPE_CHECKING
from uuid import UUID, uuid4

from sqlmodel import Field, JSON, Relationship, SQLModel, Column
from app.models.association import ConnectionAccess, SessionConnection

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.chat import ChatSession
    from app.models.association import ConnectionAccess


class ConnectorType(str, enum.Enum):
    POSTGRESQL = "POSTGRESQL"
    BIGQUERY = "BIGQUERY"
    VERTEX_AI_SEARCH = "VERTEX_AI_SEARCH"


class SyncStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"


class Connection(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    name: str
    description: Optional[str] = None
    connector_type: ConnectorType
    credentials: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    deleted_at: Optional[datetime] = Field(default=None)
    sync_status: SyncStatus = Field(default=SyncStatus.PENDING)
    sync_error_message: Optional[str] = Field(default=None)

    # Relationships
    users: List["User"] = Relationship(back_populates="connections", link_model=ConnectionAccess)
    chat_sessions: List["ChatSession"] = Relationship(back_populates="connections", link_model=SessionConnection)