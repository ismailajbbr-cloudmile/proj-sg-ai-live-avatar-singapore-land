"""Provider-neutral image and video operations.

Callers use these names. The active AI_PROVIDER supplies the model.
Google is not implemented yet; add a provider class and register it in
``_provider`` when that work starts.
"""

import re
from dataclasses import dataclass
from typing import Protocol

from config import settings
from services.chat_provider import uses_alibaba


@dataclass(frozen=True)
class MediaAsset:
    kind: str  # "image" or "video"
    url: str


class MediaProvider(Protocol):
    async def create_image(self, prompt: str) -> MediaAsset: ...

    async def edit_image(self, prompt: str, image_url: str) -> MediaAsset: ...

    async def create_video(self, prompt: str, image_url: str | None = None) -> MediaAsset: ...


def _provider() -> MediaProvider:
    if uses_alibaba():
        from services.alibaba_media import AlibabaMedia

        return AlibabaMedia()
    raise NotImplementedError(
        f"Media generation is not implemented for AI_PROVIDER={settings.ai_provider}."
    )


async def create_image(prompt: str) -> MediaAsset:
    return await _provider().create_image(prompt)


async def edit_image(prompt: str, image_url: str) -> MediaAsset:
    return await _provider().edit_image(prompt, image_url)


async def create_video(prompt: str, image_url: str | None = None) -> MediaAsset:
    return await _provider().create_video(prompt, image_url)


_MARKED_URL = re.compile(r"\[image\]\s*(https://\S+)")
_HTTP_URL = re.compile(r"https://[^\s)>\"]+")


def image_urls_in_text(text: str) -> list[str]:
    """Image URLs saved on earlier turns, then Alibaba result URLs mentioned in text."""
    marked = [url.rstrip(".,)") for url in _MARKED_URL.findall(text)]
    if marked:
        return marked
    return [
        url.rstrip(".,)")
        for url in _HTTP_URL.findall(text)
        if "aliyuncs.com" in url or "dashscope" in url
    ]


def resolve_image_url(supplied: str, known_urls: list[str], user_text: str) -> str:
    """Use a URL the user pasted. Otherwise reuse the latest picture from this chat."""
    supplied = supplied.strip()
    if supplied.startswith(("http://", "https://")) and supplied in user_text:
        return supplied
    return known_urls[-1] if known_urls else ""


async def run_media_operation(name: str, arguments: dict) -> MediaAsset:
    """Run one of the stable operation names. Unknown names are rejected."""
    prompt = str(arguments.get("prompt", "")).strip()
    image_url = str(arguments.get("image_url", "")).strip() or None
    if name == "create_image":
        if not prompt:
            raise ValueError("create_image requires a prompt")
        return await create_image(prompt)
    if name == "edit_image":
        if not prompt or not image_url:
            raise ValueError("edit_image requires a prompt and an image_url")
        return await edit_image(prompt, image_url)
    if name == "create_video":
        if not prompt:
            raise ValueError("create_video requires a prompt")
        return await create_video(prompt, image_url)
    raise ValueError(f"Unknown media operation: {name}")
