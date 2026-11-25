"""Switch chat and speech between Google and Alibaba. Google stays the default."""

from collections.abc import AsyncIterator

from config import settings


def uses_alibaba() -> bool:
    return settings.ai_provider.strip().lower() == "alibaba"


async def stream_chat_response(
    message: str,
    history: list[dict],
    language: str = "en-US",
    *,
    followup: bool = False,
    owner: str = "",
) -> AsyncIterator[str | dict]:
    """Yield reply text, plus dict events such as job_request.

    followup=True means message is an automatic job result, not visitor input.
    owner scopes in-memory background jobs, including browser sessions.
    """
    if uses_alibaba():
        from services.alibaba_chat import stream_qwen_response

        async for chunk in stream_qwen_response(
            message, history, language, followup=followup, owner=owner
        ):
            yield chunk
        return

    from services.gemini import stream_gemini_response

    async for chunk in stream_gemini_response(message, history, language):
        yield chunk


async def synthesize_speech(text: str, language: str = "en-US") -> dict:
    if uses_alibaba():
        from services.alibaba_tts import synthesize

        return await synthesize(text, language)

    from services.tts_service import synthesize

    return await synthesize(text, language)
