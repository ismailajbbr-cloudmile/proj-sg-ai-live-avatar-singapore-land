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

BACKGROUND_OPERATIONS = {
    "web_search",
    "create_image",
    "edit_image",
    "create_video",
    "browse_web",
    "continue_browse",
}

# Handled inside the same chat turn: they read or stop an existing browser job.
BROWSE_INLINE_TOOLS = {"get_browse_screen", "stop_browse"}

BROWSE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "browse_web",
            "description": (
                "Open a real browser and do a multi-step web task (search on a site, open pages, "
                "click through a site, fill a form, read what a page shows). Use only when the "
                "visitor explicitly asks to use the browser or browse a website, not for simple "
                "facts you can look up with web_search."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "goal": {
                        "type": "string",
                        "description": "What to accomplish in the browser, in one clear sentence.",
                    },
                    "title": {
                        "type": "string",
                        "description": "Short label for this browser job, as the visitor would say it.",
                    },
                    "description": {
                        "type": "string",
                        "description": "One-sentence summary for later reference.",
                    },
                    "start_url": {
                        "type": "string",
                        "description": "Optional first URL. Defaults to Google.",
                    },
                },
                "required": ["goal", "title", "description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "continue_browse",
            "description": (
                "Do more in the browser on the page where the last browser job ended. Use for a "
                "follow-up click, search, or page change on the same site instead of starting over."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "goal": {
                        "type": "string",
                        "description": "The next browser instruction.",
                    },
                    "title": {"type": "string", "description": "Short label for this step."},
                    "description": {
                        "type": "string",
                        "description": "One-sentence summary for later reference.",
                    },
                },
                "required": ["goal", "title", "description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_browse_screen",
            "description": (
                "Read the latest browser screenshot: page URL, status, outcome, and a short "
                "description of what is on screen. Use when the visitor asks what they are "
                "looking at or what the browser shows. Never guess page content."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "stop_browse",
            "description": (
                "Stop the browser job that is still running. Use when the visitor says stop, "
                "cancel, or never mind while the browser is working."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
]


def chat_tools(*, web_search: bool, browse: bool = False) -> list[dict]:
    tools = [WEB_SEARCH_TOOL] if web_search else []
    tools = [*tools, *MEDIA_TOOLS]
    if browse:
        tools = [*tools, *BROWSE_TOOLS]
    return tools
