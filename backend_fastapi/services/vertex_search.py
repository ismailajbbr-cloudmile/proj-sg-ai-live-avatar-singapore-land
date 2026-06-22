"""
Direct Vertex AI Search (Discovery Engine) client.
Queries datastores deterministically instead of relying on Gemini's built-in retrieval.
"""

import asyncio
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from zoneinfo import ZoneInfo

from google.cloud import discoveryengine_v1 as discoveryengine

from config import settings

logger = logging.getLogger(__name__)

_MAX_SNIPPET_CHARS = 1000
_MAX_TOTAL_CONTEXT_CHARS = 15000


@dataclass
class SearchResult:
    title: str
    link: str
    snippets: list[str]
    source_datastore: str  # "web" or "pdf"


@dataclass
class SearchResponse:
    results: list[SearchResult] = field(default_factory=list)
    query: str = ""


_client: discoveryengine.SearchServiceAsyncClient | None = None


def _get_client() -> discoveryengine.SearchServiceAsyncClient:
    global _client
    if _client is None:
        _client = discoveryengine.SearchServiceAsyncClient()
    return _client


def _datastore_serving_config(datastore_id: str) -> str:
    return (
        f"projects/{settings.google_vertex_project}"
        f"/locations/global/collections/default_collection"
        f"/dataStores/{datastore_id}"
        f"/servingConfigs/default_search"
    )


def _engine_serving_config(engine_id: str) -> str:
    return (
        f"projects/{settings.google_vertex_project}"
        f"/locations/global/collections/default_collection"
        f"/engines/{engine_id}"
        f"/servingConfigs/default_search"
    )


async def _search(
    query: str,
    serving_config: str,
    source_label: str,
    max_results: int = 5,
    use_extractive_answers: bool = False,
) -> list[SearchResult]:
    """Search a single datastore/engine, return parsed results."""
    client = _get_client()

    content_spec_kwargs: dict = {
        "snippet_spec": discoveryengine.SearchRequest.ContentSearchSpec.SnippetSpec(
            return_snippet=True,
        ),
    }
    if use_extractive_answers:
        content_spec_kwargs["extractive_content_spec"] = (
            discoveryengine.SearchRequest.ContentSearchSpec.ExtractiveContentSpec(
                max_extractive_answer_count=3,
            )
        )

    request = discoveryengine.SearchRequest(
        serving_config=serving_config,
        query=query,
        page_size=max_results,
        content_search_spec=discoveryengine.SearchRequest.ContentSearchSpec(
            **content_spec_kwargs,
        ),
    )

    try:
        response = await client.search(request=request)
        results: list[SearchResult] = []
        async for result in response:
            doc = result.document
            struct = doc.derived_struct_data or {}

            title = struct.get("title", doc.name or "Untitled")
            link = struct.get("link", "")

            # Prefer extractive answers (full passages), fall back to snippets
            snippets: list[str] = []
            if use_extractive_answers:
                for ea in struct.get("extractive_answers", []):
                    content = ea.get("content", "").strip()
                    if content:
                        snippets.append(content[:_MAX_SNIPPET_CHARS])
            if not snippets:
                for sn in struct.get("snippets", []):
                    text = sn.get("snippet", "").strip()
                    if text:
                        snippets.append(text[:_MAX_SNIPPET_CHARS])

            if snippets:
                results.append(SearchResult(
                    title=title,
                    link=link,
                    snippets=snippets,
                    source_datastore=source_label,
                ))
        return results
    except Exception:
        logger.exception("[VertexSearch] search failed serving_config=%s", serving_config)
        return []


_CHINESE_QUESTION_WORDS = re.compile(
    r"在哪里|在哪|怎么去|怎么走|哪里有|哪里|是什么|有没有|？",
)


def _simplify_query(query: str) -> str | None:
    """Strip Chinese question words to extract the core keyword for retry search."""
    simplified = _CHINESE_QUESTION_WORDS.sub("", query).strip()
    if simplified and simplified != query.strip():
        return simplified
    return None


async def search_datastores(query: str) -> SearchResponse:
    """Search both web and PDF datastores concurrently. Web results first."""
    # Use simplified query for Chinese questions (strip question words for better search)
    search_query = _simplify_query(query) or query
    if search_query != query:
        logger.info("[VertexSearch] simplified Chinese query %r → %r", query, search_query)

    tasks = []

    # Web: prefer engine (cross-lingual semantic search) over raw datastore
    if settings.vertex_ai_web_engine_id:
        tasks.append(_search(
            search_query,
            serving_config=_engine_serving_config(settings.vertex_ai_web_engine_id),
            source_label="web",
            max_results=10,
        ))
    elif settings.vertex_ai_web_datastore_id:
        tasks.append(_search(
            search_query,
            serving_config=_datastore_serving_config(settings.vertex_ai_web_datastore_id),
            source_label="web",
            max_results=10,
        ))

    if settings.vertex_ai_pdf_datastore_id:
        tasks.append(_search(
            search_query,
            serving_config=_datastore_serving_config(settings.vertex_ai_pdf_datastore_id),
            source_label="pdf",
            max_results=5,
        ))

    all_results: list[SearchResult] = []
    if tasks:
        gathered = await asyncio.gather(*tasks)
        for result_list in gathered:
            all_results.extend(result_list)

    logger.info(
        "[VertexSearch] query=%r total_results=%d (web=%d, pdf=%d)",
        query,
        len(all_results),
        sum(1 for r in all_results if r.source_datastore == "web"),
        sum(1 for r in all_results if r.source_datastore == "pdf"),
    )
    return SearchResponse(results=all_results, query=query)


_PROMO_EVENT_KEYWORDS = re.compile(
    r"(?:promoti|event|happening|deal|offer|sale|discount|voucher|reward|"
    r"campaign|celebrate|festival|lucky\s*draw|giveaway|contest|"
    r"促销|活动|优惠|折扣|抽奖|奖励)",
    re.IGNORECASE,
)

# Matches date patterns like "31 Dec 2025", "December 31, 2025", "2025-12-31", "31/12/2025"
_DATE_PATTERN = re.compile(
    r"(\d{1,2})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{2,4})"  # DD/MM/YYYY or MM/DD/YYYY
    r"|(\d{4})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{1,2})"   # YYYY-MM-DD
    r"|(\d{1,2})\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
    r"\s+(\d{4})"                                          # DD Month YYYY
    r"|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
    r"\s+(\d{1,2}),?\s+(\d{4})",                          # Month DD, YYYY
    re.IGNORECASE,
)

_MONTH_MAP = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6,
    "jul": 7, "july": 7, "aug": 8, "august": 8, "sep": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}


def _extract_latest_date(text: str) -> datetime | None:
    """Extract the latest date found in text. Returns None if no dates found."""
    dates: list[datetime] = []
    for match in _DATE_PATTERN.finditer(text):
        groups = match.groups()
        try:
            if groups[0] is not None:  # DD/MM/YYYY
                d, m, y = int(groups[0]), int(groups[1]), int(groups[2])
                if y < 100:
                    y += 2000
                if m > 12:  # likely MM/DD/YYYY
                    d, m = m, d
                dates.append(datetime(y, m, d))
            elif groups[3] is not None:  # YYYY-MM-DD
                y, m, d = int(groups[3]), int(groups[4]), int(groups[5])
                dates.append(datetime(y, m, d))
            elif groups[6] is not None:  # DD Month YYYY
                d, y = int(groups[6]), int(groups[7])
                month_str = re.search(
                    r"(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
                    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)",
                    match.group(), re.IGNORECASE,
                )
                if month_str:
                    m = _MONTH_MAP.get(month_str.group(1).lower()[:3], 0)
                    if m:
                        dates.append(datetime(y, m, d))
            elif groups[8] is not None:  # Month DD, YYYY
                d, y = int(groups[8]), int(groups[9])
                month_str = re.search(
                    r"(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
                    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)",
                    match.group(), re.IGNORECASE,
                )
                if month_str:
                    m = _MONTH_MAP.get(month_str.group(1).lower()[:3], 0)
                    if m:
                        dates.append(datetime(y, m, d))
        except (ValueError, OverflowError):
            continue
    return max(dates) if dates else None


def _extract_years(text: str) -> list[int]:
    """Extract all 4-digit years (2020-2099) from text."""
    return [int(y) for y in re.findall(r"\b(20[2-9]\d)\b", text)]


def _is_expired_promo(snippet: str) -> bool:
    """
    Returns True if snippet looks like a promo/event AND is expired or has no dates.
    Non-promo content (store info, directions, etc.) is never filtered.
    """
    if not _PROMO_EVENT_KEYWORDS.search(snippet):
        return False  # Not a promo/event — keep it

    current_year = datetime.now(ZoneInfo("Asia/Singapore")).year
    today = datetime.now(ZoneInfo("Asia/Singapore")).replace(
        hour=0, minute=0, second=0, microsecond=0, tzinfo=None,
    )

    # Check for full dates first (most reliable)
    latest_date = _extract_latest_date(snippet)
    if latest_date is not None:
        return latest_date < today

    # Fall back to year-only check: if all years are past, it's expired
    years = _extract_years(snippet)
    if years:
        return max(years) < current_year

    return True  # Promo with no dates at all — can't verify, skip


def format_search_context(search_response: SearchResponse) -> str:
    """Format search results into a context block for the system instruction."""
    if not search_response.results:
        return ""

    today_obj = datetime.now(ZoneInfo("Asia/Singapore"))
    today = today_obj.strftime("%Y-%m-%d")
    current_year = today_obj.year
    parts = [
        "--- RETRIEVED KNOWLEDGE BASE CONTEXT ---",
        f"TODAY'S DATE: {today} (year {current_year})",
        "CRITICAL FILTERING RULE FOR PROMOTIONS, EVENTS, AND HAPPENINGS:",
        f"- Today is {today}. Only mention items whose end date is ON or AFTER today.",
        f"- Any event or promotion with an end date BEFORE {today} is EXPIRED — do NOT mention it.",
        f"- Any item dated in {current_year - 1} or earlier is EXPIRED — do NOT mention it.",
        "- If an item has no clear start/end dates, do NOT present it as a current promotion or event.",
        "- When listing promotions, include the validity period for each one.",
        "",
    ]
    total_chars = 0
    source_idx = 0
    for result in search_response.results:
        source_idx += 1
        source_tag = f"[Source {source_idx}: {result.title}] [datastore: {result.source_datastore}]"
        parts.append(source_tag)
        for snippet in result.snippets:
            if total_chars + len(snippet) > _MAX_TOTAL_CONTEXT_CHARS:
                break
            parts.append(snippet)
            total_chars += len(snippet)
        parts.append("")
        if total_chars >= _MAX_TOTAL_CONTEXT_CHARS:
            break
    parts.append("--- END CONTEXT ---")
    return "\n".join(parts)
