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

    # google (default) or alibaba. Alibaba does not replace the Marina Square directory.
    ai_provider: str = "google"
    dashscope_api_key: str = ""
    dashscope_api_host: str = "https://dashscope-intl.aliyuncs.com"
    dashscope_model: str = "qwen-plus"
    dashscope_tts_model: str = "qwen3-tts-flash"
    # Qwen3-TTS preset voice. Speaks the language_type sent with each request.
    dashscope_tts_voice: str = "Cherry"
    # Optional cloned CosyVoice id. Used only for Bahasa Indonesia, which preset voices do not speak.
    dashscope_tts_voice_id: str = ""
    # Bailian knowledge base. Empty means factual answers use the directory fallback.
    alibaba_knowledge_index_id: str = ""
    # Public web search. This is not the mall directory. Singapore bills it per call.
    alibaba_enable_web_search: bool = False
    # Model ids stay in config. Callers use create_image, edit_image, and create_video.
    dashscope_image_model: str = "wan2.7-image-pro"
    dashscope_image_edit_model: str = "wan2.7-image-pro"
    dashscope_video_model: str = "wan3.0-video"
    dashscope_video_from_image_model: str = "wan3.0-video"

    tts_model: str = "gemini-2.5-flash-tts"
    tts_voice_name: str = "Achernar"
    tts_voice_prompt: str = """
        Speak in a warm, professional tone using clear and neutral tone.
        Avoid strong regional accents.
        Sound welcoming and natural, like a hospitality professional at a premium mall
    """


settings = Settings()
