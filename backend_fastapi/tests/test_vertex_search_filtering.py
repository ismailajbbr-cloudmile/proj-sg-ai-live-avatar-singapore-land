"""Tests for vertex_search date filtering and segment splitting."""

from datetime import datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest

from services.vertex_search import (
    _extract_latest_date,
    _extract_latest_date_no_year,
    _is_expired_content,
    _split_into_event_segments,
    _filter_snippet_segments,
)

# Fix "today" to 2026-06-24 for deterministic tests
_FIXED_NOW = datetime(2026, 6, 24, 12, 0, 0, tzinfo=ZoneInfo("Asia/Singapore"))


def _patch_now():
    return patch(
        "services.vertex_search.datetime",
        wraps=datetime,
        **{"now.return_value": _FIXED_NOW},
    )


# ── _extract_latest_date (full dates with year) ──


class TestExtractLatestDate:
    def test_dd_month_yyyy(self):
        assert _extract_latest_date("14 July 2024") == datetime(2024, 7, 14)

    def test_ordinal_dd_month_yyyy(self):
        assert _extract_latest_date("14th July 2024") == datetime(2024, 7, 14)

    def test_1st_ordinal(self):
        assert _extract_latest_date("1st January 2026") == datetime(2026, 1, 1)

    def test_date_range_picks_latest(self):
        assert _extract_latest_date("From 9 to 14 July 2024") == datetime(2024, 7, 14)

    def test_yyyy_mm_dd(self):
        assert _extract_latest_date("2026-08-31") == datetime(2026, 8, 31)

    def test_month_dd_yyyy(self):
        assert _extract_latest_date("August 31, 2026") == datetime(2026, 8, 31)

    def test_no_dates(self):
        assert _extract_latest_date("Starbucks Level 1") is None

    def test_en_dash_range(self):
        # "5 – 28 June 2026" — the "28 June 2026" should match
        assert _extract_latest_date("5 – 28 June 2026") == datetime(2026, 6, 28)

    def test_ordinal_with_year(self):
        assert _extract_latest_date("17th November 2025") == datetime(2025, 11, 17)


# ── _extract_latest_date_no_year ──


class TestExtractLatestDateNoYear:
    def test_dd_month(self):
        with _patch_now():
            assert _extract_latest_date_no_year("14 July") == datetime(2026, 7, 14)

    def test_ordinal_dd_month(self):
        with _patch_now():
            assert _extract_latest_date_no_year("14th July") == datetime(2026, 7, 14)

    def test_range_picks_latest(self):
        with _patch_now():
            # "9 to 14 July" — should find both 9 July and 14 July (if "July" appears after both)
            # Actually only "14 July" matches since "9 to" doesn't have a month after it
            result = _extract_latest_date_no_year("9 to 14 July")
            assert result == datetime(2026, 7, 14)

    def test_cross_month_range(self):
        with _patch_now():
            result = _extract_latest_date_no_year("14 July to 15 August")
            assert result == datetime(2026, 8, 15)

    def test_no_dates(self):
        with _patch_now():
            assert _extract_latest_date_no_year("Starbucks Level 1") is None

    def test_28_sep(self):
        with _patch_now():
            result = _extract_latest_date_no_year("28 & 29 Sep")
            assert result == datetime(2026, 9, 29)


# ── _is_expired_content ──


class TestIsExpiredContent:
    def test_expired_full_date(self):
        with _patch_now():
            assert _is_expired_content("Book Fair 9 to 14 July 2024") is True

    def test_current_full_date(self):
        with _patch_now():
            assert _is_expired_content("Summer Sale 1 June to 31 August 2026") is False

    def test_expired_year_only(self):
        with _patch_now():
            assert _is_expired_content("Great Sale 2024 promotion") is True

    def test_current_year_only_with_promo_keyword(self):
        """Current year but no month/day + promo keyword = unverifiable = expired."""
        with _patch_now():
            assert _is_expired_content("SIMBA Roadshow 2026") is True

    def test_current_year_only_no_promo_keyword(self):
        """Current year without promo keyword = keep (likely permanent content)."""
        with _patch_now():
            assert _is_expired_content("Marina Square 2026 tenant list") is False

    def test_no_dates_promo_keyword(self):
        with _patch_now():
            assert _is_expired_content("Amazing Sale!") is True

    def test_no_dates_no_keywords(self):
        with _patch_now():
            assert _is_expired_content("Starbucks, Level 1") is False

    def test_event_ending_today(self):
        with _patch_now():
            assert _is_expired_content("Event ends 24 June 2026") is False

    def test_event_ended_yesterday(self):
        with _patch_now():
            assert _is_expired_content("Event ends 23 June 2026") is True

    # ── Year-less date tests ──
    # Year-less dates with promo keywords are ALWAYS filtered as unverifiable.
    # Stale crawled pages often drop the year, so we can't trust month/day alone.

    def test_yearless_future_month_with_keyword_filtered(self):
        """'Book Fair 9 to 14 July' — no year + promo keyword = unverifiable = filtered."""
        with _patch_now():
            assert _is_expired_content("Book Fair 9 to 14 July") is True

    def test_yearless_past_month_with_keyword_filtered(self):
        """'CNY Bazaar 15 February' — no year + promo keyword = filtered."""
        with _patch_now():
            assert _is_expired_content("CNY Bazaar 15 February") is True

    def test_yearless_no_keyword_not_filtered(self):
        """Year-less dates without promo keywords don't trigger filtering."""
        with _patch_now():
            assert _is_expired_content("Open since 15 March") is False

    def test_travel_goods_fair_no_year(self):
        """Travel Goods Fair 23 Jul to 4 Aug — no year + 'fair' keyword = filtered."""
        with _patch_now():
            assert _is_expired_content(
                "Singapore's Largest Travel Goods Fair 23 Jul to 4 Aug"
            ) is True

    def test_cny_bazaar_2026(self):
        """CNY Festive Goodies Bazaar 2026 — year only + promo keyword = unverifiable."""
        with _patch_now():
            assert _is_expired_content("CNY Festive Goodies Bazaar 2026") is True

    def test_ai_cube_master_2026(self):
        """AI Cube Master 2026 Challenge — year only + keyword = unverifiable."""
        with _patch_now():
            assert _is_expired_content("AI Cube Master 2026 Challenge") is True

    def test_chan_brothers_fiesta_no_year(self):
        """No year + 'fiesta'/'anniversary' keywords = unverifiable = filtered."""
        with _patch_now():
            assert _is_expired_content("Chan Brothers 59th Anniversary Fiesta 28 & 29 Sep") is True

    def test_chan_brothers_fiesta_with_year(self):
        """With full date including year — use the date to decide."""
        with _patch_now():
            assert _is_expired_content("Chan Brothers Fiesta 29 Sep 2026") is False

    # ── force_promo tests (title-as-context) ──

    def test_force_promo_no_keyword_snippet_filtered(self):
        """Snippet has no promo keywords, but force_promo=True from title → filtered."""
        with _patch_now():
            # This snippet has no promo keywords and no year — normally kept
            text = "from 9 to 14 July with a wide selection of children's books at great prices"
            assert _is_expired_content(text) is False  # no keywords → kept
            assert _is_expired_content(text, force_promo=True) is True  # forced → filtered

    def test_force_promo_with_full_future_date_kept(self):
        """force_promo + full future date → still kept (date is verifiable)."""
        with _patch_now():
            text = "Great deals at Linkbridge 14 July 2026"
            assert _is_expired_content(text, force_promo=True) is False

    def test_force_promo_with_full_past_date_filtered(self):
        """force_promo + full past date → filtered."""
        with _patch_now():
            text = "Great deals at Linkbridge 14 November 2025"
            assert _is_expired_content(text, force_promo=True) is True

    def test_force_promo_no_dates_filtered(self):
        """force_promo + no dates at all → filtered (unverifiable)."""
        with _patch_now():
            text = "14th to 17th November at Linkbridge, Level 2"
            assert _is_expired_content(text, force_promo=True) is True


# ── _split_into_event_segments ──


def test_split_on_sentence_boundary():
    text = "Book Fair from 9 to 14 July 2024. Summer Sale from 1 June to 31 August 2026"
    segments = _split_into_event_segments(text)
    assert len(segments) == 2
    assert "Book Fair" in segments[0]
    assert "Summer Sale" in segments[1]


def test_split_on_br_tag():
    text = "Book Fair 9-14 July 2024<br>Summer Sale 1 June - 31 August 2026"
    segments = _split_into_event_segments(text)
    assert len(segments) == 2


def test_split_on_bullets():
    text = "Events:\n- Book Fair 9-14 July 2024\n- Summer Sale 1 June - 31 Aug 2026"
    segments = _split_into_event_segments(text)
    assert len(segments) >= 2


def test_no_split_single_event():
    text = "Book Fair from 9 to 14 July 2024 at Marina Foyer"
    segments = _split_into_event_segments(text)
    assert len(segments) == 1


# ── _filter_snippet_segments ──


class TestFilterSnippetSegments:
    def test_mixed_content_keeps_current_only(self):
        with _patch_now():
            snippet = "Book Fair from 9 to 14 July 2024. Summer Sale from 1 June to 31 August 2026"
            result = _filter_snippet_segments(snippet)
            assert "Summer Sale" in result
            assert "Book Fair" not in result

    def test_all_expired(self):
        with _patch_now():
            snippet = "Book Fair 9-14 July 2024<br>Spring Sale ends 1 March 2025"
            result = _filter_snippet_segments(snippet)
            assert result == ""

    def test_all_current(self):
        with _patch_now():
            snippet = "Summer Sale 1 June to 31 August 2026. Holiday Promo 1-31 December 2026"
            result = _filter_snippet_segments(snippet)
            assert "Summer Sale" in result
            assert "Holiday Promo" in result

    def test_single_expired_segment(self):
        with _patch_now():
            snippet = "Junior Page Book Fair 9 to 14 July 2024"
            result = _filter_snippet_segments(snippet)
            assert result == ""

    def test_single_current_segment(self):
        with _patch_now():
            snippet = "Summer Sale 1 June to 31 August 2026"
            result = _filter_snippet_segments(snippet)
            assert "Summer Sale" in result

    def test_permanent_store_passes(self):
        with _patch_now():
            snippet = "Starbucks is located at Level 1, near the main entrance"
            result = _filter_snippet_segments(snippet)
            assert "Starbucks" in result

    def test_force_promo_filters_no_keyword_snippet(self):
        """Snippet without keywords from a promo-titled page → filtered."""
        with _patch_now():
            snippet = "from 9 to 14 July with a wide selection of children's books"
            # Without force_promo: passes (no keywords, no year)
            assert _filter_snippet_segments(snippet) == snippet
            # With force_promo: filtered (treated as event content, no verifiable date)
            assert _filter_snippet_segments(snippet, force_promo=True) == ""

    def test_force_promo_keeps_snippet_with_future_date(self):
        """Snippet with full future date kept even with force_promo."""
        with _patch_now():
            snippet = "Mofusand retail pop-up now till 30 June 2026"
            assert _filter_snippet_segments(snippet, force_promo=True) == snippet
