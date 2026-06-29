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

# Closed/departed tenants — filter out snippets mentioning these names.
# Maintains accuracy when the datastore still has stale pages for former tenants.
_EXCLUDED_TENANTS = {
    "play nation",
}


def _mentions_excluded_tenant(text: str) -> bool:
    """Return True if text mentions any excluded tenant (case-insensitive)."""
    lower = text.lower()
    return any(tenant in lower for tenant in _EXCLUDED_TENANTS)


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
            if len(results) >= max_results:
                break  # Don't paginate beyond requested limit

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


_MARINA_SQUARE_PATTERN = re.compile(
    r"marina\s*square|滨海广场|滨海坊", re.IGNORECASE,
)


# Chinese terms that don't cross-lingual search well → append English equivalent
_ZH_EN_FACILITY_MAP: dict[str, str] = {
    "哺乳室": "nursing room",
    "母婴室": "nursing room",
    "育婴室": "nursing room",
    "卫生间": "toilet restroom",
    "洗手间": "toilet restroom",
    "厕所": "toilet restroom",
    "停车场": "parking carpark",
    "停车": "parking carpark",
    "电梯": "elevator lift",
    "扶梯": "escalator",
    "自动扶梯": "escalator",
    "问询处": "information counter",
    "服务台": "customer service counter",
    "失物招领": "lost and found",
    "营业时间": "opening hours",
    "轮椅": "wheelchair",
    "无障碍": "accessible",
}


def _augment_chinese_query(query: str) -> str:
    """Append English equivalents for Chinese facility terms that don't search well."""
    additions = []
    for zh, en in _ZH_EN_FACILITY_MAP.items():
        if zh in query:
            additions.append(en)
    if additions:
        return f"{query} {' '.join(additions)}"
    return query


def _contextualize_query(query: str) -> str:
    """Prepend 'Marina Square' if not already mentioned, for better search relevance."""
    if _MARINA_SQUARE_PATTERN.search(query):
        return query
    return f"Marina Square {query}"


async def search_datastores(query: str) -> SearchResponse:
    """Search web datastore via engine or raw datastore."""
    # Use simplified query for Chinese questions (strip question words for better search)
    search_query = _simplify_query(query) or query
    search_query = _augment_chinese_query(search_query)
    search_query = _contextualize_query(search_query)
    if search_query != query:
        logger.info("[VertexSearch] query %r → %r", query, search_query)

    # Prefer engine (cross-lingual semantic search) over raw datastore
    if settings.vertex_ai_web_engine_id:
        results = await _search(
            search_query,
            serving_config=_engine_serving_config(settings.vertex_ai_web_engine_id),
            source_label="web",
            max_results=100,
        )
    elif settings.vertex_ai_web_datastore_id:
        results = await _search(
            search_query,
            serving_config=_datastore_serving_config(settings.vertex_ai_web_datastore_id),
            source_label="web",
            max_results=100,
        )
    else:
        results = []

    logger.info(
        "[VertexSearch] query=%r total_results=%d",
        query, len(results),
    )
    return SearchResponse(results=results, query=query)


_PROMO_EVENT_KEYWORDS = re.compile(
    r"(?:promoti|event|happening|deal|offer|sale|discount|voucher|reward|"
    r"campaign|celebrate|festival|lucky\s*draw|giveaway|contest|competition|"
    r"showdown|exhibit|pop.?up|roadshow|bouncy|fest\b|masterclass|workshop|"
    r"bazaar|fair\b|showcase|carnival|cny|chinese new year|"
    r"fiesta|anniversary|challenge|cup\b|ticket|"
    r"促销|活动|优惠|折扣|抽奖|奖励|展览|展|比赛|竞赛|挑战|快闪|路演|嘉年华|工作坊|年货|新年)",
    re.IGNORECASE,
)

# Ordinal suffix for day numbers: 1st, 2nd, 3rd, 14th, etc.
_ORD = r"(?:st|nd|rd|th)?"

_MONTH_NAMES = (
    r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
)

# Matches date patterns like "31 Dec 2025", "December 31, 2025", "2025-12-31", "31/12/2025", "2025年11月2日"
_DATE_PATTERN = re.compile(
    r"(\d{1,2})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{2,4})"       # DD/MM/YYYY or MM/DD/YYYY
    r"|(\d{4})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{1,2})"        # YYYY-MM-DD
    rf"|(\d{{1,2}}){_ORD}\s+{_MONTH_NAMES}\s+(\d{{4}})"       # DD[th] Month YYYY
    rf"|{_MONTH_NAMES}\s+(\d{{1,2}}){_ORD},?\s+(\d{{4}})"     # Month DD[th], YYYY
    r"|(\d{4})年(\d{1,2})月(\d{1,2})日",                       # Chinese: 2025年11月2日
    re.IGNORECASE,
)

# Year-less date pattern: "9 to 14 July", "14th November", "28 & 29 Sep"
# Used when _DATE_PATTERN finds nothing — infers current year.
_DATE_NO_YEAR_PATTERN = re.compile(
    rf"(\d{{1,2}}){_ORD}\s+{_MONTH_NAMES}"                    # DD[th] Month
    rf"|{_MONTH_NAMES}\s+(\d{{1,2}}){_ORD}",                  # Month DD[th]
    re.IGNORECASE,
)

_MONTH_MAP = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6,
    "jul": 7, "july": 7, "aug": 8, "august": 8, "sep": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}


def _extract_month_from_match(match_text: str) -> int:
    """Extract month number from a regex match string containing a month name."""
    month_match = re.search(
        r"(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
        r"Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)",
        match_text, re.IGNORECASE,
    )
    if month_match:
        return _MONTH_MAP.get(month_match.group(1).lower()[:3], 0)
    return 0


def _extract_latest_date(text: str) -> datetime | None:
    """Extract the latest full date (with year) found in text. Returns None if none found."""
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
            elif groups[6] is not None:  # DD[th] Month YYYY
                d, y = int(groups[6]), int(groups[7])
                m = _extract_month_from_match(match.group())
                if m:
                    dates.append(datetime(y, m, d))
            elif groups[8] is not None:  # Month DD[th], YYYY
                d, y = int(groups[8]), int(groups[9])
                m = _extract_month_from_match(match.group())
                if m:
                    dates.append(datetime(y, m, d))
            elif groups[10] is not None:  # Chinese: 2025年11月2日
                y, m, d = int(groups[10]), int(groups[11]), int(groups[12])
                dates.append(datetime(y, m, d))
        except (ValueError, OverflowError):
            continue
    return max(dates) if dates else None


def _extract_latest_date_no_year(text: str) -> datetime | None:
    """
    Extract the latest date from year-less patterns like "14 July", "28 Sep".
    Assumes current year. Returns None if no year-less dates found.
    Only called when _extract_latest_date finds nothing.
    """
    current_year = datetime.now(ZoneInfo("Asia/Singapore")).year
    dates: list[datetime] = []
    for match in _DATE_NO_YEAR_PATTERN.finditer(text):
        groups = match.groups()
        try:
            # groups[0] = day from "DD Month", groups[1] = day from "Month DD"
            day_str = groups[0] or groups[1]
            if day_str is None:
                continue
            d = int(day_str)
            m = _extract_month_from_match(match.group())
            if m:
                dates.append(datetime(current_year, m, d))
        except (ValueError, OverflowError):
            continue
    return max(dates) if dates else None


def _extract_years(text: str) -> list[int]:
    """Extract all 4-digit years (2020-2099) from text."""
    return [int(y) for y in re.findall(r"\b(20[2-9]\d)\b", text)]


def _is_expired_content(text: str, force_promo: bool = False) -> bool:
    """
    Date-first filtering: returns True if content is expired.
    1. Has full dates (with year) → check if latest date is past → expired
    2. Has years only + promo context → if current year but no full date, unverifiable → expired
    3. Has years only (no promo) → if all years past → expired
    4. No verifiable dates + promo context → can't verify → expired
    5. No dates, no promo context → likely permanent content → keep

    Args:
        text: The text to check.
        force_promo: If True, treat this text as event/promo content regardless of
            whether it contains promo keywords. Use when the page title or URL
            indicates the content is from an events/promotions page.

    NOTE: Year-less dates (e.g. "14 July" without year) are NOT used here.
    Snippets without years are treated as unverifiable for time-limited content,
    because stale crawled pages often drop the year while the month/day happens
    to fall in the future part of the current year.
    """
    current_year = datetime.now(ZoneInfo("Asia/Singapore")).year
    today = datetime.now(ZoneInfo("Asia/Singapore")).replace(
        hour=0, minute=0, second=0, microsecond=0, tzinfo=None,
    )
    has_promo = force_promo or bool(_PROMO_EVENT_KEYWORDS.search(text))

    # 1. Full dates with year — most reliable
    latest_date = _extract_latest_date(text)
    if latest_date is not None:
        return latest_date < today

    # 2. Year-only check
    years = _extract_years(text)
    if years:
        max_year = max(years)
        if max_year < current_year:
            return True  # All years in the past → expired
        # Current year but no specific date + promo context → unverifiable event
        if has_promo and max_year == current_year:
            return True

    # 3. Year-less dates like "9 to 14 July", "14th November" — no year found.
    #    Permanent store pages don't use "DD Month" patterns; events do.
    #    Treat as stale event content regardless of promo keywords.
    if _extract_latest_date_no_year(text) is not None:
        return True

    # 4. No verifiable dates — only filter if it looks like a time-limited event
    if has_promo:
        return True  # Time-limited content with no dates — can't verify, skip

    return False  # No dates and no event keywords — likely a permanent store/venue page


# Segment boundary: bullets, <br>, numbered lists, pipes, or sentence-end followed by
# a new capitalized phrase (heuristic for multi-event snippets).
_SEGMENT_SPLIT = re.compile(
    r"(?:<br\s*/?>)"                        # HTML <br> tags
    r"|(?:\n\s*\n)"                          # double newlines
    r"|(?:\n\s*[-•●▸▹◦]\s)"                 # bullet points
    r"|(?:\n\s*\d+[.)]\s)"                   # numbered lists
    r"|(?:\s*\|\s*)"                          # pipe separators
    r"|(?:\.\.\.(?:\s|$))"                   # ellipsis as separator
    r"|(?:[.!?]\s+(?=[A-Z][a-z]))",          # sentence end → new capitalized word
    re.IGNORECASE,
)


def _split_into_event_segments(text: str) -> list[str]:
    """Split a snippet into segments, each likely describing one event/promo."""
    segments = _SEGMENT_SPLIT.split(text)
    return [s.strip() for s in segments if s and s.strip()]


def _filter_snippet_segments(snippet: str, force_promo: bool = False) -> str:
    """Filter a snippet at segment level: remove expired segments, keep the rest."""
    segments = _split_into_event_segments(snippet)

    # If splitting produced only 1 segment, fall back to whole-snippet check
    if len(segments) <= 1:
        return "" if _is_expired_content(snippet, force_promo=force_promo) else snippet

    live_segments = []
    for segment in segments:
        if _is_expired_content(segment, force_promo=force_promo):
            logger.debug(
                "[VertexSearch] segment expired, dropping: %s", segment[:120],
            )
            continue
        live_segments.append(segment)
        logger.debug(
            "[VertexSearch] segment kept: %s", segment[:120],
        )

    return " ".join(live_segments) if live_segments else ""


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
        # If the page title or URL indicates event/promo content, force all
        # snippets to be treated as time-limited (require verifiable dates).
        # This catches snippets that lack promo keywords in their own text
        # but come from an events page (e.g. "9 to 14 July with books…").
        title_is_promo = bool(_PROMO_EVENT_KEYWORDS.search(result.title))
        url_is_promo = bool(re.search(
            r"/(?:event|happening|promotion|promo|whats-on|campaign)",
            result.link, re.IGNORECASE,
        )) if result.link else False
        force_promo = title_is_promo or url_is_promo

        if force_promo:
            logger.info(
                "[VertexSearch] title/URL indicates promo page: %s (%s)",
                result.title, result.link,
            )

        # Skip results that mention excluded (closed/departed) tenants
        combined_text = f"{result.title} {' '.join(result.snippets)}"
        if _mentions_excluded_tenant(combined_text):
            logger.info(
                "[VertexSearch] excluded tenant mentioned, dropping: %s", result.title,
            )
            continue

        live_snippets = []
        for snippet in result.snippets:
            # Skip empty or too-short snippets (noise from the datastore)
            clean = re.sub(r"<[^>]+>|&\w+;", "", snippet).strip()
            if len(clean) < 20:
                continue
            filtered = _filter_snippet_segments(snippet, force_promo=force_promo)
            if not filtered:
                logger.info(
                    "[VertexSearch] filtering expired snippet in: %s", result.title,
                )
                continue
            live_snippets.append(filtered)

        if not live_snippets:
            logger.info(
                "[VertexSearch] all snippets expired, dropping result: %s", result.title,
            )
            continue

        source_idx += 1
        source_tag = f"[Source {source_idx}: {result.title}] [datastore: {result.source_datastore}]"
        parts.append(source_tag)
        for snippet in live_snippets:
            if total_chars + len(snippet) > _MAX_TOTAL_CONTEXT_CHARS:
                break
            parts.append(snippet)
            total_chars += len(snippet)
        parts.append("")
        if total_chars >= _MAX_TOTAL_CONTEXT_CHARS:
            break
    parts.append("--- END CONTEXT ---")
    context = "\n".join(parts)
    logger.info(
        "[VertexSearch] context for Gemini (%d sources, %d chars):\n%s",
        source_idx, total_chars, context,
    )
    return context
