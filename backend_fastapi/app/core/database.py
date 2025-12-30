from typing import Generator

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import QueuePool
from sqlalchemy import Engine
from sqlmodel import Session, create_engine, select, text

from app.core.config import settings
from app.core.logging import logger

engine: Engine | None = None


def init_db() -> None:
    """Initialize the database engine and test the connection."""
    global engine
    
    if not settings.POSTGRES_URL:
        raise RuntimeError("POSTGRES_URL is not configured in environment variables.")
    
    try:
        pool_size = settings.POSTGRES_POOL_SIZE
        max_overflow = settings.POSTGRES_MAX_OVERFLOW

        engine = create_engine(
            settings.POSTGRES_URL,
            pool_pre_ping=True,
            poolclass=QueuePool,
            pool_size=pool_size,
            max_overflow=max_overflow,
            pool_timeout=30,
            pool_recycle=1800,
        )

        # Test the connection on startup
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            logger.info("Database connection has been successfully established.")

        logger.info(
            "database_engine_initialized",
            environment=settings.ENVIRONMENT.value,
            pool_size=pool_size,
            max_overflow=max_overflow,
        )

    except SQLAlchemyError as e:
        logger.critical("database_connection_failed", error=str(e))
        raise RuntimeError(
            "Application startup failed: Could not connect to the database."
        ) from e


def close_db() -> None:
    """Close the database engine and dispose of all connections."""
    global engine
    if engine:
        engine.dispose()
        engine = None
        logger.info("Database connection has been successfully closed.")


def get_engine() -> Engine:
    """Get the database engine instance.
    
    Returns:
        Engine: The database engine instance
        
    Raises:
        RuntimeError: If database engine is not initialized
    """
    if not engine:
        raise RuntimeError("Database engine is not initialized. Call init_db() first.")
    return engine

# Dependency Ingestion: Generator[Yield Type, SendType, ReturnType]
def get_db() -> Generator[Session, None, None]: 
    """Database dependency that provides a database session and handles cleanup.
    
    Yields:
        Session: SQLModel database session
        
    Raises:
        RuntimeError: If database engine is not initialized
    """
    if not engine:
        raise RuntimeError("Database engine is not initialized. Call init_db() first.")

    with Session(engine) as session:
        try:
            yield session
        except Exception:
            session.rollback()
            raise


def health_check() -> bool:
    """Check database connection health.
    
    Note: This is a synchronous function. If called from async endpoints,
    FastAPI will handle it, but it will briefly block the event loop.
    For high-traffic scenarios, consider using AsyncSession instead.

    Returns:
        bool: True if database is healthy, False otherwise
    """
    if not engine:
        return False

    try:
        with Session(engine) as session:
            session.exec(select(1)).first()
            return True
    except Exception as e:
        logger.error("database_health_check_failed", error=str(e))
        return False
