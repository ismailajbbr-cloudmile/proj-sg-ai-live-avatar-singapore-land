"""Browser action parsing and coordinate handling for the Qwen browser agent."""

from services.browser_use import _parse_decision, _to_pixels


def test_parses_clean_action():
    decision = _parse_decision('{"action":"click","x":500,"y":250,"intent":"open menu"}')
    assert decision == {"action": "click", "x": 500, "y": 250, "intent": "open menu"}


def test_parses_fenced_action():
    decision = _parse_decision('```json\n{"action":"finish","summary":"It is 10am to 10pm."}\n```')
    assert decision is not None
    assert decision["action"] == "finish"
    assert "10am" in decision["summary"]


def test_repairs_missing_y_key():
    # Qwen-VL sometimes writes the y value without its key and closes with a bracket.
    decision = _parse_decision(
        '{"action":"click","x":771, 74],"intent":"Close the promotional pop-up."}'
    )
    assert decision is not None
    assert decision["action"] == "click"
    assert decision["x"] == 771
    assert decision["y"] == 74


def test_extracts_fields_from_truncated_reply():
    decision = _parse_decision('{"action":"type","text":"marina square opening hours","press_enter":true')
    assert decision is not None
    assert decision["action"] == "type"
    assert decision["text"] == "marina square opening hours"
    assert decision["press_enter"] is True


def test_prose_is_not_an_action():
    assert _parse_decision("I cannot open that page.") is None


def test_coordinates_are_normalized_to_viewport():
    assert _to_pixels(0, 1280) == 0
    assert _to_pixels(500, 1280) == 640
    assert _to_pixels(1000, 800) == 800
    # Out-of-range values are clamped instead of clicking off-screen.
    assert _to_pixels(4000, 1280) == 1280
    assert _to_pixels(-10, 800) == 0
