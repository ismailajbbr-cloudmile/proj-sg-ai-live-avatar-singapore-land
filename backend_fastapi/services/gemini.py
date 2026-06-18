"""
Vertex AI Gemini streaming client — Python port of frontend_nextjs/src/app/api/chat/route.ts
"""

import logging
import re
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import AsyncIterator
from zoneinfo import ZoneInfo

from google import genai
from google.genai import types

from config import settings

logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTION = """
You are the Marina Square AI Concierge, a helpful, professional, and knowledgeable digital assistant for Marina Square shopping mall in Singapore.
Your goal is to assist visitors, answer questions about stores, dining, events, promotions, facilities, parking, and provide general guidance about Marina Square.
Be polite, concise, and helpful. Do not mention that you are an AI model created by Google.

Please act as a bilingual assistant supporting English and Chinese.
Dynamically switch between the two languages based on my input.
Whenever you generate Chinese content, ensure it is always written in Simplified Chinese characters.

IMPORTANT: Always respond in exactly this format — no JSON, no code blocks:
Line 1: <gesture> (exactly one word from: idle | nod | shake | tilt | lookup | excited)
Line 2+: <your spoken response>

Example:
idle
Welcome to Marina Square. How may I help you today?

Gesture rules — be very selective, most responses should use "idle":
- idle: DEFAULT for informational answers, multi-sentence replies, and professional greetings / welcomes
- nod: Short confirmations ("Yes.", "That's correct.") or a brief friendly acknowledgment
- shake: ONLY when explicitly saying no or correcting a misconception
- tilt: ONLY when genuinely uncertain or asking a clarifying question
- lookup: ONLY when recalling a specific fact or statistic
- excited: ONLY for rare, clearly high-energy moments (e.g. announcing a major limited-time event). Do NOT use for normal hellos or routine welcomes.

When in doubt, use "idle".

QR code rules for "[SHOW_QR]":
The QR code links to an INDOOR wayfinder map of Marina Square. It is ONLY useful for navigating WITHIN the building.
Append exactly "[SHOW_QR]" on its own new line at the very end of your response ONLY when the user asks how to find or get to a specific store, restaurant, facility, exit, or floor INSIDE Marina Square.
Do NOT append "[SHOW_QR]" for:
- Questions about getting TO Marina Square from outside (e.g. "How to get to Marina Square from Changi?")
- General information only (hours, promotions, menu) when the user is NOT asking for directions — still append "[SHOW_QR]" when they ask how to find or get to a tenant, including OUTSIDE
- Questions about destinations outside Marina Square (other buildings, streets, or cities) — NOT tenants whose name contains "outside" or outdoor seating within the mall
- Any question that does not require indoor navigation within the building

Disambiguating the store named "OUTSIDE":
- OUTSIDE is a store/tenant located INSIDE Marina Square. It is NOT a request to leave the mall.
- When the user mentions "OUTSIDE" (any casing) while looking for a shop, restaurant, or tenant, treat it as in-mall wayfinding and append "[SHOW_QR]" when giving directions or location.
- Do NOT interpret the store name OUTSIDE as "outside the building."

Chinese (简体中文) — OUTSIDE store vs leaving the mall:
- Visitors often refer to the OUTSIDE tenant as OUTSIDE、OUTSIDE店、OUTSIDE商店, or 外面 when asking where a shop is.
- In a Marina Square kiosk session, questions like 外面在哪里、怎么去外面、OUTSIDE在哪里、哪里有OUTSIDE店 usually mean the IN-MALL store named OUTSIDE → give directions and append [SHOW_QR].
- Do NOT treat 外面 in these store-finding questions as "exit the building" or "go outdoors."
- ONLY treat as leaving the mall when the user clearly means exit/travel away, e.g. 离开商场、走出商场、出口在哪里、怎么出去、从樟宜到滨海广场、滨海广场外面的餐厅 — no [SHOW_QR] unless asking for a specific in-mall exit.

Examples that SHOULD append "[SHOW_QR]" (OUTSIDE store wayfinding):
- "Where is OUTSIDE?" → Directions to the OUTSIDE store, then [SHOW_QR]
- "How do I get to Outside?" → In-mall navigation to the store, NOT mall exit instructions, then [SHOW_QR]
- "OUTSIDE 在哪里？" / "外面在哪里？" / "怎么去 OUTSIDE 店？" → Chinese directions to the store, then [SHOW_QR]

Examples that must NOT be treated as the OUTSIDE store (no [SHOW_QR] unless asking for a specific in-mall exit):
- "How do I get outside?" / "Where is the exit?" / "怎么出去？" / "出口在哪里？" → Mall exit guidance only
- "How do I get to Marina Square from Changi?" / "从樟宜怎么到滨海广场？" → External travel directions
- "Restaurants outside Marina Square" / "滨海广场外面的餐厅" → Off-premise destinations

Formatting for chat display (use markdown in your spoken response text):
- Use **bold** for store names, promo titles, and key dates.
- When listing 3+ stores, deals, or events, use a markdown bullet list (- item).
- Put a blank line between sections (intro, deal list, membership info).
- Do NOT use # headings or code blocks."""

_SMALL_TALK_PATTERN = re.compile(
    r"^\s*(?:"
    r"hi|hello|hey|yo|"
    r"good\s+(?:morning|afternoon|evening|night)|"
    r"thanks?(?:\s+you)?|thank\s+you|thx|"
    r"bye|goodbye|see\s+you|"
    r"how\s+are\s+you|what(?:'s|\s+is)\s+up|"
    r"你好|您好|谢谢|多谢|再见|再会|"
    r"早上好|下午好|晚上好|午安|"
    r"你好吗|怎么样"
    r")\s*[!.?，。！？]*\s*$",
    re.IGNORECASE,
)


@dataclass
class GroundingState:
    grounding_chunks: list = field(default_factory=list)
    grounding_supports: list = field(default_factory=list)
    retrieval_queries: list[str] = field(default_factory=list)


def _grounding_rules() -> str:
    return """Knowledge base rules (STRICT — applies to all factual questions):
- Answer ONLY using information retrieved from the Marina Square knowledge base (website and PDF datastores).
- NEVER invent or guess store names, tenant locations, promotions, events, opening hours, parking rates, or facility details.
- Do NOT rely on general world knowledge for Marina Square facts — use retrieved sources only.
- If retrieval returns nothing relevant, or you are unsure whether a fact is in the knowledge base, use gesture "tilt" and say you do not have that information. Direct the visitor to the information counter on Level 2 or Marina Square's official website.
- Do NOT append [SHOW_QR] unless you have grounded directions to a specific in-mall tenant from retrieved sources.
- You MAY respond without retrieval only for greetings, thanks, goodbye, and brief clarifying questions — not for mall facts."""


def _session_language_instruction(language: str) -> str:
    if language.startswith("zh"):
        return (
            "Respond in Simplified Chinese (简体中文) for this entire session "
            "unless the user explicitly asks to switch to English.\n"
            "OUTSIDE store rule (Chinese): If the user asks about 外面、OUTSIDE、或 OUTSIDE店 "
            "in a directions or location question, they mean the tenant store OUTSIDE inside "
            "Marina Square — not leaving the mall. Give in-mall directions and append [SHOW_QR]."
        )
    return (
        "Respond in English for this entire session "
        "unless the user explicitly asks to switch to Chinese."
    )


def _promo_event_rules() -> str:
    today = datetime.now(ZoneInfo("Asia/Singapore")).strftime("%Y-%m-%d")
    return f"""Promotions and events (today is {today}, Asia/Singapore):
- When the user asks about promotions, deals, or events, only mention items that are CURRENT or UPCOMING as of today.
- Do NOT mention expired, past, or ended promotions/events unless the user explicitly asks about history.
- If grounding sources include date ranges, compare against today and exclude anything that has already ended.
- If no current/upcoming items are found in retrieved sources, say you don't have current promotion/event details and suggest checking Marina Square's website or information counter."""


def _build_system_instruction(language: str = "en-US") -> str:
    return (
        f"{SYSTEM_INSTRUCTION.strip()}\n\n"
        f"{_grounding_rules()}\n\n"
        f"{_promo_event_rules()}\n\n"
        f"{_session_language_instruction(language)}"
    )


def _is_small_talk(message: str) -> bool:
    return bool(_SMALL_TALK_PATTERN.match(message.strip()))


def _fallback_response(language: str) -> str:
    if language.startswith("zh"):
        return (
            "tilt\n"
            "抱歉，我目前的滨海广场资料库中没有这方面的信息。"
            "请咨询二楼问询处，或浏览滨海广场官方网站获取最新资讯。"
        )
    return (
        "tilt\n"
        "I don't have that information in my current Marina Square directory. "
        "Please check with the information counter on Level 2 or visit Marina Square's "
        "official website for the latest details."
    )


_REFUSAL_PATTERN = re.compile(
    r"(?:"
    r"don'?t have (?:that |current )?(?:information|details|promotion|event)"
    r"|do not have (?:that |current )?(?:information|details|promotion|event)"
    r"|没有(?:这|该|相关)?(?:方面)?(?:的)?(?:信息|资料|详情|促销|活动)"
    r"|无法(?:找到|提供)"
    r")",
    re.IGNORECASE,
)


def _model_already_refused(text: str) -> bool:
    """True when the model already declined per prompt rules — skip generic fallback."""
    body = text.split("\n", 1)[-1] if "\n" in text else text
    return bool(_REFUSAL_PATTERN.search(body))


def _has_datastore_grounding() -> bool:
    return bool(settings.vertex_ai_web_datastore_id or settings.vertex_ai_pdf_datastore_id)


def _merge_grounding_metadata(state: GroundingState, chunk: types.GenerateContentResponse) -> None:
    if not chunk.candidates:
        return
    meta = chunk.candidates[0].grounding_metadata
    if not meta:
        return
    queries = getattr(meta, "retrieval_queries", None) or []
    for q in queries:
        if q not in state.retrieval_queries:
            state.retrieval_queries.append(q)
    chunks = getattr(meta, "grounding_chunks", None) or []
    if chunks:
        state.grounding_chunks.extend(chunks)
    supports = getattr(meta, "grounding_supports", None) or []
    if supports:
        state.grounding_supports.extend(supports)


def _is_grounded(state: GroundingState, message: str) -> bool:
    if _is_small_talk(message):
        return True
    return (
        len(state.grounding_chunks) > 0
        or len(state.grounding_supports) > 0
        or len(state.retrieval_queries) > 0
    )


def _datastore_path(datastore_id: str) -> str:
    return (
        f"projects/{settings.google_vertex_project}"
        f"/locations/global/collections/default_collection"
        f"/dataStores/{datastore_id}"
    )


def _get_client() -> genai.Client:
    return genai.Client(
        vertexai=True,
        project=settings.google_vertex_project,
        location=settings.google_vertex_location,
    )


def _is_gemini_3_family(model: str) -> bool:
    """Gemini 3.x models default to internal thinking; kiosk chat needs minimal latency."""
    return "gemini-3" in model


def _build_grounding_tools() -> list[types.Tool]:
    grounding_tools: list[types.Tool] = []
    if settings.vertex_ai_web_datastore_id:
        grounding_tools.append(
            types.Tool(
                retrieval=types.Retrieval(
                    vertex_ai_search=types.VertexAISearch(
                        datastore=_datastore_path(settings.vertex_ai_web_datastore_id)
                    )
                )
            )
        )
    if settings.vertex_ai_pdf_datastore_id:
        grounding_tools.append(
            types.Tool(
                retrieval=types.Retrieval(
                    vertex_ai_search=types.VertexAISearch(
                        datastore=_datastore_path(settings.vertex_ai_pdf_datastore_id)
                    )
                )
            )
        )
    return grounding_tools


def _build_generate_config(
    grounding_tools: list[types.Tool],
    model: str,
    language: str = "en-US",
) -> types.GenerateContentConfig:
    kwargs: dict = {
        "system_instruction": _build_system_instruction(language),
        "tools": grounding_tools if grounding_tools else None,
        "temperature": 0.0,
        "top_p": 0.95,
    }
    if _is_gemini_3_family(model):
        kwargs["thinking_config"] = types.ThinkingConfig(thinking_level="minimal")
    return types.GenerateContentConfig(**kwargs)


def _chunk_visible_text(chunk: types.GenerateContentResponse) -> str:
    """Extract user-visible text from a stream chunk; skip thought parts and empty metadata chunks."""
    parts: list[str] = []
    candidates = chunk.candidates
    if candidates:
        content = candidates[0].content
        if content and content.parts:
            for part in content.parts:
                if getattr(part, "thought", False):
                    continue
                if part.text:
                    parts.append(part.text)
    if parts:
        return "".join(parts)
    text = chunk.text or ""
    return text if text else ""


async def stream_gemini_response(
    message: str,
    history: list[dict],
    language: str = "en-US",
) -> AsyncIterator[str]:
    model = settings.gemini_chat_model
    grounding_tools = _build_grounding_tools()

    if not _has_datastore_grounding():
        logger.warning(
            "[Gemini] No Vertex AI Search datastore IDs configured — "
            "VERTEX_AI_WEB_DATASTORE_ID and VERTEX_AI_PDF_DATASTORE_ID are empty"
        )
        if settings.require_datastore_grounding:
            yield _fallback_response(language)
            return

    if settings.require_datastore_grounding and not _is_small_talk(message) and not grounding_tools:
        yield _fallback_response(language)
        return

    client = _get_client()
    contents = [
        *history,
        {"role": "user", "parts": [{"text": message}]},
    ]

    stream = await client.aio.models.generate_content_stream(
        model=model,
        contents=contents,
        config=_build_generate_config(grounding_tools, model, language),
    )

    started_at = time.monotonic()
    buffered_text = ""
    grounding_state = GroundingState()
    last_finish_reason: str | None = None

    async for chunk in stream:
        if chunk.candidates:
            reason = chunk.candidates[0].finish_reason
            if reason is not None:
                last_finish_reason = str(reason)
            _merge_grounding_metadata(grounding_state, chunk)

        text = _chunk_visible_text(chunk)
        if text:
            buffered_text += text

    elapsed = time.monotonic() - started_at
    final_text = buffered_text

    enforce_grounding = settings.require_datastore_grounding and bool(grounding_tools)
    if not final_text.strip():
        logger.warning(
            "[Gemini] model=%s no_text_yielded elapsed_s=%.3f finish_reason=%s "
            "chunks=%d supports=%d queries=%r",
            model,
            elapsed,
            last_finish_reason,
            len(grounding_state.grounding_chunks),
            len(grounding_state.grounding_supports),
            grounding_state.retrieval_queries,
        )
        if enforce_grounding and not _is_small_talk(message) and not _model_already_refused(final_text):
            final_text = _fallback_response(language)
    else:
        grounded = _is_grounded(grounding_state, message)
        logger.info(
            "[Gemini] model=%s stream_complete elapsed_s=%.3f grounded=%s "
            "chunks=%d supports=%d queries=%r",
            model,
            elapsed,
            grounded,
            len(grounding_state.grounding_chunks),
            len(grounding_state.grounding_supports),
            grounding_state.retrieval_queries,
        )
        if enforce_grounding and not grounded and not _is_small_talk(message):
            logger.warning(
                "[Gemini] no_grounding_metadata model=%s message=%r — "
                "trusting strict prompt (Gemini 2.5 may omit chunks)",
                model,
                message,
            )

    if final_text:
        yield final_text
