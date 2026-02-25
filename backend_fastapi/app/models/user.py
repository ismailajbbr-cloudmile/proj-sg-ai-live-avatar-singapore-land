import bcrypt
import enum

from datetime import datetime, UTC
from sqlmodel import Field, Relationship, SQLModel
from typing import List, Optional, TYPE_CHECKING

from app.models.association import ConnectionAccess, SessionConnection

if TYPE_CHECKING:
    from app.models.chat import ChatSession, Feedback
    from app.models.connection import Connection


class UserRole(str, enum.Enum):
    OWNER = "OWNER"
    ADMIN = "ADMIN"
    USER = "USER"


class User(SQLModel, table=True):
    id: int = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    hashed_password: Optional[str] = Field(default=None)
    role: UserRole = Field(default=UserRole.USER)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    password_reset_token: Optional[str] = Field(default=None, index=True)
    password_reset_token_expires_at: Optional[datetime] = Field(default=None)

    # Foreign keys
    mall_id: Optional[int] = Field(default=None, foreign_key="mall.id")

    # Relationships
    chat_sessions: List["ChatSession"] = Relationship(back_populates="user")
    mall: Optional["Mall"] = Relationship(back_populates="users")
    connections: List["Connection"] = Relationship(back_populates="users", link_model=ConnectionAccess)

    def verify_password(self, password: str) -> bool:
        """Verify if the provided password matches the hash."""
        if not self.hashed_password:
            return False
        return bcrypt.checkpw(password.encode("utf-8"), self.hashed_password.encode("utf-8"))
    
    @staticmethod
    def hash_password(password: str) -> str:
        """Hash a password using bcrypt."""
        salt = bcrypt.gensalt()
        return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")



class Mall(SQLModel, table=True):
    id: int = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    address: str = Field(default=None)
    phone: str = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    # Relationships
    users: List["User"] = Relationship(back_populates="mall")