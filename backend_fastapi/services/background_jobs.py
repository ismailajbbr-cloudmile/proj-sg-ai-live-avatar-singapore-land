"""Background jobs for slow chat tools (web search, image, video, browser).

The chat turn replies right away and starts a job. When the job finishes, the
frontend calls /chat with the job id, and the server turns the result into an
automatic message so the assistant can announce it.

Browser jobs also keep live progress (step count, current URL, screenshot) so
the frontend can show the automated page while it runs.

Jobs live in memory, so they are lost on restart and assume a single worker.
"""

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from config import settings
from services.media import MediaAsset, run_media_operation

logger = logging.getLogger(__name__)

_JOB_TTL_S = 2 * 60 * 60
PREVIEW_MAX_B64 = 400_000

BROWSE_OPERATIONS = frozenset({"browse_web", "continue_browse"})

_LABELS = {
    "web_search": "web search",
    "create_image": "image",
    "edit_image": "image edit",
    "create_video": "video",
    "browse_web": "browser session",
    "continue_browse": "browser session",
}


@dataclass
class Job:
    id: str
    owner: str
    operation: str
    request: str
    status: str = "running"  # running, done, failed
    text: str = ""
    media: MediaAsset | None = None
    error: str = ""
    announced: bool = False
    created_at: float = 0.0
    # Browser jobs only
    title: str = ""
    description: str = ""
    goal: str = ""
    step: int = 0
    url: str = ""
    last_intent: str = ""
    steps: list[dict[str, str]] = field(default_factory=list)
    preview_mime: str = ""
    preview_b64: str = ""
    screen_text: str = ""
    cancel_requested: bool = False


_jobs: dict[str, Job] = {}
_tasks: set[asyncio.Task] = set()


def start_job(
    *,
    owner: str,
    operation: str,
    arguments: dict,
    request: str,
) -> Job:
    _prune()
    job = Job(
        id=uuid.uuid4().hex,
        owner=owner,
        operation=operation,
        request=request[:300],
        created_at=time.time(),
    )
    _jobs[job.id] = job
    task = asyncio.create_task(_run(job, arguments))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    logger.info("[jobs] started id=%s operation=%s", job.id, operation)
    return job


def get_job(job_id: str, owner: str) -> Job | None:
    job = _jobs.get(job_id)
    if job is None or job.owner != owner:
        return None
    return job


async def _run(job: Job, arguments: dict) -> None:
    try:
        if job.operation == "web_search":
            from services.web_search import search_web

            job.text = await search_web(str(arguments.get("query") or job.request))
        elif job.operation in BROWSE_OPERATIONS:
            await _run_browse(job, arguments)
        else:
            job.media = await run_media_operation(job.operation, arguments)
        job.status = "done"
    except Exception as exc:  # noqa: BLE001 - any failure is reported back to the user
        logger.warning("[jobs] id=%s operation=%s failed: %s", job.id, job.operation, exc)
        job.error = str(exc)[:300]
        job.status = "failed"
    logger.info("[jobs] finished id=%s status=%s", job.id, job.status)


async def _run_browse(job: Job, arguments: dict) -> None:
    """Run the Playwright + Qwen-VL loop, publishing progress on the job itself."""
    from services import browser_use

    job.goal = str(arguments.get("goal") or job.request)
    job.title = str(arguments.get("title") or "Browser")[:120]
    job.description = str(arguments.get("description") or job.goal)[:300]
    start_url = str(arguments.get("start_url") or "").strip() or None

    def on_step(action: str, intent: str, url: str, preview_b64: str) -> None:
        job.step += 1
        job.url = url
        job.last_intent = intent
        job.steps.append({"action": action, "intent": intent, "url": url})
        if preview_b64 and len(preview_b64) <= PREVIEW_MAX_B64:
            job.preview_mime = "image/jpeg"
            job.preview_b64 = preview_b64
        logger.info("[browse] id=%s step=%s action=%s url=%s", job.id, job.step, action, url)

    result = await asyncio.to_thread(
        browser_use.run_browse,
        goal=job.goal,
        start_url=start_url,
        max_turns=settings.browse_max_turns,
        on_step=on_step,
        should_stop=lambda: job.cancel_requested,
    )
    if result.preview_b64:
        job.preview_mime = result.preview_mime or "image/jpeg"
        job.preview_b64 = result.preview_b64
    job.text = result.summary
    if job.cancel_requested:
        job.status = "failed"
        job.error = "Stopped."


def followup_message(job: Job) -> str:
    """Automatic message the model answers when a job finishes."""
    label = _LABELS.get(job.operation, job.operation)
    prefix = "[Automatic update from the system, not typed by the visitor]"
    if job.status == "failed":
        if job.operation in BROWSE_OPERATIONS and job.cancel_requested:
            return (
                f"{prefix} The browser session for the visitor's request \"{job.request}\" "
                "was stopped. The last screenshot is still on screen. "
                "Acknowledge it in one short sentence and ask what to do next."
            )
        return (
            f"{prefix} The {label} for the visitor's request \"{job.request}\" did not work. "
            f"Reason: {job.error or 'unknown'}. "
            "Apologise in one short sentence and offer to try again."
        )
    if job.operation == "web_search":
        return (
            f"{prefix} The web search for the visitor's question \"{job.request}\" finished.\n"
            f"Search results:\n{job.text}\n\n"
            "Answer the visitor's question from these results in two or three short sentences."
        )
    if job.operation in BROWSE_OPERATIONS:
        return (
            f"{prefix} The browser session for the visitor's request \"{job.request}\" finished "
            f"after {job.step} steps. Outcome: {job.text or job.description}. "
            "The last screenshot is on screen. Summarise the answer in two or three short "
            "sentences. Never write a URL."
        )
    return (
        f"{prefix} The {label} for the visitor's request \"{job.request}\" is ready "
        "and is now shown on screen. Tell the visitor in one short sentence. Do not write any URL."
    )


def _prune() -> None:
    cutoff = time.time() - _JOB_TTL_S
    for job_id in [key for key, job in _jobs.items() if job.created_at < cutoff]:
        _jobs.pop(job_id, None)


def latest_browse(owner: str) -> Job | None:
    """Most recent browser job for this owner, finished or not."""
    candidates = [
        job for job in _jobs.values()
        if job.owner == owner and job.operation in BROWSE_OPERATIONS
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda job: job.created_at)


def stop_browse(job_id: str, owner: str) -> Job | None:
    """Ask a running browser job to stop after its current step."""
    job = get_job(job_id, owner)
    if job is None or job.operation not in BROWSE_OPERATIONS:
        return None
    if job.status != "running" or job.cancel_requested:
        return None
    job.cancel_requested = True
    return job


def public_status(job: Job) -> dict[str, Any]:
    """Serialise a job for the polling endpoint. Screenshot included only for browse."""
    payload: dict[str, Any] = {
        "id": job.id,
        "operation": job.operation,
        "status": job.status,
        "error": job.error,
    }
    if job.operation in BROWSE_OPERATIONS:
        payload["browse"] = {
            "title": job.title,
            "description": job.description,
            "goal": job.goal,
            "step": job.step,
            "url": job.url,
            "last_intent": job.last_intent,
            "summary": job.text or (job.error if job.status == "failed" else ""),
            "steps": job.steps[-40:],
            "mimeType": job.preview_mime,
            "data": job.preview_b64,
        }
    return payload
