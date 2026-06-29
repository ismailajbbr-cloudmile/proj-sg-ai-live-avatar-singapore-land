from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_ROOT_ENV = Path(__file__).parent.parent / ".env"  # avatar_chatbot/.env (single source)


class Settings(BaseSettings):
    # Values from repo-root .env; process env / Docker Compose override file values.
    model_config = SettingsConfigDict(env_file=[_ROOT_ENV], extra="ignore")

    database_url: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    admin_username: str = ""
    admin_password: str = ""

    google_vertex_project: str = ""
    google_vertex_location: str = "us-central1"
    vertex_ai_web_datastore_id: str = ""
    vertex_ai_web_engine_id: str = ""
    require_datastore_grounding: bool = True

    gemini_chat_model: str = "gemini-2.5-flash"

    google_application_credentials: str = "/app/credentials/gcp-key.json"
    next_public_origin: str = "http://localhost:3000"

    session_idle_timeout_minutes: int = 4

    tts_model: str = "gemini-2.5-flash-tts"
    tts_voice_name: str = "Achernar"
    tts_voice_prompt: str = """
        Speak in a warm, professional tone using clear and neutral tone.
        Avoid strong regional accents.
        Sound welcoming and natural, like a hospitality professional at a premium mall
    """


settings = Settings()
