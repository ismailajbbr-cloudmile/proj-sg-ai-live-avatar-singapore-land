"""
Vertex AI Gemini streaming client — Python port of frontend_nextjs/src/app/api/chat/route.ts
"""

import logging
import time
from typing import AsyncIterator

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
- General information about stores, events, promotions, opening hours, or parking
- Questions about places outside Marina Square
- Any question that does not require indoor navigation within the building"""


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


def _build_generate_config(
    grounding_tools: list[types.Tool],
    model: str,
) -> types.GenerateContentConfig:
    kwargs: dict = {
        "system_instruction": SYSTEM_INSTRUCTION,
        "tools": grounding_tools if grounding_tools else None,
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
) -> AsyncIterator[str]:
    client = _get_client()
    model = settings.gemini_chat_model

    grounding_tools = []
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

    contents = [
        *history,
        {"role": "user", "parts": [{"text": message}]},
    ]

    stream = await client.aio.models.generate_content_stream(
        model=model,
        contents=contents,
        config=_build_generate_config(grounding_tools, model),
    )

    started_at = time.monotonic()
    first_chunk_at: float | None = None
    yielded_any = False
    last_finish_reason: str | None = None

    async for chunk in stream:
        if chunk.candidates:
            reason = chunk.candidates[0].finish_reason
            if reason is not None:
                last_finish_reason = str(reason)

        text = _chunk_visible_text(chunk)
        if not text:
            continue

        if first_chunk_at is None:
            first_chunk_at = time.monotonic()
            logger.info(
                "[Gemini] model=%s time_to_first_chunk_s=%.3f",
                model,
                first_chunk_at - started_at,
            )

        yielded_any = True
        yield text

    elapsed = time.monotonic() - started_at
    if not yielded_any:
        logger.warning(
            "[Gemini] model=%s no_text_yielded elapsed_s=%.3f finish_reason=%s",
            model,
            elapsed,
            last_finish_reason,
        )
    elif first_chunk_at is not None:
        logger.info(
            "[Gemini] model=%s stream_complete elapsed_s=%.3f",
            model,
            elapsed,
        )
