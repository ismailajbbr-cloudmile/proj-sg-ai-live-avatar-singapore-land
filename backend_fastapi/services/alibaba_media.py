"""Alibaba image and video models behind the neutral media operations."""

import asyncio
import logging

import httpx

from config import settings
from services.alibaba_client import api_host, auth_headers
from services.media import MediaAsset

logger = logging.getLogger(__name__)

_VIDEO_TIMEOUT_S = 240
_POLL_INTERVAL_S = 5


class AlibabaMedia:
    async def create_image(self, prompt: str) -> MediaAsset:
        body = await _post_json(
            "/api/v1/services/aigc/multimodal-generation/generation",
            {
                "model": settings.dashscope_image_model,
                "input": {
                    "messages": [
                        {"role": "user", "content": [{"text": prompt}]},
                    ]
                },
                "parameters": {"size": "1024*1024", "n": 1, "watermark": False},
            },
        )
        return MediaAsset(kind="image", url=_image_url(body))

    async def edit_image(self, prompt: str, image_url: str) -> MediaAsset:
        body = await _post_json(
            "/api/v1/services/aigc/multimodal-generation/generation",
            {
                "model": settings.dashscope_image_edit_model,
                "input": {
                    "messages": [
                        {
                            "role": "user",
                            "content": [{"text": prompt}, {"image": image_url}],
                        }
                    ]
                },
                "parameters": {"size": "1024*1024", "n": 1, "watermark": False},
            },
        )
        return MediaAsset(kind="image", url=_image_url(body))

    async def create_video(self, prompt: str, image_url: str | None = None) -> MediaAsset:
        model = (
            settings.dashscope_video_from_image_model
            if image_url
            else settings.dashscope_video_model
        )
        video_input: dict = {"prompt": prompt}
        if image_url:
            # Wan 2.7+ image-to-video takes the first frame as a typed media item.
            video_input["media"] = [{"type": "first_frame", "url": image_url}]
        submitted = await _post_json(
            "/api/v1/services/aigc/video-generation/video-synthesis",
            {
                "model": model,
                "input": video_input,
                "parameters": {
                    "resolution": "720P" if image_url else "480P",
                    "duration": 5,
                    "prompt_extend": False,
                    "watermark": False,
                },
            },
            extra_headers={"X-DashScope-Async": "enable"},
        )
        task_id = (submitted.get("output") or {}).get("task_id")
        if not task_id:
            raise RuntimeError("Alibaba video task did not return a task id")
        finished = await _wait_for_task(task_id)
        url = (finished.get("output") or {}).get("video_url")
        if not url:
            message = (finished.get("output") or {}).get("message") or finished
            raise RuntimeError(f"Alibaba video task failed: {message}")
        return MediaAsset(kind="video", url=url)


def _image_url(body: dict) -> str:
    choices = (body.get("output") or {}).get("choices") or []
    for choice in choices:
        content = ((choice.get("message") or {}).get("content")) or []
        for part in content:
            if isinstance(part, dict) and part.get("image"):
                return str(part["image"])
    raise RuntimeError(f"Alibaba image response had no image URL: {body.get('message') or body.get('code')}")


async def _post_json(path: str, payload: dict, extra_headers: dict | None = None) -> dict:
    headers = auth_headers()
    if extra_headers:
        headers.update(extra_headers)
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(f"{api_host()}{path}", headers=headers, json=payload)
        if response.status_code >= 400:
            raise RuntimeError(f"Alibaba media failed ({response.status_code}): {response.text[:500]}")
        return response.json()


async def _wait_for_task(task_id: str) -> dict:
    headers = auth_headers()
    deadline = asyncio.get_running_loop().time() + _VIDEO_TIMEOUT_S
    async with httpx.AsyncClient(timeout=30.0) as client:
        while True:
            response = await client.get(f"{api_host()}/api/v1/tasks/{task_id}", headers=headers)
            response.raise_for_status()
            body = response.json()
            status = (body.get("output") or {}).get("task_status", "")
            logger.info("[Alibaba media] task=%s status=%s", task_id, status)
            if status in {"SUCCEEDED", "FAILED", "CANCELED", "UNKNOWN"}:
                return body
            if asyncio.get_running_loop().time() >= deadline:
                raise TimeoutError(f"Alibaba video task {task_id} did not finish")
            await asyncio.sleep(_POLL_INTERVAL_S)
