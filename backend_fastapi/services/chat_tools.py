"""Stable tool names the chat model may call. Providers implement the operations.

Every tool here runs as a background job: the assistant replies first, and the
result is announced in a follow-up turn when the job finishes.
"""

WEB_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "web_search",
        "description": (
            "Search the public web for current facts: weather, news, events, prices, "
            "opening hours, or anything recent you are unsure about."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "What to search for."},
            },
            "required": ["query"],
        },
    },
}

MEDIA_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_image",
            "description": (
                "Create a new picture from a text description. "
                "Use only when the user asks to draw, generate, or design an image."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {"type": "string", "description": "What the picture should show."},
                },
                "required": ["prompt"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "edit_image",
            "description": (
                "Change the picture made or shared earlier in this chat. "
                "Use only when the user asks to edit, change, or add to a picture. "
                "Pass image_url as an empty string; the server uses the latest picture."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {"type": "string", "description": "How to change the picture."},
                    "image_url": {"type": "string", "description": "URL of the picture to edit."},
                },
                "required": ["prompt", "image_url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_video",
            "description": (
                "Create a short video. Use only when the user asks for a video. "
                "Set from_latest_picture to true when the video should start from the picture "
                "already shown in this chat, and false for a new scene described only by text. "
                "The server attaches that picture; do not invent a URL."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "How the scene should move, including the instruction for the picture.",
                    },
                    "from_latest_picture": {
                        "type": "boolean",
                        "description": "True to animate the latest picture in this chat. False for text only.",
                    },
                },
                "required": ["prompt", "from_latest_picture"],
            },
        },
    },
]

BACKGROUND_OPERATIONS = {"web_search", "create_image", "edit_image", "create_video"}


def chat_tools(*, web_search: bool) -> list[dict]:
    return [WEB_SEARCH_TOOL, *MEDIA_TOOLS] if web_search else list(MEDIA_TOOLS)
