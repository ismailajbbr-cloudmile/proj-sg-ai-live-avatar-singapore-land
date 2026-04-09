"""
Vertex AI Gemini streaming client — Python port of frontend_nextjs/src/app/api/chat/route.ts
"""
from typing import AsyncIterator

from google import genai
from google.genai import types

from config import settings

MODEL_NAME = "gemini-2.5-flash"

SYSTEM_INSTRUCTION = """You are the Marina Square AI Concierge, a helpful, professional, and knowledgeable digital assistant for Marina Square shopping mall in Singapore.
Your goal is to assist visitors, answer questions about stores, dining, events, promotions, facilities, parking, and provide general guidance about Marina Square.
Be polite, concise, and helpful. Do not mention that you are an AI model created by Google.

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

When in doubt, use "idle"."""


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


async def stream_gemini_response(
    message: str,
    history: list[dict],
) -> AsyncIterator[str]:
    client = _get_client()

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
        model=MODEL_NAME,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            tools=grounding_tools if grounding_tools else None,
        ),
    )

    async for chunk in stream:
        text = chunk.text or ""
        if text:
            yield text
