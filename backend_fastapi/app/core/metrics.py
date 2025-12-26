"""Prometheus metrics configuration and instrumentation."""
from typing import Optional, Any
from app.core.logging import logger

# Global Prometheus instrumentator instance
prometheus_instrumentator: Optional[Any] = None


def init_prometheus_instrumentator() -> None:
    """Initialize Prometheus FastAPI instrumentator.
    
    This function initializes the prometheus-fastapi-instrumentator which
    automatically collects metrics for all HTTP requests.
    
    The instrumentator automatically tracks:
    - HTTP request count (by method, path, status code)
    - HTTP request duration (histogram)
    - In-progress requests (gauge)
    
    Raises:
        ImportError: If prometheus-fastapi-instrumentator package is not installed.
    """
    global prometheus_instrumentator
    
    try:
        from prometheus_fastapi_instrumentator import Instrumentator
        
        # Create instrumentator with custom configuration
        prometheus_instrumentator = Instrumentator(
            should_group_status_codes=False,  # Don't group status codes (200, 201, etc. separately)
            should_ignore_untemplated=True,   # Ignore routes without path templates
            should_instrument_requests_inprogress=True,  # Track in-progress requests
            excluded_handlers=["/health", "/metrics"],  # Exclude these paths
            inprogress_name="http_requests_inprogress",
            inprogress_labels=True,
        )
        
        logger.info("prometheus_instrumentator_initialized")
        
    except ImportError:
        logger.warning(
            "prometheus_instrumentator_not_installed",
            message="prometheus-fastapi-instrumentator not installed. Install with: pip install prometheus-fastapi-instrumentator",
        )
    except Exception as e:
        logger.error("prometheus_instrumentator_initialization_failed", error=str(e), exc_info=True)


def get_prometheus_instrumentator():
    """Get the Prometheus instrumentator instance.
    
    Returns:
        Optional[Instrumentator]: The Prometheus instrumentator if initialized, None otherwise.
    """
    return prometheus_instrumentator


def setup_prometheus_instrumentation(app) -> None:
    """Set up Prometheus instrumentation on the FastAPI app.
    
    Args:
        app: FastAPI application instance
        
    Note:
        This should be called after the app is created but before it starts running.
        The instrumentator will automatically:
        - Add middleware to track HTTP requests
        - Expose /metrics endpoint (includes both automatic HTTP metrics AND custom metrics)
        - Collect standard HTTP metrics
        
        The /metrics endpoint will include:
        - Automatic HTTP metrics from instrumentator
        - Custom business metrics defined in this module (LLM, DB, etc.)
    """
    global prometheus_instrumentator
    
    if not prometheus_instrumentator:
        init_prometheus_instrumentator()
    
    if prometheus_instrumentator:
        try:
            # Instrument the app (adds middleware and /metrics endpoint)
            # The /metrics endpoint will automatically include ALL metrics:
            # - Automatic HTTP metrics from instrumentator
            # - Custom metrics from this module (llm_*, db_*, etc.)
            prometheus_instrumentator.instrument(app).expose(app)
            logger.info("prometheus_instrumentation_enabled")
        except Exception as e:
            logger.error("prometheus_instrumentation_failed", error=str(e), exc_info=True)

