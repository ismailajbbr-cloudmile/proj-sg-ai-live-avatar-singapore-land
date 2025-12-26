
from fastapi import FastAPI, Request
from contextlib import asynccontextmanager
from app.core.config import settings
from app.core.logging import logger
from app.core.limiter import limiter
from app.core.middleware import setup_middleware
from app.api.v1.api import api_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle application startup and shutdown events."""
    logger.info(
        "application_startup",
        project_name=settings.PROJECT_NAME,
        version=settings.VERSION,
        api_prefix=settings.API_V1_STR,
    )

    yield

    logger.info("application_shutdown")



app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=settings.DESCRIPTION,
    lifespan=lifespan,
)

# Setup middleware
setup_middleware(app)


# Setup routers
app.include_router(api_router, prefix=settings.API_V1_STR)

# Root routes
@app.get("/")
@limiter.limit(settings.RATE_LIMIT_ENDPOINTS["root"])
async def root(request: Request):
    """Root endpoint returning basic API information."""
    # logger.info("root_endpoint_called")
    return {
        "name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "healthy",
        "environment": settings.ENVIRONMENT.value,
        "swagger_url": "/docs",
        "redoc_url": "/redoc",
    }