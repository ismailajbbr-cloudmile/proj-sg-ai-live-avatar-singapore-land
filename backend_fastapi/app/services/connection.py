from datetime import datetime, UTC
from typing import List, Optional
from uuid import UUID

from fastapi import BackgroundTasks, HTTPException, status
from sqlmodel import Session, select
from sqlalchemy.orm import selectinload

from app.core.connectors import test_connection_from_creds, get_connector
from app.core.database import get_engine
from app.core.logging import logger
from app.models import (
    Connection,
    QASQLPair,
    User,
    ColumnMetadata,
    TableMetadata,
    RelationshipType,
    SyncStatus,
    TableRelationship,
)
from app.schemas import (
    ColumnUpdateRequest,
    ConnectionCreateRequest,
    ConnectionCredentialsRequest,
    ConnectionUpdateRequest,
    QASQLPairCreateRequest,
    QASQLPairUpdateRequest,
    TableUpdateRequest,
    TableRelationshipCreateRequest,
    TableRelationshipPublicResponse,
)
from app.utils.auth import encrypt_credentials


class ConnectionService:

    def create_connection(
        self,
        db: Session,
        conn_create: ConnectionCreateRequest,
        current_user: User,
        background_tasks: BackgroundTasks,
    ) -> Connection:
        """
        Creates a new connection, saves it, and schedules a background task
        to sync the schema.
        """
        encrypted_creds = encrypt_credentials(conn_create.credentials)

        connection = Connection(
            name=conn_create.name,
            description=conn_create.description,
            connector_type=conn_create.connector_type,
            credentials=encrypted_creds,
            sync_status=SyncStatus.PENDING,
        )

        # connection.users.append(current_user)  # Grant the creating user access
        db.add(connection)
        db.commit()
        db.refresh(connection)

        # Schedule the background task
        # Note: Only pass connection_id, not the session (background tasks need their own session)
        background_tasks.add_task(self.sync_connection_task, connection.id)
        logger.info(f"Scheduled schema sync for new connection_id={connection.id}")

        return connection

    def get_connection_by_id(self, db: Session, connection_id: UUID) -> Connection:
        """
        Retrieves a single connection by its ID.
        """
        connection = db.exec(
            select(Connection)
            .where(Connection.id == connection_id, Connection.deleted_at == None)
            .options(selectinload(Connection.tables))
        ).first()

        if not connection:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")

        return connection

    def list_all_connections(self, db: Session) -> List[Connection]:
        """Lists all existing connections."""
        return db.exec(select(Connection).where(Connection.deleted_at == None)).all()

    def list_connections_for_user(self, db: Session, current_user: User) -> List[Connection]:
        """Lists all connections a user has access to."""
        # Query connections directly to ensure relationship is loaded
        from app.models.association import ConnectionAccess
        statement = (
            select(Connection)
            .join(ConnectionAccess)
            .where(
                ConnectionAccess.user_id == current_user.id,
                Connection.deleted_at.is_(None)
            )
        )
        return list(db.exec(statement).all())

    def update_connection(
        self, db: Session, connection: Connection, conn_update: ConnectionUpdateRequest
    ) -> Optional[Connection]:
        """Updates a connection's details."""
        update_data = conn_update.model_dump(exclude_unset=True)
        
        # Fields that exist on the Connection model and can be updated via ConnectionUpdateRequest
        updatable_fields = {'name', 'description'}
        
        for key, value in update_data.items():
            # Only update fields that exist on the model and are settable
            if key in updatable_fields:
                try:
                    setattr(connection, key, value)
                except (AttributeError, ValueError) as e:
                    logger.warning(
                        "connection_update_field_failed",
                        field=key,
                        connection_id=str(connection.id),
                        error=str(e)
                    )

        connection.updated_at = datetime.now(UTC)
        db.add(connection)
        db.commit()
        db.refresh(connection)
        return connection

    def delete_connection(self, db: Session, connection: Connection):
        """Soft deletes a connection by setting the deleted_at timestamp."""
        connection.deleted_at = datetime.now(UTC)
        db.add(connection)
        db.commit()
        return

    def test_connection(self, conn_creds: ConnectionCredentialsRequest) -> dict:
        """
        Tests connection credentials without saving them.
        """
        try:
            test_connection_from_creds(conn_creds)
            return {"status": "success", "message": "Connection test successful"}
        except Exception as e:
            logger.error(f"Connection test failed: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Connection test failed: {str(e)}",
            )

    def get_users_with_access(self, db: Session, connection: Connection) -> List[User]:
        """Retrieves all users who have access to a specific connection."""
        return connection.users

    def grant_user_access(self, db: Session, connection: Connection, user_id: int):
        """Grants a user access to a specific connection."""
        user = db.get(User, user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        if user in connection.users:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already has access")

        connection.users.append(user)
        db.add(connection)
        db.commit()
        return {"message": "User access granted successfully"}

    def remove_user_access(self, db: Session, connection: Connection, user_id: int):
        """Removes a user's access from a specific connection."""
        user = db.get(User, user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        if user not in connection.users:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User does not have access")

        connection.users.remove(user)
        db.add(connection)
        db.commit()
        return {"message": "User access removed successfully"}

    def sync_connection(self, connection: Connection):
        """Syncs a connection's schema."""
        connector = get_connector(connection.connector_type)
        connector.sync_connection(connection_id=connection.id)
        return {"message": "Connection synced successfully"}

connection_service = ConnectionService()
