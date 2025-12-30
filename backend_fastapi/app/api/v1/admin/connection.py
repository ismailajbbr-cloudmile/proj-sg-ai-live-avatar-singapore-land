from sqlmodel import Session
from typing import List, Dict, Any

from fastapi import APIRouter, Depends, BackgroundTasks, Request, status, Response
from app.core.config import settings
from app.core.database import get_db
from app.core.limiter import limiter
from app.core.dependencies import get_current_user, get_current_admin_user, get_connection
from app.schemas import (
    ConnectionCreateRequest,
    ConnectionDetailsResponse,
    ConnectionInfoResponse,
    ConnectionUpdateRequest,
    ConnectionCredentialsRequest,
    connector_credential_schemas,
)
from app.services.connection_service import connection_service
from app.models import User, UserRole, Connection, ConnectorType

router = APIRouter()


@router.post("", response_model=ConnectionInfoResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.RATE_LIMIT_ENDPOINTS["chat"][0])
def create_new_connection(
    request: Request,
    conn_create: ConnectionCreateRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """
    Creates a new data source connection. **Admin or Owner only**.
    Schema synchronization is triggered in the background.
    """
    return connection_service.create_connection(
        db=db,
        conn_create=conn_create,
        current_user=current_user,
        background_tasks=background_tasks,
    )


@router.get("", response_model=List[ConnectionInfoResponse])
@limiter.limit(settings.RATE_LIMIT_ENDPOINTS["chat"][0])
def list_all_connections(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Lists all connections the authenticated user has access to.
    Owners and Admins see all connections; other users see only their assigned connections.
    """
    if current_user.role in (UserRole.ADMIN, UserRole.OWNER):
        return connection_service.list_all_connections(db=db)
    return connection_service.list_connections_for_user(db=db, current_user=current_user)


@router.get("/form-schema", response_model=Dict[ConnectorType, Dict[str, Any]])
def get_connection_form_schema(
    request: Request,
    current_user: User = Depends(get_current_admin_user),
):
    """
    Get the JSON schema for the credentials required for each connector type.
    This is useful for dynamically generating forms on the frontend. **Admin or Owner only**.
    """
    schemas = {}
    for connector_type, model in connector_credential_schemas.items():
        schemas[connector_type] = model.model_json_schema()
    return schemas


@router.post("/test", status_code=status.HTTP_200_OK)
def test_connection(
    request: Request,
    credentials: ConnectionCredentialsRequest,
    current_user: User = Depends(get_current_admin_user),
):
    """
    Tests connection credentials without saving them. **Admin or Owner only**.
    """
    return connection_service.test_connection(credentials)


@router.put("/{connection_id}", response_model=ConnectionDetailsResponse)
def update_existing_connection(
    request: Request,
    conn_update: ConnectionUpdateRequest,
    connection: Connection = Depends(get_connection),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """
    Updates a connection's details. **Admin or Owner only**.
    """
    return connection_service.update_connection(db=db, connection=connection, conn_update=conn_update)


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_existing_connection(
    request: Request,
    connection: Connection = Depends(get_connection),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """
    Deletes a data source connection. **Admin or Owner only**.
    """
    connection_service.delete_connection(db=db, connection=connection)
    return Response(status_code=status.HTTP_204_NO_CONTENT)