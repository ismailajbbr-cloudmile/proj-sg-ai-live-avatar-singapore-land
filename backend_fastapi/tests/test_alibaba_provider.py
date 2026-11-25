"""Offline checks for the Alibaba provider. No network calls."""

import asyncio
import json

import pytest

from config import settings
from services.alibaba_chat import (
    _plan_jobs,
    _prepare_history,
    _strip_media_urls,
    history_to_messages,
)
from services.alibaba_search import format_knowledge_context
from services.alibaba_tts import language_hints, parse_tts_events, words_to_timepoints
from services.background_jobs import Job, followup_message
from services.gemini import _is_small_talk
from services.media import (
    MediaAsset,
    create_image,
    resolve_image_url,
    run_media_operation,
)


def test_history_maps_gemini_roles():
    messages = history_to_messages(
        [
            {"role": "user", "parts": [{"text": "Hello"}]},
            {"role": "model", "parts": [{"text": "Welcome."}]},
        ]
    )
    assert messages == [
        {"role": "user", "content": "Hello"},
        {"role": "assistant", "content": "Welcome."},
    ]


def test_small_talk_covers_three_languages():
    assert _is_small_talk("hello")
    assert _is_small_talk("你好")
    assert _is_small_talk("halo")
    assert _is_small_talk("terima kasih")
    assert not _is_small_talk("where is the food court")


def test_language_hints():
    assert language_hints("en-US") == ["en"]
    assert language_hints("zh-CN") == ["zh"]
    assert language_hints("id-ID") == ["id"]


def test_tts_sse_audio_and_word_times():
    event = {
        "output": {
            "type": "sentence-end",
            "audio": {"data": "aGk="},
            "sentence": {
                "words": [
                    {"text": "Hi", "begin_time": 0, "end_time": 200},
                    {"text": "there", "begin_time": 200, "end_time": 500},
                ]
            },
        }
    }
    audio, words, audio_url = parse_tts_events("data: " + json.dumps(event))
    assert audio_url == ""
    assert audio == b"hi"
    spoken, timepoints = words_to_timepoints(words)
    assert spoken == ["Hi", "there"]
    assert timepoints[1]["markName"] == "w1"
    assert timepoints[1]["timeSeconds"] == 0.2


def test_edit_reuses_the_picture_from_this_chat():
    known = ["https://dashscope-463f.oss-accelerate.aliyuncs.com/picture"]
    assert resolve_image_url("the previous image", known, "make it blue") == known[0]
    pasted = "https://example.com/new.png"
    assert resolve_image_url(pasted, known, f"edit {pasted}") == pasted


_PICTURE = "https://dashscope-463f.oss-accelerate.aliyuncs.com/1d/picture.png?Signature=abc"


def _tool_call(name: str, arguments: dict) -> dict:
    return {"id": name, "function": {"name": name, "arguments": json.dumps(arguments)}}


def _plan(reply: dict, latest_picture: str, user_text: str):
    return asyncio.run(_plan_jobs(reply, latest_picture, user_text))


def test_tool_calls_become_background_job_requests():
    reply = {
        "tool_calls": [
            _tool_call("web_search", {"query": "weather in Singapore"}),
            _tool_call("edit_image", {"prompt": "make it blue", "image_url": "the picture"}),
            _tool_call("create_video", {"prompt": "a cat dancing", "from_latest_picture": False}),
            _tool_call("wan_t2i", {"prompt": "x"}),
        ]
    }
    requests, outputs = _plan(reply, _PICTURE, "make it blue")
    assert [r["operation"] for r in requests] == ["web_search", "edit_image", "create_video"]
    assert requests[1]["arguments"]["image_url"] == _PICTURE
    assert requests[2]["arguments"]["image_url"] == ""
    assert len(outputs) == 4
    assert "Unknown tool" in outputs[3]


def test_video_from_the_latest_picture_keeps_the_instruction():
    reply = {
        "tool_calls": [
            _tool_call(
                "create_video",
                {"prompt": "the robot waves", "from_latest_picture": True},
            )
        ]
    }
    requests, _outputs = _plan(reply, _PICTURE, "turn that picture into a video")
    assert requests[0]["arguments"]["prompt"] == "the robot waves"
    assert requests[0]["arguments"]["image_url"] == _PICTURE
    assert "from_latest_picture" not in requests[0]["arguments"]


def test_clear_media_requests_force_a_tool_call():
    from services.alibaba_chat import _request_body, _wants_media

    assert _wants_media("create a video based on the image where the cats are eating")
    assert _wants_media("generate an image of two cats")
    assert _wants_media("tolong buat gambar kucing")
    assert _wants_media("画一只猫的图片")
    assert not _wants_media("what is the weather in Singapore right now?")
    assert not _wants_media("What is in this picture?")
    assert not _wants_media("hello")

    body = _request_body(
        [{"role": "user", "content": "make a video"}],
        temperature=0.4,
        enable_search=False,
        tools=[{"type": "function", "function": {"name": "create_video"}}],
        stream=False,
        tool_choice="required",
    )
    assert body["tool_choice"] == "required"
    auto = _request_body(
        [{"role": "user", "content": "hi"}],
        temperature=0.4,
        enable_search=False,
        tools=[{"type": "function", "function": {"name": "create_video"}}],
        stream=False,
    )
    assert "tool_choice" not in auto


def test_edit_without_a_picture_starts_no_job():
    reply = {"tool_calls": [_tool_call("edit_image", {"prompt": "make it blue", "image_url": ""})]}
    requests, outputs = _plan(reply, "", "make it blue")
    assert requests == []
    assert "No picture" in outputs[0]


def test_browse_tool_calls_become_job_requests():
    reply = {
        "tool_calls": [
            _tool_call(
                "browse_web",
                {
                    "goal": "Find the mall opening hours",
                    "title": "Opening hours",
                    "description": "Check the official site",
                },
            ),
            _tool_call("get_browse_screen", {}),
            _tool_call("stop_browse", {}),
        ]
    }
    requests, outputs = _plan(reply, "", "use the browser")
    assert [r["operation"] for r in requests] == ["browse_web"]
    assert requests[0]["arguments"]["title"] == "Opening hours"
    # No browser session exists offline, so both inline tools answer without a job.
    assert outputs[1].startswith("No browser session")
    assert "running right now" in outputs[2]


def test_history_hides_signed_urls_but_remembers_the_picture():
    history = [{"role": "bot", "text": f"Here it is.\n[image] {_PICTURE}"}]
    messages, latest = _prepare_history(history)
    assert latest == _PICTURE
    assert "https://" not in messages[0]["content"]
    assert _strip_media_urls(f"Done! [image] {_PICTURE}") == "Done!"


def test_followup_message_describes_each_result():
    search = Job(id="1", owner="u", operation="web_search", request="weather?", status="done", text="31C")
    assert "31C" in followup_message(search)
    image = Job(
        id="2", owner="u", operation="create_image", request="a cat", status="done",
        media=MediaAsset(kind="image", url=_PICTURE),
    )
    assert "shown on screen" in followup_message(image)
    assert _PICTURE not in followup_message(image)
    failed = Job(id="3", owner="u", operation="create_video", request="a cat", status="failed", error="boom")
    assert "did not work" in followup_message(failed)


def test_unknown_media_operation_is_rejected():
    with pytest.raises(ValueError, match="Unknown media operation"):
        asyncio.run(run_media_operation("wan_t2i", {"prompt": "a circle"}))


def test_google_media_is_not_implemented(monkeypatch):
    monkeypatch.setattr(settings, "ai_provider", "google")
    with pytest.raises(NotImplementedError, match="google"):
        asyncio.run(create_image("a circle"))


def test_knowledge_context_marks_web_source():
    context = format_knowledge_context(["Marina Square Level 1"])
    assert "[datastore: web]" in context
    assert "Marina Square Level 1" in context


def test_footer_text_is_one_free_text_setting(monkeypatch):
    from routers.config_router import get_config

    monkeypatch.setattr(settings, "footer_text", "Powered by Qwen")
    assert asyncio.run(get_config())["footer_text"] == "Powered by Qwen"
    monkeypatch.setattr(settings, "footer_text", "Ask me about events at Marina Square")
    assert asyncio.run(get_config())["footer_text"] == "Ask me about events at Marina Square"
    monkeypatch.setattr(settings, "footer_text", "  ")
    assert asyncio.run(get_config())["footer_text"] == ""


def test_tool_name_before_the_gesture_is_dropped():
    from routers.chat import _parse_leading_gesture

    gesture, text = _parse_leading_gesture("browse_web idle\nI'll open Wikipedia for you.")
    assert gesture == "idle"
    assert text == "I'll open Wikipedia for you."
    assert _parse_leading_gesture("idle\nHello") == ("idle", "Hello")
    assert _parse_leading_gesture("Hello there") == ("idle", "Hello there")


_DECLARED_TOOLS = [
    {"type": "function", "function": {"name": "browse_web"}},
    {"type": "function", "function": {"name": "create_image"}},
]


def test_text_tool_call_becomes_a_real_call_and_a_job():
    from services.alibaba_chat import _recover_text_tool_call

    reply = {
        "role": "assistant",
        "content": 'browse_web {"goal": "Open Wikipedia", "title": "Wikipedia"}',
    }
    recovered = _recover_text_tool_call(reply, _DECLARED_TOOLS)
    calls = recovered["tool_calls"]
    assert calls[0]["function"]["name"] == "browse_web"
    assert json.loads(calls[0]["function"]["arguments"])["goal"] == "Open Wikipedia"

    requests, _outputs = _plan(recovered, "", "buka wikipedia di browser")
    assert [request["operation"] for request in requests] == ["browse_web"]


def test_plain_text_and_unknown_tools_stay_text():
    from services.alibaba_chat import _recover_text_tool_call

    assert "tool_calls" not in _recover_text_tool_call(
        {"content": "Sure, opening it now."}, _DECLARED_TOOLS
    )
    assert "tool_calls" not in _recover_text_tool_call(
        {"content": 'delete_everything {"target": "prod"}'}, _DECLARED_TOOLS
    )


def test_leading_tool_name_detects_a_written_call():
    from services.alibaba_chat import _leading_tool_name

    assert _leading_tool_name("browse_web\nidle\nOpening Wikipedia now.", _DECLARED_TOOLS) == "browse_web"
    assert _leading_tool_name("Open the site first.", _DECLARED_TOOLS) == ""
    assert _leading_tool_name("browse_web please", None) == ""


def test_written_browse_call_is_forced_and_becomes_a_job(monkeypatch):
    from services.alibaba_chat import stream_qwen_response

    replies = [
        {"choices": [{"message": {"content": "browse_web\nidle\nOpening it now."}}]},
        {
            "choices": [
                {
                    "message": {
                        "content": None,
                        "tool_calls": [
                            _tool_call(
                                "browse_web",
                                {"goal": "Open Wikipedia", "title": "Wikipedia"},
                            )
                        ],
                    }
                }
            ]
        },
        {"choices": [{"message": {"content": "idle\nSedang membuka Wikipedia."}}]},
    ]
    calls: list[dict] = []

    async def fake_complete(_messages, **kwargs):
        calls.append(kwargs)
        return replies[len(calls) - 1]

    monkeypatch.setattr("services.alibaba_chat._complete", fake_complete)

    text: list[str] = []
    events: list[dict] = []

    async def run():
        async for item in stream_qwen_response(
            "buka wikipedia di browser", [], language="id-ID", owner="diag"
        ):
            if isinstance(item, dict):
                events.append(item)
            else:
                text.append(item)

    asyncio.run(run())
    assert "Sedang membuka Wikipedia" in "".join(text)
    assert [event["operation"] for event in events] == ["browse_web"]
    assert calls[1]["tool_choice"] == {"type": "function", "function": {"name": "browse_web"}}
