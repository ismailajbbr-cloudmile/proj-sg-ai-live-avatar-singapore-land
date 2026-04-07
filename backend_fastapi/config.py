from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

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


settings = Settings()
