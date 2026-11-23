"""Qwen3-TTS speech synthesis on the Singapore Model Studio workspace.

CosyVoice is not enabled for this workspace: that endpoint returns a URL error.
Qwen3-TTS returns a WAV file. Bahasa Indonesia is not a language_type, so those
requests use Auto.
"""

import base64
import json
import logging

import httpx

from config import settings
from services.alibaba_client import auth_headers, tts_url
from services.viseme import build_viseme_frames

logger = logging.getLogger(__name__)

_EMPTY_RESULT = {"audioBase64": "", "mimeType": "audio/mpeg", "visemes": []}


def _segment_words(text: str, language: str) -> list[str]:
    stripped = text.strip()
    if not stripped:
        return []
    if language.startswith("zh"):
        return [ch for ch in stripped if not ch.isspace()]
    return [w for w in stripped.split() if w]


def language_hints(language: str) -> list[str]:
    normalized = language.replace("_", "-").lower()
    if normalized.startswith("zh"):
        return ["zh"]
    if normalized.startswith("id"):
        return ["id"]
    return ["en"]


def language_type_for(language: str) -> str:
    normalized = language.replace("_", "-").lower()
    if normalized.startswith("zh"):
        return "Chinese"
    if normalized.startswith("en"):
        return "English"
    # Qwen3-TTS has no Bahasa Indonesia language_type. Auto is the supported fallback.
    return "Auto"


def _mime_type(audio: bytes) -> str:
    if audio.startswith(b"RIFF"):
        return "audio/wav"
    return "audio/mpeg"


def voice_for(language: str) -> str:
    if language.replace("_", "-").lower().startswith("id") and settings.dashscope_tts_voice_id.strip():
        return settings.dashscope_tts_voice_id.strip()
    return settings.dashscope_tts_voice


def parse_tts_events(raw: str) -> tuple[bytes, list[dict], str]:
    """Read a DashScope SSE body. Returns audio bytes, word dicts, and an audio URL."""
    audio = bytearray()
    words: list[dict] = []
    audio_url = ""
    for line in raw.splitlines():
        if not line.startswith("data:"):
            continue
        data = line[5:].strip()
        if not data or data == "[DONE]":
            continue
        try:
            event = json.loads(data)
        except json.JSONDecodeError:
            continue
        output = event.get("output") or {}
        chunk = (output.get("audio") or {}).get("data")
        if isinstance(chunk, str) and chunk:
            audio.extend(base64.b64decode(chunk))
        url = (output.get("audio") or {}).get("url")
        if isinstance(url, str) and url:
            audio_url = url
        sentence = output.get("sentence") or {}
        for word in sentence.get("words") or []:
            if isinstance(word, dict) and word.get("text"):
                words.append(word)
    return bytes(audio), words, audio_url


def words_to_timepoints(words: list[dict]) -> tuple[list[str], list[dict]]:
    spoken: list[str] = []
    timepoints: list[dict] = []
    for word in words:
        text = str(word.get("text", "")).strip()
        begin = word.get("begin_time")
        if not text or not isinstance(begin, (int, float)):
            continue
        timepoints.append({"markName": f"w{len(spoken)}", "timeSeconds": float(begin) / 1000})
        spoken.append(text)
    return spoken, timepoints


async def _post_tts(text: str, language: str) -> str:
    model = settings.dashscope_tts_model.strip()
    spoken_input: dict = {
        "text": text,
        "voice": voice_for(language),
    }
    if model.startswith("qwen") and not model.startswith("qwen-audio-"):
        spoken_input["language_type"] = language_type_for(language)
    else:
        spoken_input.update(
            {
                "format": "mp3",
                "sample_rate": 22050,
                "language_hints": language_hints(language),
                "word_timestamp_enabled": True,
            }
        )
    async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.post(
            tts_url(model),
            headers=auth_headers(),
            json={"model": model, "input": spoken_input},
        )
        if response.status_code >= 400:
            detail = response.text[:500]
            raise RuntimeError(f"Alibaba TTS failed ({response.status_code}): {detail}")
        return response.text


async def synthesize(text: str, language: str = "en-US") -> dict:
    if len(text.strip()) < 5:
        logger.warning("[Alibaba TTS] text too short, skipping: %r", text)
        return _EMPTY_RESULT

    if language.replace("_", "-").lower().startswith("id"):
        logger.info("[Alibaba TTS] Bahasa Indonesia uses language_type Auto")

    raw = await _post_tts(text, language)
    audio, words, audio_url = parse_tts_events(raw)
    if not audio and not audio_url and raw.lstrip().startswith("{"):
        audio, words, audio_url = parse_tts_events("data: " + raw)
    if not audio and audio_url:
        async with httpx.AsyncClient(timeout=30.0) as client:
            downloaded = await client.get(audio_url)
            downloaded.raise_for_status()
            audio = downloaded.content
    if not audio:
        raise RuntimeError("Alibaba TTS returned no audio")

    spoken, timepoints = words_to_timepoints(words)
    if not spoken:
        spoken = _segment_words(text, language)
        timepoints = []
    visemes = build_viseme_frames(spoken, timepoints)
    logger.info(
        "[Alibaba TTS] model=%s voice=%s lang=%s words=%d timed=%s",
        settings.dashscope_tts_model,
        voice_for(language),
        language,
        len(spoken),
        bool(timepoints),
    )
    return {
        "audioBase64": base64.b64encode(audio).decode("utf-8"),
        "mimeType": _mime_type(audio),
        "visemes": visemes,
    }
