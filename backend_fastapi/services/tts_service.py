"""
Google Cloud TTS — Gemini 2.5 model with style prompt support.
Returns audio + viseme frames (linear-estimated timing; Gemini TTS returns no timepoints).
"""
import asyncio
import base64
from functools import partial

from google.cloud import texttospeech

from config import settings
from services.viseme import build_viseme_frames


def _create_client() -> texttospeech.TextToSpeechClient:
    return texttospeech.TextToSpeechClient()


async def synthesize(text: str, language: str = "en-US") -> dict:
    words = [w for w in text.strip().split() if w]
    if not words:
        raise ValueError("text is required")

    client = _create_client()

    request = texttospeech.SynthesizeSpeechRequest(
        input=texttospeech.SynthesisInput(
            text=text,
            prompt=settings.tts_voice_prompt,
        ),
        voice=texttospeech.VoiceSelectionParams(
            language_code=language,
            name=settings.tts_voice_name,
            model_name=settings.tts_model,
        ),
        audio_config=texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=1.0,
            pitch=0.0,
        ),
    )

    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None, partial(client.synthesize_speech, request=request)
    )

    audio_base64 = base64.b64encode(response.audio_content).decode("utf-8")

    # Gemini TTS returns no timepoints — viseme timing is linearly estimated
    visemes = build_viseme_frames(words, [])
    print(f"[TTS] Gemini ({settings.tts_model}/{settings.tts_voice_name}) words={len(words)}")

    return {
        "audioBase64": audio_base64,
        "mimeType": "audio/mpeg",
        "visemes": visemes,
    }
