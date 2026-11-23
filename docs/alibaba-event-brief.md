# Marina Square concierge — Alibaba event brief

Date checked: 16 November 2026.  
This file is for the Qwen event. It describes the kiosk as it works today, and the Alibaba path that is switched on in the local `.env`.

The event setup does not call Google. `AI_PROVIDER=alibaba` and `REQUIRE_DATASTORE_GROUNDING=false`. There is no mall directory lookup.

## What the product already is

A kiosk concierge for Marina Square. A visitor picks a language, talks or types, and a 3D avatar answers out loud with lip-sync and a small set of gestures.

| Piece | What it does |
|---|---|
| Lobby | Language choice, then enter the chat. On screen today: English and Chinese. |
| Chat | Streaming replies. The model’s first line is a gesture: `idle`, `nod`, `shake`, `tilt`, `lookup`, or `excited`. |
| Avatar | 3D model, blink, gesture, and mouth shapes driven by viseme frames. |
| Speech out | One sentence at a time. Audio comes back as base64 plus viseme timings. |
| Microphone | Browser Web Speech API (push to talk). This is on the device, not a cloud speech API. |
| Wayfinder | The model can append `[SHOW_QR]` for in-mall directions. The screen shows a QR code. |
| Admin | Login, users, conversation history, analytics. |
| Memory of the chat | PostgreSQL. This is our database, not the model vendor’s. |

The Google production path, still in the code and used when `AI_PROVIDER=google`:

| Need | Google service | Region we had configured |
|---|---|---|
| Chat | Gemini on Vertex AI | `GOOGLE_VERTEX_LOCATION` has been `global` |
| Mall directory | Vertex AI Search over the website and PDF datastores | Same Google project |
| Speech | Gemini TTS (`Achernar` in the current env) | Google Cloud TTS |
| Lip-sync timing | Estimated. Gemini TTS does not return word times. | — |
| Microphone | Still the browser. Not Google Speech-to-Text. | — |

With directory grounding on, factual mall answers must come from Vertex AI Search. If the datastores are empty, the concierge says it does not have that information.

## What Alibaba replaces for this event

One switch. Chat and speech go to Model Studio in Singapore. The screen, avatar, gestures, and database stay the same.

| Need | Alibaba service we call | Status on this workspace |
|---|---|---|
| Chat | Qwen, model `qwen-plus`, OpenAI-compatible streaming | Working. Live pytest passed for English, Chinese, and Bahasa Indonesia. |
| Speech | `qwen3-tts-flash`, voice `Cherry` | Working. Returns WAV (`audio/wav`), not MP3. |
| Lip-sync timing | Estimated from the text | Qwen3-TTS did not return word timestamps. |
| Mall directory | Not used | `REQUIRE_DATASTORE_GROUNDING=false`. No knowledge-base id is set. |
| Web search | `web_search` tool (Qwen `enable_search`, forced) | Qwen decides when to search. Runs in the background: the avatar says it is searching, then announces the answer. Public web, not the mall directory. |
| Image | `create_image`, `edit_image` | Wan 2.6. Runs in the background. Edits reuse the latest picture in the chat. |
| Video | `create_video` | Text only, or animate the latest picture. Runs in the background, about one to two minutes. |
| Background jobs | `/jobs/{id}` + follow-up `/chat` with `job_id` | The avatar replies first. When the job finishes, the server sends Qwen an automatic message so it can announce the result. Jobs are in memory and lost on restart. |
| Microphone | Not replaced | Still the browser. |

Live checks are in `backend_fastapi/tests/test_alibaba_live.py`. They call the key in `.env` and fail if a Google client is constructed. Last run: 12 passed (live plus offline).

Endpoint pattern, Singapore workspace:

`https://{workspace}.ap-southeast-1.maas.aliyuncs.com`

Chat path: `/compatible-mode/v1/chat/completions`  
Speech path: `/api/v1/services/aigc/multimodal-generation/generation`

The API key only works in the region that issued it. A Beijing key on the Singapore host returns 401.

## Languages

The lobby buttons are still English and Chinese. The backend also accepts Bahasa Indonesia (`id-ID`) if a request arrives with that code.

| | English | Chinese (Simplified) | Bahasa Indonesia |
|---|---|---|---|
| Qwen chat | Tested. Answers in English. | Tested. Answers in Chinese characters. | Tested. Answers in Indonesian. |
| Qwen3-TTS | Tested. `language_type=English`. Audio returned. | Tested. `language_type=Chinese`. Audio returned. | Text is accepted with `language_type=Auto`. Audio returned. Indonesian is not in the official language list, so the accent is not guaranteed. |
| On-screen language button | Yes | Yes | No |
| Browser microphone | `en-US` | `zh-CN` | Only if the browser is given `id-ID`. Not a lobby option today. |

Qwen3-TTS official language types include Chinese, English, German, Italian, Portuguese, Spanish, and Japanese. `Indonesian` is rejected. Malay and Tamil are not in that list. This event is scoped to English, Chinese, and Bahasa Indonesia.

## Data residency

What we can say from the calls we made:

- The API host is the Singapore region, `ap-southeast-1`.
- The speech file URL came back on `oss-ap-southeast-1` (Alibaba Cloud object storage in Singapore).
- Chat and speech for the event do not go to Vertex AI, Gemini, or `googleapis.com`.
- Conversation rows stay in our PostgreSQL database.

What not to claim:

- Alibaba’s own description of the Singapore region is an **International** deployment scope: global nodes excluding mainland China. That is not the same as “processing stays inside Singapore only.”
- Do not say customer audio or prompts never leave Singapore. Say the workspace and the API endpoint are Singapore, and the speech object we received was stored in Singapore.
- Keys, endpoints, and model lists are per region. This demo key must not be pointed at Beijing or Virginia.

## What we do not have on Alibaba

- **Marina Square directory.** No Bailian knowledge base, no website crawl, no PDF index. With grounding off, Qwen answers from general knowledge. It can be wrong about stores, hours, and promotions. Do not present it as the live mall directory.
- **CosyVoice.** `cosyvoice-v3-flash` and `cosyvoice-v3-plus` both returned `url error` on this workspace. They are not enabled here. That also means no CosyVoice word timestamps and no cloned Indonesian voice.
- **A guaranteed Indonesian voice.** Qwen3-TTS will speak the sentence, but Indonesian is not a supported `language_type`.
- **Server speech-to-text.** Fun-ASR and Paraformer exist in Model Studio (including word timestamps, and Fun-ASR lists Indonesian and Malay). They are not wired into this app.
- **A Bahasa button** on the lobby.
- **Citations** from a private knowledge base.
- **Web search as the mall directory.** Qwen calls web search when it needs current facts. It searches the public web. It does not know the private tenant list. Singapore bills it per search.

## What to say at the event

Safe:

- The same kiosk can run on Qwen for chat and Qwen3-TTS for speech, with Google left out of the request path.
- English and Chinese are tested end to end. Bahasa Indonesia is tested for the written answer. Speech for Indonesian text returns audio via `Auto`.
- The avatar, gestures, and lip-sync pipeline did not have to change.
- The Singapore workspace is the one this demo uses.

Not safe:

- “It knows which shops are in Marina Square.” It does not, unless we load a knowledge base.
- “Speech recognition is Alibaba.” The microphone is still the browser.
- “All processing is confined to Singapore.” The endpoint is Singapore. The vendor’s International scope is wider than a single city.

## If someone asks what is left to reach parity

1. Upload the mall site and PDFs into a Bailian knowledge base and set `ALIBABA_KNOWLEDGE_INDEX_ID`. Turn grounding back on only after that index returns real snippets.
2. Confirm an Indonesian voice. Qwen3-TTS `Auto` is the current workaround. A cloned CosyVoice voice would need CosyVoice enabled on this workspace first.
3. Add a Bahasa Indonesia button on the lobby only after that voice is acceptable.
4. Replace the browser microphone with Fun-ASR only if the event needs server-side speech-to-text.
