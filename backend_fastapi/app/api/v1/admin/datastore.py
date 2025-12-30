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



# create new datastore
@router.post("", response_model=DatastoreResponse, status_code=status.HTTP_201_CREATED)
def create_new_datastore(
    request: Request,
    datastore: DatastoreCreateRequest,
    current_user: User = Depends(get_current_admin_user),
):
    return datastore_service.create_datastore(datastore)

# delete datastore
@router.delete("/{datastore_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_datastore(
    request: Request,
    datastore_id: UUID,
    current_user: User = Depends(get_current_admin_user),
):
    return datastore_service.delete_datastore(datastore_id)


# add record to datastore
@router.post("/{datastore_id}/records", response_model=RecordResponse, status_code=status.HTTP_201_CREATED)
def add_record_to_datastore(
    request: Request,
    datastore_id: UUID,
    record: RecordCreateRequest,
    current_user: User = Depends(get_current_admin_user),
):
    return datastore_service.add_record(datastore_id, record)


# delete record from datastore
@router.delete("/{datastore_id}/records/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_record_from_datastore(
    request: Request,
    datastore_id: UUID,
    record_id: UUID,
    current_user: User = Depends(get_current_admin_user),
):
    return datastore_service.delete_record(datastore_id, record_id)


# update record in datastore
@router.put("/{datastore_id}/records/{record_id}", response_model=RecordResponse)
def update_record_in_datastore(
    request: Request,
    datastore_id: UUID,
    record_id: UUID,
    record: RecordUpdateRequest,
    current_user: User = Depends(get_current_admin_user),
):
    return datastore_service.update_record(datastore_id, record_id, record)


# refresh datastore
@router.post("/{datastore_id}/refresh", status_code=status.HTTP_202_ACCEPTED)
def refresh_datastore(
    request: Request,
    datastore_id: UUID,
    current_user: User = Depends(get_current_admin_user),
):
    return datastore_service.refresh_datastore(datastore_id)