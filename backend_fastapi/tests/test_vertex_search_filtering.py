"""Tests for vertex_search date filtering."""

from datetime import datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

from services.vertex_search import (
    _extract_latest_date,
    _is_expired_content,
)

# Fix "today" to 2026-06-30 for deterministic tests
_FIXED_NOW = datetime(2026, 6, 30, 12, 0, 0, tzinfo=ZoneInfo("Asia/Singapore"))


def _patch_now():
    return patch(
        "services.vertex_search.datetime",
        wraps=datetime,
        **{"now.return_value": _FIXED_NOW},
    )


# ── _extract_latest_date ──


class TestExtractLatestDate:
    def test_dd_month_yyyy(self):
        assert _extract_latest_date("14 July 2024") == datetime(2024, 7, 14)

    def test_ordinal_dd_month_yyyy(self):
        assert _extract_latest_date("14th July 2024") == datetime(2024, 7, 14)

    def test_date_range_picks_latest(self):
        assert _extract_latest_date("From 9 to 14 July 2024") == datetime(2024, 7, 14)

    def test_yyyy_mm_dd(self):
        assert _extract_latest_date("2026-08-31") == datetime(2026, 8, 31)

    def test_month_dd_yyyy(self):
        assert _extract_latest_date("August 31, 2026") == datetime(2026, 8, 31)

    def test_no_dates(self):
        assert _extract_latest_date("Starbucks Level 1") is None

    def test_chinese_date(self):
        assert _extract_latest_date("2025年12月12日") == datetime(2025, 12, 12)


# ── _is_expired_content (simplified) ──


class TestIsExpiredContent:
    """Only explicit past dates and past years are filtered. Everything else passes."""

    def test_expired_full_date(self):
        with _patch_now():
            assert _is_expired_content("Book Fair 9 to 14 July 2024") is True

    def test_current_full_date(self):
        with _patch_now():
            assert _is_expired_content("Summer Sale 1 June to 31 August 2026") is False

    def test_expired_year_only(self):
        with _patch_now():
            assert _is_expired_content("Great Sale 2024 promotion") is True

    def test_current_year_passes(self):
        """Current year without full date → kept (let Gemini handle)."""
        with _patch_now():
            assert _is_expired_content("SIMBA Roadshow 2026") is False

    def test_future_year_passes(self):
        with _patch_now():
            assert _is_expired_content("Event 2027") is False

    def test_no_dates_no_keywords(self):
        """No dates at all → kept."""
        with _patch_now():
            assert _is_expired_content("Starbucks, Level 1") is False

    def test_no_dates_with_promo_keyword(self):
        """No dates + promo keyword → kept (Gemini handles)."""
        with _patch_now():
            assert _is_expired_content("Amazing Sale!") is False

    def test_event_ending_today(self):
        with _patch_now():
            assert _is_expired_content("Event ends 30 June 2026") is False

    def test_event_ended_yesterday(self):
        with _patch_now():
            assert _is_expired_content("Event ends 29 June 2026") is True

    def test_yearless_dates_pass(self):
        """Year-less dates → kept (no explicit past date)."""
        with _patch_now():
            assert _is_expired_content("Book Fair 9 to 14 July") is False

    def test_store_page_passes(self):
        """Store descriptions always pass."""
        with _patch_now():
            assert _is_expired_content(
                "Timezone is the world's leading fun family interactive entertainment centre"
            ) is False

    def test_upcoming_events_snippet_passes(self):
        """Upcoming Events page snippets with no year pass through."""
        with _patch_now():
            assert _is_expired_content(
                "Participating retailers include: Dian Xiao Er, Ergoworks"
            ) is False

    def test_chinese_expired_date(self):
        with _patch_now():
            assert _is_expired_content("活动 2025年12月12日至2026年1月1日") is True

    def test_mixed_years_latest_wins(self):
        """If latest date is future, not expired."""
        with _patch_now():
            assert _is_expired_content("From 2025 to 31 August 2026") is False
