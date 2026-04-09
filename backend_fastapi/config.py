from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_ROOT_ENV = Path(__file__).parent.parent / ".env"       # avatar_chatbot/.env
_BACKEND_ENV = Path(__file__).parent / ".env"            # backend_fastapi/.env


class Settings(BaseSettings):
    # Root env loaded first; backend env overrides any overlapping keys.
    # Docker Compose also injects these as env vars (highest priority).
    model_config = SettingsConfigDict(env_file=[_ROOT_ENV, _BACKEND_ENV], extra="ignore")

    database_url: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    admin_username: str = "admin"
    admin_password: str = "password"

    google_vertex_project: str = ""
    google_vertex_location: str = "us-central1"
    vertex_ai_web_datastore_id: str = ""
    vertex_ai_pdf_datastore_id: str = ""

    google_application_credentials: str = "/app/credentials/gcp-key.json"
    next_public_origin: str = "http://localhost:3000"

    session_idle_timeout_minutes: int = 5

    tts_model: str = "gemini-2.5-flash-tts"
    tts_voice_name: str = "Achernar"
    tts_voice_prompt: str = (
        "Read aloud in a warm, welcoming tone with a Singaporean accent. "
        "Speak naturally and conversationally."
    )


settings = Settings()
