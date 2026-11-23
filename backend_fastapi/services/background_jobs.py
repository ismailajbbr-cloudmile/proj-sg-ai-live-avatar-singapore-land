"""Background jobs for slow chat tools (web search, image, video).

The chat turn replies right away and starts a job. When the job finishes, the
frontend calls /chat with the job id, and the server turns the result into an
automatic message so the assistant can announce it.

Jobs live in memory, so they are lost on restart and assume a single worker.
"""

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass

from services.media import MediaAsset, run_media_operation

logger = logging.getLogger(__name__)

_JOB_TTL_S = 2 * 60 * 60

_LABELS = {
    "web_search": "web search",
    "create_image": "image",
    "edit_image": "image edit",
    "create_video": "video",
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
        else:
            job.media = await run_media_operation(job.operation, arguments)
        job.status = "done"
    except Exception as exc:  # noqa: BLE001 - any failure is reported back to the user
        logger.warning("[jobs] id=%s operation=%s failed: %s", job.id, job.operation, exc)
        job.error = str(exc)[:300]
        job.status = "failed"
    logger.info("[jobs] finished id=%s status=%s", job.id, job.status)


def followup_message(job: Job) -> str:
    """Automatic message the model answers when a job finishes."""
    label = _LABELS.get(job.operation, job.operation)
    prefix = "[Automatic update from the system, not typed by the visitor]"
    if job.status == "failed":
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
    return (
        f"{prefix} The {label} for the visitor's request \"{job.request}\" is ready "
        "and is now shown on screen. Tell the visitor in one short sentence. Do not write any URL."
    )


def _prune() -> None:
    cutoff = time.time() - _JOB_TTL_S
    for job_id in [key for key, job in _jobs.items() if job.created_at < cutoff]:
        _jobs.pop(job_id, None)
