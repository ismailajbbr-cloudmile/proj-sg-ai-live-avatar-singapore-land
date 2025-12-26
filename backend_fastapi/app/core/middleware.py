"""Middleware configuration for the FastAPI application."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.core.config import settings
from app.core.limiter import limiter
from app.core.metrics import setup_prometheus_instrumentation


def setup_middleware(app: FastAPI) -> None:
    """Set up all middleware for the FastAPI application.
    
    Args:
        app: FastAPI application instance
        
    Note:
        Middleware order matters:
        1. CORS should be early to handle preflight requests
        2. Session middleware for OAuth state management
        3. Prometheus instrumentation adds metrics middleware
        4. Rate limiter uses decorators, not middleware
        
    Note on Request Body Size:
        FastAPI/Starlette has a default 1MB request body size limit.
        This is enforced at the ASGI level and cannot be easily changed via middleware.
        We use schema-level validation (100KB message limit) to prevent abuse.
        If larger payloads are needed, consider using file upload endpoints or
        streaming/chunked requests.
    """
    # CORS middleware - must be early to handle preflight requests
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Session middleware - required for OAuth state management
    # Note: Authentication tokens are stored as direct cookies, but OAuth library
    # uses sessions for managing OAuth flow state
    if not settings.SESSION_SECRET:
        raise ValueError(
            "SESSION_SECRET must be configured in environment variables. "
            "OAuth flow requires session support. "
            "Set SESSION_SECRET in your .env file."
        )
    
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.SESSION_SECRET,
        max_age=int(settings.SESSION_MAX_AGE),
        same_site="lax",
        https_only=settings.IS_PRODUCTION,
        session_cookie="session",
    )

    # Prometheus instrumentation
    setup_prometheus_instrumentation(app)

    # Rate limiter (uses decorators, not middleware)
    app.state.limiter = limiter

