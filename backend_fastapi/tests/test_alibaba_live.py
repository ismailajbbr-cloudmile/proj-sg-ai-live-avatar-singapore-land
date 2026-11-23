"""Live Alibaba checks for the Qwen event.

These tests call Model Studio with the key in the repo .env.
They skip when that key is empty. They do not call Google.
"""

import asyncio
import base64

import pytest

from config import settings
from services.alibaba_client import chat_completions_url, tts_url
from services.background_jobs import followup_message, start_job
from services.chat_provider import stream_chat_response, synthesize_speech, uses_alibaba
from services.media import create_image, create_video, edit_image

pytestmark = pytest.mark.live

_HAS_KEY = bool(settings.dashscope_api_key.strip())
skip_without_key = pytest.mark.skipif(not _HAS_KEY, reason="DASHSCOPE_API_KEY is empty")


async def _turn(language: str, message: str, *, followup: bool = False) -> tuple[str, list[dict]]:
    parts: list[str] = []
    events: list[dict] = []
    async for item in stream_chat_response(message, [], language=language, followup=followup):
        if isinstance(item, dict):
            events.append(item)
        else:
            parts.append(item)
    return "".join(parts), events


def _collect(language: str, message: str) -> str:
    return asyncio.run(_turn(language, message))[0]


def test_event_config_is_alibaba_without_a_directory():
    assert uses_alibaba()
    assert settings.require_datastore_grounding is False
    assert settings.alibaba_knowledge_index_id.strip() == ""
    assert settings.alibaba_enable_web_search is True
    assert "googleapis.com" not in chat_completions_url()
    assert "googleapis.com" not in tts_url()
    assert chat_completions_url().startswith(settings.dashscope_api_host.rstrip("/"))


@skip_without_key
def test_qwen_answers_in_english_without_calling_google(monkeypatch):
    def refuse_google(*_args, **_kwargs):
        raise AssertionError("Google client was constructed during an Alibaba chat")

    monkeypatch.setattr("google.genai.Client", refuse_google, raising=False)
    text = _collect("en-US", "What is 2+2? Reply with the number only after the gesture line.")
    assert text.strip()
    assert "4" in text
    lowered = text.lower()
    assert "google" not in lowered
    assert "gemini" not in lowered


@skip_without_key
def test_qwen_answers_in_chinese():
    text = _collect("zh-CN", "1加1等于几？在手势行之后只用中文回答。")
    assert any("\u4e00" <= ch <= "\u9fff" for ch in text)


@skip_without_key
def test_qwen_answers_in_bahasa_indonesia():
    text = _collect("id-ID", "Berapa 1 ditambah 1? Jawab dalam bahasa Indonesia setelah baris gestur.")
    lowered = text.lower()
    assert "dua" in lowered or "2" in text


@skip_without_key
@pytest.mark.parametrize(
    ("language", "phrase"),
    [
        ("en-US", "Welcome to Marina Square."),
        ("zh-CN", "欢迎来到滨海广场。"),
        ("id-ID", "Selamat datang di Marina Square."),
    ],
)
def test_qwen_tts_returns_audio(language: str, phrase: str, monkeypatch):
    def refuse_google(*_args, **_kwargs):
        raise AssertionError("Google TTS client was constructed during Alibaba speech")

    monkeypatch.setattr(
        "google.cloud.texttospeech.TextToSpeechClient",
        refuse_google,
        raising=False,
    )
    result = asyncio.run(synthesize_speech(phrase, language))
    audio = base64.b64decode(result["audioBase64"])
    assert len(audio) > 500
    if audio.startswith(b"RIFF"):
        assert result["mimeType"] == "audio/wav"
    else:
        assert result["mimeType"] == "audio/mpeg"
        assert audio.startswith(b"ID3") or audio[0] == 0xFF
    assert result["visemes"]


@skip_without_key
def test_qwen_web_search_runs_in_background_then_announces():
    question = "What is the weather in Singapore right now?"

    async def run() -> tuple[str, list[dict], str]:
        ack, events = await _turn("en-US", question)
        requests = [event for event in events if event.get("type") == "job_request"]
        assert requests and requests[0]["operation"] == "web_search"
        job = start_job(
            owner="pytest",
            operation=requests[0]["operation"],
            arguments=requests[0]["arguments"],
            request=requests[0]["request"],
        )
        for _ in range(60):
            if job.status != "running":
                break
            await asyncio.sleep(1)
        assert job.status == "done", job.error
        answer, _ = await _turn("en-US", followup_message(job), followup=True)
        return ack, events, answer

    ack, _events, answer = asyncio.run(run())
    assert ack.strip()
    lowered = answer.lower()
    assert "cannot" not in lowered and "can't" not in lowered
    assert any(ch.isdigit() for ch in answer)


@skip_without_key
def test_create_image():
    asset = asyncio.run(create_image("a single red circle on a white background"))
    assert asset.kind == "image"
    assert asset.url.startswith("http")


@skip_without_key
def test_edit_image():
    original = asyncio.run(create_image("a single red circle on a white background"))
    edited = asyncio.run(edit_image("change the circle to blue", original.url))
    assert edited.kind == "image"
    assert edited.url.startswith("http")
    assert edited.url != original.url


@skip_without_key
def test_create_video():
    asset = asyncio.run(create_video("a red circle slowly fading to blue"))
    assert asset.kind == "video"
    assert asset.url.startswith("http")


@skip_without_key
def test_create_video_from_image():
    image = asyncio.run(create_image("a single red circle on a white background"))
    video = asyncio.run(create_video("the circle slowly turns blue", image.url))
    assert video.kind == "video"
    assert video.url.startswith("http")
