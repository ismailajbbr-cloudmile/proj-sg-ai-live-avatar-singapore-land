"""Qwen chat through the OpenAI-compatible DashScope endpoint."""

import json
import logging
import re
from collections.abc import AsyncIterator
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from config import settings
from services.alibaba_client import auth_headers, chat_completions_url
from services.alibaba_search import format_knowledge_context, retrieve_knowledge
from services.chat_tools import BACKGROUND_OPERATIONS, chat_tools
from services.gemini import (
    _build_system_instruction,
    _fallback_response,
    _is_small_talk,
)
from services.media import image_urls_in_text, resolve_image_url

logger = logging.getLogger(__name__)


def history_to_messages(history: list[dict]) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    for item in history:
        role = item.get("role", "user")
        if role in ("model", "bot", "assistant"):
            role = "assistant"
        else:
            role = "user"
        parts = item.get("parts") or []
        if parts and isinstance(parts[0], dict):
            text = str(parts[0].get("text", ""))
        else:
            text = str(item.get("text") or item.get("content") or "")
        if text.strip():
            messages.append({"role": role, "content": text})
    return messages


_WEB_SEARCH_NOTE = (
    "You have a web_search tool. Call it for current public facts such as weather, news, "
    "events, prices, and opening hours, or anything recent you are unsure about, "
    "instead of saying you cannot know. Do not invent a private mall tenant directory."
)

_BACKGROUND_NOTE = (
    "Your tools run in the background. After you call one, the result appears later in this chat. "
    "Never pretend you already have the result."
)

_PICTURE_NOTE = (
    "A picture was created or edited earlier in this chat. "
    "For edit_image, pass image_url as an empty string to edit that latest picture. "
    "For create_video, set from_latest_picture to true when the visitor wants a video of that picture. "
    "Keep replies short. Never write image or video URLs in your reply; the app shows the media."
)

_FOLLOWUP_NOTE = (
    "The last user message is an automatic update from the app about a background task you "
    "started earlier. The visitor did not type it. Speak to the visitor directly, do not mention "
    "the automatic update, keep it short, and never write URLs."
)

_STARTED = {
    "web_search": "searching the web",
    "create_image": "creating the image (about 15 seconds)",
    "edit_image": "editing the image (about 15 seconds)",
    "create_video": "creating the video (about one to two minutes)",
}

_MEDIA_ACTION = re.compile(
    r"\b(create|make|generate|draw|design|edit|change|turn|animate|add|buat|bikin|ubah)\b"
    r"|生成|画|制作|做|修改|变成|动画|改",
    re.IGNORECASE,
)
_MEDIA_OBJECT = re.compile(
    r"\b(image|picture|photo|pic|video|clip|animation|gambar|foto|video)\b|图|图片|图像|视频|照片",
    re.IGNORECASE,
)


def _wants_media(message: str) -> bool:
    """True when the visitor clearly asks for a new or changed picture or video."""
    return bool(_MEDIA_ACTION.search(message) and _MEDIA_OBJECT.search(message))


_MEDIA_URL = re.compile(
    r"(?:\[(?:image|video)\]\s*)?https?://\S*(?:aliyuncs\.com|dashscope)\S*",
    re.IGNORECASE,
)


def _request_body(
    messages: list[dict],
    *,
    temperature: float,
    enable_search: bool,
    tools: list[dict] | None,
    stream: bool,
    tool_choice: str | None = None,
) -> dict:
    payload: dict = {
        "model": settings.dashscope_model,
        "messages": messages,
        "stream": stream,
        "temperature": temperature,
    }
    if enable_search:
        # Without forced_search, qwen-plus often skips the search and refuses current facts.
        payload["enable_search"] = True
        payload["search_options"] = {"forced_search": True, "enable_source": True}
    if tools:
        payload["tools"] = tools
        if tool_choice:
            # Auto tool choice sometimes answers "I'm creating it" without calling the tool.
            payload["tool_choice"] = tool_choice
    return payload


async def _complete(
    messages: list[dict],
    *,
    temperature: float,
    enable_search: bool = False,
    tools: list[dict] | None = None,
    tool_choice: str | None = None,
) -> dict:
    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await client.post(
            chat_completions_url(),
            headers=auth_headers(),
            json=_request_body(
                messages,
                temperature=temperature,
                enable_search=enable_search,
                tools=tools,
                stream=False,
                tool_choice=tool_choice,
            ),
        )
        if response.status_code >= 400:
            raise RuntimeError(f"Qwen chat failed ({response.status_code}): {response.text[:500]}")
        return response.json()


def _reply_message(result: dict) -> dict:
    return (result.get("choices") or [{}])[0].get("message") or {}


def _message_text(message: dict) -> str:
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            block.get("text", "")
            for block in content
            if isinstance(block, dict)
        )
    return ""


def _strip_media_urls(text: str, replacement: str = "") -> str:
    return _MEDIA_URL.sub(replacement, text).strip()


def _prepare_history(history: list[dict]) -> tuple[list[dict[str, str]], str]:
    """Return history without signed URLs, plus the latest picture URL found in it."""
    messages = history_to_messages(history)
    latest_picture = ""
    for item in messages:
        found = image_urls_in_text(item["content"])
        if found:
            latest_picture = found[-1]
        # Keep signed URLs out of the model's view so it cannot copy them into replies.
        item["content"] = _strip_media_urls(item["content"], "[picture shown earlier]")
    return messages, latest_picture


def _ack_fallback(language: str) -> str:
    if language.startswith("zh"):
        return "nod\n好的，我正在处理，完成后会在这里告诉您。"
    if language.startswith("id"):
        return "nod\nBaik, saya sedang mengerjakannya dan akan memberi tahu Anda di sini."
    return "nod\nSure, I'm working on it and will share the result here shortly."


def _plan_jobs(
    message: dict,
    latest_picture: str,
    user_text: str,
) -> tuple[list[dict], list[str]]:
    """Turn tool calls into background job requests.

    Returns job_request events plus one tool result per call for the model.
    """
    requests: list[dict] = []
    outputs: list[str] = []
    known = [latest_picture] if latest_picture else []
    for call in message.get("tool_calls") or []:
        function = call.get("function") or {}
        name = str(function.get("name", ""))
        try:
            arguments = json.loads(function.get("arguments") or "{}")
        except json.JSONDecodeError:
            arguments = {}
        if not isinstance(arguments, dict):
            arguments = {}

        if name not in BACKGROUND_OPERATIONS:
            outputs.append(f"Unknown tool {name}. Answer without it.")
            continue

        if name == "edit_image":
            image_url = resolve_image_url(str(arguments.get("image_url", "")), known, user_text)
            if not image_url.startswith("http"):
                outputs.append(
                    "No picture exists in this chat yet. Ask the visitor to create one first."
                )
                continue
            arguments["image_url"] = image_url
        elif name == "create_video":
            supplied = str(arguments.get("image_url", ""))
            use_picture = arguments.pop("from_latest_picture", False)
            if isinstance(use_picture, str):
                use_picture = use_picture.strip().lower() in {"true", "1", "yes"}
            if use_picture or supplied.strip():
                image_url = resolve_image_url(supplied, known, user_text)
                if not image_url.startswith("http"):
                    outputs.append(
                        "No picture exists in this chat yet. Ask the visitor to create one first, "
                        "or make the video from the text description only."
                    )
                    continue
            else:
                image_url = ""
            arguments["image_url"] = image_url

        logger.info("[Alibaba] background job requested operation=%s", name)
        requests.append(
            {
                "type": "job_request",
                "operation": name,
                "arguments": arguments,
                "request": user_text,
            }
        )
        outputs.append(
            f"Started in the background: {_STARTED[name]}. Tell the visitor in one short sentence "
            "that you are on it and the result will appear here. Do not describe the result yet."
        )
    return requests, outputs


async def web_search_answer(query: str) -> str:
    """Run one forced Qwen web search and return a short factual summary."""
    today = datetime.now(ZoneInfo("Asia/Singapore")).strftime("%Y-%m-%d")
    messages = [
        {
            "role": "system",
            "content": (
                f"Today is {today}. Use live web search to answer. "
                "Reply in plain text with the key facts only, including numbers, dates, and place names, "
                "in at most five short sentences."
            ),
        },
        {"role": "user", "content": query},
    ]
    result = await _complete(messages, temperature=0.0, enable_search=True)
    text = _message_text(_reply_message(result)).strip()
    if not text:
        raise RuntimeError("Web search returned no answer")
    return text


async def _stream_followup(
    message: str,
    history_messages: list[dict[str, str]],
    language: str,
) -> AsyncIterator[str]:
    instruction = (
        f"{_build_system_instruction(language, '', grounded=False)}\n\n{_FOLLOWUP_NOTE}"
    )
    messages = [
        {"role": "system", "content": instruction},
        *history_messages,
        {"role": "user", "content": message},
    ]
    result = await _complete(messages, temperature=0.3)
    text = _strip_media_urls(_message_text(_reply_message(result)))
    if text:
        yield text


async def stream_qwen_response(
    message: str,
    history: list[dict],
    language: str = "en-US",
    *,
    followup: bool = False,
) -> AsyncIterator[str | dict]:
    if not settings.dashscope_api_key.strip():
        raise RuntimeError("DASHSCOPE_API_KEY is empty. Add the Singapore Model Studio key to .env.")

    history_messages, latest_picture = _prepare_history(history)
    if followup:
        async for text in _stream_followup(message, history_messages, language):
            yield text
        return

    grounding = settings.require_datastore_grounding
    web_search = settings.alibaba_enable_web_search
    small_talk = _is_small_talk(message)
    search_context = ""

    if small_talk:
        logger.info("[Alibaba] small_talk, skipping retrieval")
    elif grounding and settings.alibaba_knowledge_index_id.strip():
        snippets = await retrieve_knowledge(message)
        if not snippets:
            logger.warning("[Alibaba] knowledge base returned nothing for %r", message)
            yield _fallback_response(language)
            return
        search_context = format_knowledge_context(snippets)
    elif grounding and not web_search:
        logger.warning("[Alibaba] no knowledge index configured")
        yield _fallback_response(language)
        return

    tools = None if small_talk else chat_tools(web_search=web_search and not search_context)
    instruction = _build_system_instruction(
        language,
        search_context,
        grounded=bool(search_context),
    )
    if tools:
        notes = [_BACKGROUND_NOTE]
        if web_search and not search_context:
            notes.append(_WEB_SEARCH_NOTE)
        if latest_picture:
            notes.append(_PICTURE_NOTE)
        instruction = "\n\n".join([instruction, *notes])

    messages = [
        {"role": "system", "content": instruction},
        *history_messages,
        {"role": "user", "content": message},
    ]
    temperature = 0.0 if search_context else 0.4
    tool_choice = "required" if tools and _wants_media(message) else None
    reply = _reply_message(
        await _complete(messages, temperature=temperature, tools=tools, tool_choice=tool_choice)
    )

    if not reply.get("tool_calls"):
        text = _strip_media_urls(_message_text(reply))
        if text:
            yield text
        return

    job_requests, tool_outputs = _plan_jobs(reply, latest_picture, message)
    messages.append(reply)
    for call, output in zip(reply["tool_calls"], tool_outputs, strict=False):
        messages.append({"role": "tool", "tool_call_id": call.get("id", ""), "content": output})
    ack = _reply_message(await _complete(messages, temperature=temperature))
    text = _strip_media_urls(_message_text(ack))
    yield text or _ack_fallback(language)
    for request in job_requests:
        yield request
