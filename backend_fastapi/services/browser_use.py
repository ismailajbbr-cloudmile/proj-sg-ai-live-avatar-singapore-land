"""Browser automation driven by Qwen-VL (DashScope) and Playwright.

The model only picks one action per turn from the current screenshot; this
module performs it in headless Chromium and feeds the next screenshot back.
Same loop shape as Gemini Computer Use, but the action space is JSON we own.
"""

from __future__ import annotations

import base64
import json
import logging
import re
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import httpx

from config import settings
from services.alibaba_client import auth_headers, chat_completions_url

logger = logging.getLogger(__name__)

SCREEN_WIDTH = 1280
SCREEN_HEIGHT = 800
MODEL_IMAGE_QUALITY = 75
PREVIEW_IMAGE_QUALITY = 50
MAX_LOG_ACTIONS = 8
DEFAULT_START_URL = "https://www.google.com"

_JSON_OBJECT = re.compile(r"\{.*\}", re.DOTALL)
_FENCE = re.compile(r"```[a-zA-Z]*")
# Vision models sometimes drop the "y" key: {"action":"click","x":458, 940]
_X_AND_PLAIN_Y = re.compile(r'"x"\s*:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)')
_STRAY_CLOSE = re.compile(r'(?<=[\d"])\]')


def _field(source: str, name: str) -> str | None:
    match = re.search(rf'"{name}"\s*:\s*"((?:[^"\\]|\\.)*)"', source)
    return match.group(1) if match else None


def _number(source: str, name: str) -> str | None:
    match = re.search(rf'"{name}"\s*:\s*(-?\d+(?:\.\d+)?)', source)
    return match.group(1) if match else None

_SYSTEM_PROMPT = f"""You control a real web browser for a visitor standing at a mall kiosk.
Each turn you get one screenshot of the current page and a short history. Choose the single next action that moves the goal forward.

Reply with exactly one JSON object and nothing else. No prose, no markdown fences.

Available actions:
{{"action":"click","x":<int>,"y":<int>,"intent":"<short reason>"}}
{{"action":"double_click","x":<int>,"y":<int>,"intent":"<short reason>"}}
{{"action":"right_click","x":<int>,"y":<int>,"intent":"<short reason>"}}
{{"action":"type","text":"<text to type>","x":<int>,"y":<int>,"press_enter":<true|false>,"intent":"<short reason>"}}
{{"action":"scroll","direction":"up|down|left|right","magnitude_in_pixels":<int>,"x":<int>,"y":<int>,"intent":"<short reason>"}}
{{"action":"press_key","key":"<Enter|Escape|Tab|PageDown|PageUp|Home|End>","intent":"<short reason>"}}
{{"action":"navigate","url":"https://...","intent":"<short reason>"}}
{{"action":"go_back","intent":"<short reason>"}}
{{"action":"wait","seconds":<int>,"intent":"<short reason>"}}
{{"action":"finish","summary":"<what the visitor should hear, one or two sentences>"}}

Rules:
- x and y are integers from 0 to 1000, measured from the left and top edge of the screenshot (0 = left or top, 1000 = right or bottom). The screenshot is {SCREEN_WIDTH} by {SCREEN_HEIGHT} pixels.
- An x/y in "type" clicks that field before typing; leave both out to type into the focused field.
- Give one action per turn, then wait for the next screenshot.
- Never invent page content. Read the screenshot. If a cookie or consent banner blocks the page, dismiss it first.
- If a search engine shows a captcha or "unusual traffic" page, do not fight it: use "navigate" to go straight to the site's home page instead.
- Use "navigate" only for a new site or a direct URL. Use "go_back" to return.
- Do not log in, pay, send messages, or submit personal data. Ask for "finish" instead when blocked.
- Call "finish" as soon as the goal is answered, or when it cannot be done. Put the answer in "summary".
- If the visitor's goal is not in English, write the summary in the goal's language."""


@dataclass
class BrowseResult:
    summary: str
    preview_mime: str = ""
    preview_b64: str = ""
    steps: list[dict[str, str]] = field(default_factory=list)


OnStep = Callable[[str, str, str, str], None]


def _model_name() -> str:
    return settings.dashscope_browse_model.strip() or "qwen3-vl-plus"


def _encode(raw: bytes) -> str:
    return base64.b64encode(raw).decode("ascii")


def _strip_noise(text: str) -> str:
    return _FENCE.sub("", text or "").strip()


def _candidates(cleaned: str) -> list[str]:
    """Repaired JSON bodies to try, best first."""
    match = _JSON_OBJECT.search(cleaned)
    if not match:
        return [cleaned]
    body = match.group(0)
    repaired = _STRAY_CLOSE.sub("", _X_AND_PLAIN_Y.sub(r'"x":\1,"y":\2', body))
    versions = [body, repaired]
    if not repaired.rstrip().endswith("}"):
        versions.append(repaired.rstrip().rstrip(",") + "}")
    return versions


def _extract_fields(cleaned: str) -> dict[str, Any] | None:
    """Last resort: pull the fields out of a broken object by name."""
    action = _field(cleaned, "action")
    if not action:
        return None
    decision: dict[str, Any] = {"action": action}
    x = _number(cleaned, "x")
    y = _number(cleaned, "y")
    if y is None and x is not None:
        pair = _X_AND_PLAIN_Y.search(cleaned)
        if pair:
            x, y = pair.group(1), pair.group(2)
    if x is not None:
        decision["x"] = x
    if y is not None:
        decision["y"] = y
    for name in ("text", "url", "key", "direction", "summary"):
        value = _field(cleaned, name)
        if value is not None:
            decision[name] = value
    for name in ("seconds", "magnitude_in_pixels"):
        value = _number(cleaned, name)
        if value is not None:
            decision[name] = value
    press = re.search(r'"press_enter"\s*:\s*(true|false)', cleaned, re.IGNORECASE)
    if press:
        decision["press_enter"] = press.group(1).lower() == "true"
    return decision


def _parse_decision(text: str) -> dict[str, Any] | None:
    """Read the JSON action out of a model reply. None means the reply was unusable."""
    cleaned = _strip_noise(text)
    for candidate in _candidates(cleaned):
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict) and parsed.get("action"):
            return parsed
    return _extract_fields(cleaned)


def _as_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return fallback


def _to_pixels(value: Any, size: int) -> int:
    """Model coordinates are 0-1000 on each axis; convert them to screenshot pixels."""
    raw = float(_as_int(value, 500))
    if raw < 0:
        raw = 0.0
    elif raw > 1000:
        raw = 1000.0
    return int(raw / 1000 * size)


def _step_prompt(*, goal: str, step: int, url: str, last_result: str, log: list[str]) -> str:
    recent = "\n".join(log[-MAX_LOG_ACTIONS:]) or "(none yet)"
    last = last_result or "(none; this is the first screenshot)"
    return (
        f"Goal: {goal}\n"
        f"Current page: {url or 'about:blank'}\n"
        f"Turn: {step + 1}\n"
        f"Previous action result: {last}\n"
        f"Recent actions:\n{recent}\n\n"
        "Choose the single next action as JSON."
    )


def _post_chat(payload: dict[str, Any], *, timeout: float = 90.0) -> dict[str, Any]:
    with httpx.Client(timeout=timeout) as client:
        response = client.post(chat_completions_url(), headers=auth_headers(), json=payload)
        if response.status_code >= 400:
            raise RuntimeError(
                f"Qwen browser model failed ({response.status_code}): {response.text[:400]}"
            )
        return response.json()


def _reply_text(result: dict[str, Any]) -> str:
    message = (result.get("choices") or [{}])[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            str(block.get("text") or "") for block in content if isinstance(block, dict)
        )
    return ""


def _ask_model(image_b64: str, prompt: str, *, temperature: float = 0.0) -> str:
    payload = {
        "model": _model_name(),
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
                    },
                    {"type": "text", "text": prompt},
                ],
            },
        ],
        "temperature": temperature,
    }
    return _reply_text(_post_chat(payload))


def describe_screenshot(image_b64: str, language: str = "en-US") -> str:
    """Short spoken description of what the last browser screenshot shows."""
    hint = "Answer in Chinese." if (language or "").startswith("zh") else "Answer in English."
    with httpx.Client(timeout=60.0) as client:
        response = client.post(
            chat_completions_url(),
            headers=auth_headers(),
            json={
                "model": _model_name(),
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
                            },
                            {
                                "type": "text",
                                "text": (
                                    "Describe what this browser screenshot shows for a voice "
                                    f"assistant. Two or three short sentences. {hint}"
                                ),
                            },
                        ],
                    }
                ],
                "temperature": 0.0,
            },
        )
        if response.status_code >= 400:
            raise RuntimeError(
                f"Qwen screenshot description failed ({response.status_code}): "
                f"{response.text[:300]}"
            )
        return _reply_text(response.json()).strip()


def _capture(page: Any, *, quality: int) -> bytes | None:
    try:
        return page.screenshot(type="jpeg", quality=quality, timeout=15_000)
    except Exception as exc:  # noqa: BLE001 - a lost page is reported as a stop, not a crash
        logger.warning("browser screenshot failed: %s", exc)
        return None


def _capture_pair(page: Any) -> tuple[str, str] | None:
    """One capture for the model and a lighter one for the UI. (model_b64, preview_b64)"""
    shot = _capture(page, quality=MODEL_IMAGE_QUALITY)
    if shot is None:
        return None
    preview = _capture(page, quality=PREVIEW_IMAGE_QUALITY)
    return _encode(shot), _encode(preview or shot)


def _perform(page: Any, decision: dict[str, Any]) -> str:
    """Run one model decision in the page. Returns a short result for the next turn."""
    name = str(decision.get("action") or "").strip().lower()
    x = _to_pixels(decision.get("x"), SCREEN_WIDTH)
    y = _to_pixels(decision.get("y"), SCREEN_HEIGHT)
    try:
        if name in ("click", "double_click", "right_click", "move"):
            if name == "click":
                page.mouse.click(x, y)
            elif name == "double_click":
                page.mouse.dblclick(x, y)
            elif name == "right_click":
                page.mouse.click(x, y, button="right")
            else:
                page.mouse.move(x, y)
            result = f"{name} at {x},{y}"
        elif name == "type":
            text = str(decision.get("text") or "")
            if decision.get("x") is not None and decision.get("y") is not None:
                page.mouse.click(x, y)
            page.keyboard.press("Meta+A")
            page.keyboard.press("Backspace")
            page.keyboard.type(text)
            if decision.get("press_enter"):
                page.keyboard.press("Enter")
            result = f"typed {text[:120]!r}"
        elif name == "navigate":
            url = str(decision.get("url") or "").strip()
            if not url:
                return "navigate failed: empty url"
            page.goto(url)
            result = f"opened {page.url}"
        elif name == "go_back":
            page.go_back()
            result = f"went back to {page.url}"
        elif name == "go_forward":
            page.go_forward()
            result = f"went forward to {page.url}"
        elif name == "scroll":
            direction = str(decision.get("direction") or "down").lower()
            pixels = _as_int(decision.get("magnitude_in_pixels"), 400) or 400
            dx = dy = 0
            if direction == "down":
                dy = pixels
            elif direction == "up":
                dy = -pixels
            elif direction == "left":
                dx = -pixels
            elif direction == "right":
                dx = pixels
            page.mouse.move(x, y)
            page.mouse.wheel(dx, dy)
            result = f"scrolled {direction} {pixels}px"
        elif name == "press_key":
            key = str(decision.get("key") or "Enter")
            page.keyboard.press(key)
            result = f"pressed {key}"
        elif name == "wait":
            seconds = max(1, min(_as_int(decision.get("seconds"), 2) or 2, 10))
            time.sleep(seconds)
            result = f"waited {seconds}s"
        else:
            return f"unsupported action {name!r}"
        page.wait_for_load_state(timeout=5000)
    except Exception as exc:  # noqa: BLE001 - the model gets the error and retries
        logger.warning("browser action %s failed: %s", name, exc)
        return f"{name} failed: {str(exc)[:180]}"
    return result


def run_browse(
    *,
    goal: str,
    start_url: str | None,
    max_turns: int,
    on_step: OnStep,
    should_stop: Callable[[], bool],
) -> BrowseResult:
    """Drive headless Chromium with Qwen-VL until the goal is finished or turns run out."""
    from playwright.sync_api import sync_playwright

    steps: list[dict[str, str]] = []
    log: list[str] = []
    preview = ""
    summary = ""
    initial = (start_url or DEFAULT_START_URL).strip()

    playwright = sync_playwright().start()
    browser = playwright.chromium.launch(
        headless=True,
        args=["--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox"],
    )
    try:
        context = browser.new_context(
            viewport={"width": SCREEN_WIDTH, "height": SCREEN_HEIGHT},
            ignore_https_errors=True,
        )
        page = context.new_page()
        page.set_default_timeout(15_000)
        try:
            page.goto(initial, wait_until="domcontentloaded")
        except Exception as exc:  # noqa: BLE001 - report the start page, then let the model retry
            logger.warning("browser start page failed: %s", exc)

        captured = _capture_pair(page)
        if captured is None:
            return BrowseResult(
                summary=f"Could not capture the starting page at {initial}.",
            )
        image_b64, preview = captured
        steps.append({"action": "navigate", "intent": "Open starting page", "url": page.url})
        on_step("navigate", "Open starting page", page.url, preview)
        result_text = ""
        invalid = 0

        for turn in range(max_turns):
            if should_stop():
                return BrowseResult("Stopped.", "image/jpeg", preview, steps)
            prompt = _step_prompt(
                goal=goal, step=turn, url=page.url, last_result=result_text, log=log
            )
            try:
                reply = _ask_model(image_b64, prompt)
            except Exception as exc:  # noqa: BLE001 - keep the screenshots we already have
                logger.warning("browser model turn %s failed: %s", turn + 1, exc)
                summary = f"Stopped at {page.url}: {str(exc)[:200]}"
                break

            decision = _parse_decision(reply)
            if decision is None:
                invalid += 1
                logger.info("browser model gave no usable action: %r", reply[:200])
                if invalid > 2:
                    summary = (
                        f"Stopped at {page.url}. The browser model kept returning actions "
                        "that could not be read."
                    )
                    break
                result_text = "Your last reply was not valid JSON. Reply with one JSON object only."
                continue

            action = str(decision.get("action") or "").strip().lower()
            intent = str(decision.get("intent") or action.replace("_", " ")).strip()

            if action in ("finish", "done", "stop"):
                summary = str(decision.get("summary") or "").strip() or f"Finished at {page.url}."
                steps.append({"action": "finish", "intent": summary[:200], "url": page.url})
                break

            invalid = 0
            result_text = _perform(page, decision)
            log.append(f"- {action}: {intent} -> {result_text}")

            if should_stop():
                return BrowseResult("Stopped.", "image/jpeg", preview, steps)

            captured = _capture_pair(page)
            if captured is None:
                summary = (
                    f"Stopped at {page.url}. The page could not be captured any more, "
                    "so browsing ended there."
                )
                break
            image_b64, preview = captured
            steps.append({"action": action, "intent": intent, "url": page.url})
            on_step(action, intent, page.url, preview)
        else:
            summary = f"Stopped after {max_turns} browser steps at {page.url}."

        if not summary:
            summary = f"Finished at {page.url}."
        return BrowseResult(summary, "image/jpeg", preview, steps)
    finally:
        try:
            browser.close()
        finally:
            playwright.stop()
