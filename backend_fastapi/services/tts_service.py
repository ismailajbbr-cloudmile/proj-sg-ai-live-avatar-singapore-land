"""
Google Cloud TTS client — Python port of frontend_nextjs/src/app/api/tts/route.ts
"""
import asyncio
import base64
import re
from functools import partial

from google.cloud import texttospeech

from services.viseme import build_viseme_frames


def _get_voice_name(language: str) -> str:
    if language.startswith("zh"):
        return "cmn-CN-Wavenet-A"
    parts = language.split("-")
    lang, region = parts[0], parts[1] if len(parts) > 1 else "US"
    return f"{lang}-{region}-Neural2-F"


def _escape_ssml(text: str) -> str:
    text = text.replace("&", "&amp;")
    text = text.replace("<", "&lt;")
    text = text.replace(">", "&gt;")
    text = text.replace('"', "&quot;")
    return text


def _create_client() -> texttospeech.TextToSpeechClient:
    # Reads GOOGLE_APPLICATION_CREDENTIALS from env automatically
    return texttospeech.TextToSpeechClient()


async def synthesize(text: str, language: str = "en-US") -> dict:
    words = [w for w in text.strip().split() if w]
    if not words:
        raise ValueError("text is required")

    ssml_body = " ".join(
        f'<mark name="w{i}"/>{_escape_ssml(word)}' for i, word in enumerate(words)
    )
    ssml = f"<speak>{ssml_body}</speak>"

    client = _create_client()
    voice_name = _get_voice_name(language)

    request = texttospeech.SynthesizeSpeechRequest(
        input=texttospeech.SynthesisInput(ssml=ssml),
        voice=texttospeech.VoiceSelectionParams(
            language_code=language,
            ssml_gender=texttospeech.SsmlVoiceGender.FEMALE,
            name=voice_name,
        ),
        audio_config=texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=1.0,
            pitch=0.0,
        ),
    )

    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None,
        partial(client.synthesize_speech, request=request),
    )

    audio_base64 = base64.b64encode(response.audio_content).decode("utf-8")

    timepoints = []
    if hasattr(response, "timepoints") and response.timepoints:
        timepoints = [
            {"markName": tp.mark_name, "timeSeconds": tp.time_seconds}
            for tp in response.timepoints
        ]

    print(
        f"[TTS] voice={language} ({voice_name}) words={len(words)} timepoints={len(timepoints)}"
    )
    if not timepoints:
        print("[TTS] No timepoints returned – using estimated linear timing (~110ms/phoneme).")

    visemes = build_viseme_frames(words, timepoints)

    return {
        "audioBase64": audio_base64,
        "mimeType": "audio/mpeg",
        "visemes": visemes,
        "hasRealTimepoints": bool(timepoints),
    }
