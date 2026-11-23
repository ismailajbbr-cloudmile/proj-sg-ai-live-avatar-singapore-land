"""Optional Bailian knowledge-base retrieval.

An empty index id means there is no Marina Square directory on Alibaba.
Web search is a separate, billed, general-web feature and is not used here.
"""

import logging

import httpx

from config import settings
from services.alibaba_client import auth_headers, knowledge_retrieve_url

logger = logging.getLogger(__name__)

_MAX_SNIPPETS = 8
_MAX_SNIPPET_CHARS = 2000


def _node_text(node: dict) -> str:
    for key in ("text", "content", "chunk"):
        value = node.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    metadata = node.get("metadata")
    if isinstance(metadata, dict):
        for key in ("content", "text", "snippet"):
            value = metadata.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return ""


def format_knowledge_context(snippets: list[str]) -> str:
    if not snippets:
        return ""
    lines = [
        "--- RETRIEVED KNOWLEDGE BASE CONTEXT ---",
        "Sources below come from the Alibaba knowledge base configured for this kiosk.",
        "",
    ]
    for index, snippet in enumerate(snippets, start=1):
        lines.append(f"[datastore: web] source {index}:")
        lines.append(snippet[:_MAX_SNIPPET_CHARS])
        lines.append("")
    return "\n".join(lines).strip()


async def retrieve_knowledge(query: str) -> list[str]:
    index_id = settings.alibaba_knowledge_index_id.strip()
    if not index_id:
        return []

    payload = {"index_id": index_id, "query": query, "top_k": _MAX_SNIPPETS}
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            knowledge_retrieve_url(),
            headers=auth_headers(),
            json=payload,
        )
        response.raise_for_status()
        body = response.json()

    nodes = body.get("nodes") or body.get("data", {}).get("nodes") or []
    snippets: list[str] = []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        text = _node_text(node)
        if text:
            snippets.append(text)
        if len(snippets) >= _MAX_SNIPPETS:
            break
    logger.info("[Alibaba] knowledge snippets=%d index=%s", len(snippets), index_id)
    return snippets
