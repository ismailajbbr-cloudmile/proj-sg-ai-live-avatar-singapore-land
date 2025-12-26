from pathlib import Path
import logging
import sys
import json
import re
import threading
from typing import (
    Any,
    Dict,
    List,
    Optional,
)
import structlog
from app.core.config import Environment, settings
from datetime import datetime
from zoneinfo import ZoneInfo

# Ensure log directory exists
settings.LOG_DIR.mkdir(parents=True, exist_ok=True)


class JsonlFileHandler(logging.Handler):
    """Custom handler for writing JSONL logs to daily files.
    
    Automatically rotates to a new file when the date changes,
    so logs are split by day even if the application runs across midnight.
    
    Thread-safe and uses buffered I/O for efficient file operations.
    """

    # Compiled regex for ANSI escape codes (compiled once as class variable)
    ANSI_ESCAPE = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')

    def __init__(self, base_log_dir: Path):
        """Initialize the JSONL file handler.

        Args:
            base_log_dir: Base directory where log files will be written.
                          File names will be generated dynamically based on date.
        """
        super().__init__()
        self.base_log_dir = base_log_dir
        self.current_file_path: Optional[Path] = None
        self.current_date: Optional[datetime.date] = None
        self._lock = threading.Lock()  # Thread safety lock
        self._file_handle: Optional[Any] = None  # Keep file handle open for buffering
        self._buffer_size = 8192  # 8KB buffer
        self._update_file_path()

    def _close_file_handle(self) -> None:
        """Close the current file handle safely."""
        if self._file_handle is not None:
            try:
                self._file_handle.flush()
                self._file_handle.close()
            except Exception:
                pass
            self._file_handle = None

    def _update_file_path(self) -> None:
        """Update the file path based on the current date."""
        today = datetime.now(ZoneInfo(settings.TIMEZONE)).date()
        if self.current_date != today:
            self._close_file_handle()
            self.current_date = today
            env_prefix = settings.ENVIRONMENT.value
            self.current_file_path = (
                self.base_log_dir / f"{env_prefix}-{today.strftime('%Y-%m-%d')}.jsonl"
            )
            try:
                self.current_file_path.parent.mkdir(parents=True, exist_ok=True)
            except (OSError, PermissionError):
                self.current_file_path = None

    def _strip_ansi_codes(self, message: str) -> str:
        """Remove ANSI escape codes from a message string.
        
        Args:
            message: Message that may contain ANSI codes
            
        Returns:
            Clean message without ANSI codes
        """
        return self.ANSI_ESCAPE.sub('', message)

    def _create_log_entry_from_record(self, record: logging.LogRecord) -> Dict[str, Any]:
        """Create a structured log entry from a logging record.
        
        Args:
            record: The logging record to convert
            
        Returns:
            Dictionary representing the log entry
        """
        message = record.getMessage()
        clean_message = self._strip_ansi_codes(message)
        
        return {
            "timestamp": datetime.fromtimestamp(
                record.created, tz=ZoneInfo(settings.TIMEZONE)
            ).isoformat(),
            "level": record.levelname,
            "environment": settings.ENVIRONMENT.value,
            "logger": record.name,
            "module": record.module,
            "function": record.funcName,
            "filename": record.pathname,
            "line": record.lineno,
            "message": clean_message,
        }

    def _extract_log_entry(self, record: logging.LogRecord) -> Dict[str, Any]:
        """Extract structured log entry from record using multiple strategies.
        
        Attempts to extract structured log data in the following order:
        1. Uses structlog's event_dict if available (most structured)
        2. Parses message as JSON if it starts with '{'
        3. Falls back to creating entry from record metadata
        
        Args:
            record: The logging record containing log information
            
        Returns:
            Dictionary containing structured log entry with fields like
            timestamp, level, message, module, function, filename, line, etc.
        """
        # Try to get event_dict from structlog
        event_dict = getattr(record, "__structlog__", None) or getattr(
            record, "_structlog_event_dict", None
        )
        if isinstance(event_dict, dict):
            log_entry = dict(event_dict)
            if "timestamp" not in log_entry:
                log_entry["timestamp"] = datetime.fromtimestamp(
                    record.created, tz=ZoneInfo(settings.TIMEZONE)
                ).isoformat()
            return log_entry

        # Try to parse message as JSON
        message = record.getMessage()
        if message.strip().startswith("{"):
            try:
                return json.loads(message)
            except (json.JSONDecodeError, ValueError):
                pass

        # Fallback: create from record metadata
        return self._create_log_entry_from_record(record)

    def _get_file_handle(self):
        """Get or create the file handle for the current log file."""
        if self._file_handle is None and self.current_file_path:
            try:
                self._file_handle = open(
                    self.current_file_path,
                    "a",
                    encoding="utf-8",
                    buffering=self._buffer_size,
                )
            except (OSError, IOError):
                return None
        return self._file_handle

    def emit(self, record: logging.LogRecord) -> None:
        """Emit a record to the JSONL file."""
        with self._lock:
            try:
                self._update_file_path()
                log_entry = self._extract_log_entry(record)
                if hasattr(record, "extra"):
                    log_entry.update(record.extra)

                file_handle = self._get_file_handle()
                if file_handle:
                    try:
                        json_line = (
                            json.dumps(log_entry, default=str, ensure_ascii=False) + "\n"
                        )
                        file_handle.write(json_line)
                    except (OSError, IOError):
                        self._close_file_handle()
            except Exception:
                self.handleError(record)

    def flush(self) -> None:
        """Flush any buffered log entries to disk."""
        with self._lock:
            if self._file_handle is not None:
                try:
                    self._file_handle.flush()
                except Exception:
                    pass

    def close(self) -> None:
        """Close the handler and flush any remaining log entries."""
        with self._lock:
            self._close_file_handle()
        super().close()


def store_event_dict_for_file_handler(logger, method_name, event_dict):
    """Store event_dict in logging record for file handler access."""
    return event_dict


def get_structlog_processors(include_file_info: bool = True) -> List[Any]:
    """Get the structlog processors based on configuration.

    Args:
        include_file_info: Whether to include file information in the logs

    Returns:
        List[Any]: List of structlog processors
    """
    # Set up processors that are common to both outputs
    processors = [
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
    ]

    # Add callsite parameters if file info is requested
    if include_file_info:
        processors.append(
            structlog.processors.CallsiteParameterAdder(
                {
                    structlog.processors.CallsiteParameter.FILENAME,
                    structlog.processors.CallsiteParameter.FUNC_NAME,
                    structlog.processors.CallsiteParameter.LINENO,
                    structlog.processors.CallsiteParameter.MODULE,
                    structlog.processors.CallsiteParameter.PATHNAME,
                }
            )
        )

    # Add environment info
    processors.append(
        lambda _, __, event_dict: {
            **event_dict,
            "environment": settings.ENVIRONMENT.value,
        }
    )
    
    # Store event_dict before rendering so file handler can access it
    processors.append(store_event_dict_for_file_handler)

    return processors


def setup_logging() -> None:
    """Configure structlog with different formatters based on environment."""
    file_handler = JsonlFileHandler(settings.LOG_DIR)
    file_handler.setLevel(settings.LOG_LEVEL)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(settings.LOG_LEVEL)

    shared_processors = get_structlog_processors(
        include_file_info=settings.ENVIRONMENT
        in [Environment.LOCAL, Environment.DEVELOPMENT, Environment.TEST]
    )

    logging.basicConfig(
        format="%(message)s",
        level=settings.LOG_LEVEL,
        handlers=[file_handler, console_handler],
    )

    renderer = (
        structlog.dev.ConsoleRenderer()
        if settings.LOG_FORMAT == "console"
        else structlog.processors.JSONRenderer()
    )

    structlog.configure(
        processors=[*shared_processors, renderer],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


# Initialize logging
setup_logging()

# Create logger instance
logger = structlog.get_logger()
logger.info(
    "logging_initialized",
    environment=settings.ENVIRONMENT.value,
    log_level=settings.LOG_LEVEL,
    log_format=settings.LOG_FORMAT,
)
