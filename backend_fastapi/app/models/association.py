from typing import Optional
from uuid import UUID

from sqlmodel import Field, SQLModel


class ConnectionAccess(SQLModel, table=True):
    """Association table: which users can access which connections."""
    __tablename__ = "connection_access"

    user_id: Optional[int] = Field(default=None, foreign_key="user.id", primary_key=True)
    connection_id: Optional[UUID] = Field(default=None, foreign_key="connection.id", primary_key=True)


class SessionConnection(SQLModel, table=True):
    """Association table: which connections are linked to which chat sessions."""
    __tablename__ = "session_connection"

    chat_session_id: Optional[UUID] = Field(default=None, foreign_key="chat_session.id", primary_key=True)
    connection_id: Optional[UUID] = Field(default=None, foreign_key="connection.id", primary_key=True)
