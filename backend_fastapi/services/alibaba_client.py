"""Shared DashScope URL helpers. The API key's region must match the host."""

from config import settings


def api_host() -> str:
    host = settings.dashscope_api_host.strip().rstrip("/")
    for suffix in ("/compatible-mode/v1", "/api/v1"):
        host = host.removesuffix(suffix)
    return host or "https://dashscope-intl.aliyuncs.com"


def chat_completions_url() -> str:
    return f"{api_host()}/compatible-mode/v1/chat/completions"


def tts_url(model: str | None = None) -> str:
    """Qwen TTS uses the multimodal endpoint. CosyVoice uses SpeechSynthesizer."""
    chosen = (model or settings.dashscope_tts_model).strip()
    if chosen.startswith(("qwen-audio-", "cosyvoice")):
        path = "/api/v1/services/audio/tts/SpeechSynthesizer"
    elif chosen.startswith("qwen"):
        path = "/api/v1/services/aigc/multimodal-generation/generation"
    else:
        path = "/api/v1/services/audio/tts/SpeechSynthesizer"
    return f"{api_host()}{path}"


def knowledge_retrieve_url() -> str:
    return f"{api_host()}/api/v1/indices/rag/index/retrieve"


def auth_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.dashscope_api_key}",
        "Content-Type": "application/json",
    }
