"""Provider-neutral web search. Google is not implemented yet."""

from config import settings
from services.chat_provider import uses_alibaba


async def search_web(query: str) -> str:
    if uses_alibaba():
        from services.alibaba_chat import web_search_answer

        return await web_search_answer(query)
    raise NotImplementedError(
        f"Web search is not implemented for AI_PROVIDER={settings.ai_provider}."
    )
