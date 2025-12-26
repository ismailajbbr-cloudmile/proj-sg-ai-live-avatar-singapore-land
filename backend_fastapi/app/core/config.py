from enum import Enum
from dotenv import load_dotenv
import os
from pathlib import Path


# Define environment types
class Environment(str, Enum):
    """Application environment types.

    Defines the possible environments the application can run in:
    local, development, UAT, and production.
    """
    LOCAL = "local" # LOCAL for local development
    DEVELOPMENT = "development" # SIT for development environment
    UAT = "uat" # UAT for staging environment
    PRODUCTION = "production" # PROD for production environment
    TEST = "test" # TEST for unit testing, bypassing database connection and other services


# Determine environment
def get_environment() -> Environment:
    """Get the current environment.

    Returns:
        Environment: The current environment (local, development, staging, and production)
    """
    env_value = os.getenv("APP_ENV", "local").lower()
    if env_value in ("production", "prod"):
        return Environment.PRODUCTION
    elif env_value in ("staging", "stage", "uat"):
        return Environment.UAT
    elif env_value in ("development", "dev"):
        return Environment.DEVELOPMENT
    elif env_value in ("testing", "test"):
        return Environment.TEST
    else:
        return Environment.LOCAL

# Load appropriate .env file based on environment
def load_env_file():
    """Load environment-specific .env file."""
    env = get_environment()
    print(f"Loading environment: {env}")
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))

    # Define env files in priority order
    env_files = [
        os.path.join(base_dir, f".env.{env.value}.local"),
        os.path.join(base_dir, f".env.{env.value}"),
        os.path.join(base_dir, ".env.local"),
        os.path.join(base_dir, ".env"),
    ]

    # Load the first env file that exists
    for env_file in env_files:
        if os.path.isfile(env_file):
            load_dotenv(dotenv_path=env_file)
            print(f"Loaded environment from {env_file}")
            return env_file

    # Fall back to default if no env file found
    return None

ENV_FILE = load_env_file()

# Parse list values from environment variables
def parse_list_from_env(env_key, default=None):
    """Parse a comma-separated list from an environment variable."""
    value = os.getenv(env_key)
    if not value:
        return default or []

    # Remove quotes if they exist
    value = value.strip("'")
    # Handle single value case
    if "," not in value:
        return [value]
    # Split comma-separated values
    return [item.strip() for item in value.split(",") if item.strip()]


# Parse dict of lists from environment variables with prefix
def parse_dict_of_lists_from_env(prefix, default_dict=None):
    """Parse dictionary of lists from environment variables with a common prefix."""
    result = default_dict or {}

    # Look for all env vars with the given prefix
    for key, value in os.environ.items():
        if key.startswith(prefix):
            endpoint = key[len(prefix) :].lower()  # Extract endpoint name
            # Parse the values for this endpoint
            if value:
                value = value.strip("'")
                if "," in value:
                    result[endpoint] = [
                        item.strip() for item in value.split(",") if item.strip()
                    ]
                else:
                    result[endpoint] = [value]

    return result


class Settings:
    """Application settings."""
    def __init__(self):
        """Initialize application settings."""
        # Environment & Application Settings
        self.ENVIRONMENT = get_environment()
        # Production flag (derived from environment) - set early as it's used by other settings
        self.IS_PRODUCTION = self.ENVIRONMENT == Environment.PRODUCTION
        self.PROJECT_NAME = os.getenv("PROJECT_NAME", "Astrata Intelligence Platform")
        self.VERSION = os.getenv("VERSION", "1.0.0")
        self.DESCRIPTION = os.getenv("DESCRIPTION", "A Intelligence Platform that consist of dashboards, reports, and agents")
        self.DEBUG = os.getenv("DEBUG", "false").lower() in ("true", "1", "t", "yes")

        # API & CORS Configuration
        self.API_V1_STR = os.getenv("API_V1_STR", "/api/v1")
        self.API_PREFIX = self.API_V1_STR  # Alias for backward compatibility
        self.ALLOWED_ORIGINS = parse_list_from_env("ALLOWED_ORIGINS", ["*"])
        self.FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
        # Default redirect URI for OAuth callback (backend endpoint)
        # Standardized to /callback (OAuth standard naming convention)
        self.REDIRECT_URI = os.getenv("REDIRECT_URI", "http://localhost:8000/api/v1/auth/callback")

        # Session Configuration
        self.SESSION_SECRET = os.getenv("SESSION_SECRET", "")
        self.SESSION_MAX_AGE = os.getenv("SESSION_MAX_AGE", "3600")

        # Cookie Configuration
        # Authentication cookie settings for secure token storage
        self.COOKIE_SETTINGS = {
            "httponly": True,
            "secure": self.IS_PRODUCTION,
            "samesite": "lax",
            "path": "/"
        }
        # Refresh token expiration (7 days in seconds)
        self.REFRESH_TOKEN_MAX_AGE = int(os.getenv("REFRESH_TOKEN_MAX_AGE", str(60 * 60 * 24 * 7)))

        # Rate Limiting Configuration
        self.RATE_LIMIT_DEFAULT = parse_list_from_env("RATE_LIMIT_DEFAULT", ["200 per day", "50 per hour"])

        # Default rate limits per endpoint
        default_endpoints = {
            "root": os.getenv("RATE_LIMIT_ROOT", "10 per minute"),
            "login": os.getenv("RATE_LIMIT_LOGIN", "20 per minute"),
            "health": os.getenv("RATE_LIMIT_HEALTH", "20 per minute")
        }
        self.RATE_LIMIT_ENDPOINTS = default_endpoints.copy()
        
        # Database Configuration
        self.POSTGRES_URL = os.getenv("POSTGRES_URL", "")
        self.POSTGRES_USER = os.getenv("POSTGRES_USER", "")
        self.POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "")
        self.POSTGRES_DB = os.getenv("POSTGRES_DB", "appdb")
        self.POSTGRES_POOL_SIZE = int(os.getenv("POSTGRES_POOL_SIZE", "20"))
        self.POSTGRES_MAX_OVERFLOW = int(os.getenv("POSTGRES_MAX_OVERFLOW", "10"))

        # Initial Owner User Configuration
        self.INITIAL_OWNER_EMAIL = os.getenv("INITIAL_OWNER_EMAIL", "")
        self.INITIAL_OWNER_PASSWORD = os.getenv("INITIAL_OWNER_PASSWORD", "")
        self.INITIAL_OWNER_NAME = os.getenv("INITIAL_OWNER_NAME", "Owner")

        # Logging Configuration
        self.LOG_DIR = Path(os.getenv("LOG_DIR", "logs"))
        self.LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
        self.LOG_FORMAT = os.getenv("LOG_FORMAT", "console")
        self.TIMEZONE = os.getenv("TIMEZONE", "Asia/Singapore")



# Create settings instance
settings = Settings()