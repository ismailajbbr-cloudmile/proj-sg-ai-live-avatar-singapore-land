# AI Concierge — Backend

Marina Square AI Concierge API — a FastAPI service that handles auth, Gemini chat (SSE), TTS/visemes, conversation persistence, and admin operations.

For full-stack setup (Docker, GCP credentials, CI/CD), see the [root README](../README.md). For how the Next.js frontend proxies to this API, see the [frontend README](../frontend_nextjs/README.md).

---

## Table of Contents

1. [Overview](#1-overview)
2. [Quick Start](#2-quick-start)
3. [Architecture](#3-architecture)
4. [API Consumer Flows](#4-api-consumer-flows)
5. [Features](#5-features)
6. [Folder Structure](#6-folder-structure)
7. [Key Files Reference](#7-key-files-reference)
8. [Infrastructure](#8-infrastructure)
9. [API Endpoints Reference](#9-api-endpoints-reference)
10. [Conventions for Contributors](#10-conventions-for-contributors)
11. [Troubleshooting](#11-troubleshooting)
12. [Related Docs](#12-related-docs)

---

## 1. Overview

The backend is the **API and business-logic layer** of the Marina Square AI Concierge. It receives proxied requests from the Next.js frontend, calls Google Cloud services, and persists data in PostgreSQL.

**What the backend owns:**

- JWT cookie authentication (env admin + database users)
- Gemini chat streaming via Vertex AI with optional RAG grounding
- Google Cloud TTS synthesis and viseme frame generation
- PostgreSQL persistence (users, conversations, messages)
- Admin API (user management, analytics, conversation history)
- Public kiosk config (idle timeout)

**What the frontend owns** (`frontend_nextjs/`):

- Kiosk UI, 3D avatar rendering, lip-sync playback
- BFF proxies that forward cookies and SSE streams to this API
- Route middleware (cookie presence check only)

### Tech Stack

| Layer | Technology |
|---|---|
| Framework | FastAPI, Uvicorn |
| Language | Python 3.12 |
| Package manager | `uv` |
| Database | PostgreSQL via SQLAlchemy 2.0 async + `asyncpg` |
| Migrations | Alembic |
| Auth | JWT (`python-jose`), bcrypt passwords |
| AI Chat | Vertex AI Gemini via `google-genai` |
| RAG | Vertex AI Search (web + PDF datastores) |
| TTS | Google Cloud Text-to-Speech (Gemini TTS model) |

### Where This Fits in the Monorepo

```
avatar_chatbot/
├── frontend_nextjs/    ← UI + BFF proxies
├── backend_fastapi/    ← you are here
├── docker-compose.yml
└── docker-compose.dev.yml
```

```mermaid
flowchart TB
  subgraph frontend [frontend_nextjs]
    BFF["/api/* proxies"]
  end
  subgraph backend [backend_fastapi]
    Auth["/auth"]
    ChatAPI["/chat SSE"]
    TTS["/tts"]
    DB["PostgreSQL"]
    Vertex["Vertex AI Gemini"]
    Search["Vertex AI Search RAG"]
    CloudTTS["Google Cloud TTS"]
  end
  BFF -->|"Cookie + JSON/SSE"| Auth
  BFF --> ChatAPI
  BFF --> TTS
  ChatAPI --> Vertex
  ChatAPI --> Search
  TTS --> CloudTTS
  Auth --> DB
  ChatAPI --> DB
```

---

## 2. Quick Start

### Prerequisites

- **Python 3.12**
- **`uv`** package manager (`pip install uv`)
- **PostgreSQL** (local or via Docker)
- **GCP credentials** for Vertex AI and TTS (ADC in dev, service account key in prod)

### Local Development (backend only)

```bash
# From repo root — create env file
cp .env.example .env
# Edit .env: set DATABASE_URL, JWT_SECRET, ADMIN_*, GOOGLE_VERTEX_PROJECT, etc.

cd backend_fastapi
uv sync
uv run alembic upgrade head
uv run uvicorn main:app --reload   # http://localhost:8000
```

Minimum required env vars:

| Variable | Example |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://avatar:change-me@localhost:5432/avatar_chatbot` |
| `JWT_SECRET` | Random 64-char hex string |
| `GOOGLE_VERTEX_PROJECT` | Your GCP project ID |

### Recommended — full stack via Docker

From the repo root:

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up
```

| Service | URL |
|---|---|
| Backend API | http://localhost:8000 |
| Frontend | http://localhost:3000 |
| PostgreSQL | localhost:5432 |

Docker Compose overrides `DATABASE_URL` with `DATABASE_URL_DOCKER` (hostname `postgres`). Add to `.env`:

```
DATABASE_URL_DOCKER=postgresql+asyncpg://avatar:change-me@postgres:5432/avatar_chatbot
```

### Interactive API Docs

FastAPI auto-generates OpenAPI documentation:

| URL | Description |
|---|---|
| http://localhost:8000/docs | Swagger UI |
| http://localhost:8000/redoc | ReDoc |
| http://localhost:8000/openapi.json | OpenAPI schema |

### Health Check

```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

---

## 3. Architecture

### Layer Responsibilities

| Layer | Owns |
|---|---|
| `routers/` | HTTP endpoints, Pydantic request models, SSE generators |
| `services/` | Gemini streaming, TTS synthesis, viseme generation, DB engine |
| `auth/` | JWT create/decode, `get_current_user`, `require_admin` |
| `models/` | SQLAlchemy ORM (`User`, `Conversation`, `Message`) |
| `config.py` | Pydantic Settings loaded from repo-root `.env` |
| `alembic/` | Database schema migrations |

There is **no separate `schemas/` package** — request/response Pydantic models are defined inline in each router file.

### Application Entry Point

`main.py` creates the FastAPI app, configures CORS, and registers routers:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.next_public_origin],
    allow_credentials=True,  # Required for cookie forwarding from Next.js
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(conversations.router, prefix="/conversations", tags=["conversations"])
app.include_router(chat.router, tags=["chat"])
app.include_router(tts.router, tags=["tts"])
app.include_router(config_router.router, tags=["config"])
app.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
```

CORS allows only `NEXT_PUBLIC_ORIGIN` (default `http://localhost:3000`) with credentials enabled so the frontend can forward cookies.

### Auth Model

Auth uses an **HTTP-only JWT cookie** named `auth-token`. The frontend middleware only checks cookie presence; this backend **validates the JWT** on every protected route.

Two credential paths at login:

| Type | Source | JWT `is_admin` | DB `id` at auth time |
|---|---|---|---|
| **Env admin (kiosk)** | `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `true` | `None` (not in DB) |
| **DB user** | `users` table, bcrypt password | `user.is_admin` | UUID from DB |

Env admin credentials are **never stored in PostgreSQL**. On first chat message, a placeholder DB user row is created for conversation persistence (`_get_or_create_kiosk_user` in `routers/chat.py`).

Auth dependencies (`auth/dependencies.py`):

- `get_current_user` — reads `auth-token` cookie, decodes JWT, resolves user
- `require_admin` — raises 403 if `is_admin` is false

JWT details (`auth/jwt.py`):

- Algorithm: HS256
- Expiry: 7 days (`jwt_expire_minutes = 10080`)
- Payload: `{ sub: username, exp, is_admin: bool }`

---

## 4. API Consumer Flows

The Next.js frontend proxies all requests to this backend. Cookies are forwarded so JWT auth works transparently.

```mermaid
sequenceDiagram
  participant FE as Next.js_BFF
  participant BE as FastAPI
  participant Gemini as Vertex_AI
  participant TTS as Cloud_TTS
  participant PG as PostgreSQL

  FE->>BE: POST /auth/login
  BE-->>FE: Set-Cookie auth-token
  FE->>BE: POST /chat SSE
  BE->>PG: save user message
  BE->>Gemini: stream + optional RAG
  Gemini-->>BE: text chunks
  BE-->>FE: SSE gesture/chunk/done
  BE->>PG: save model message
  FE->>BE: POST /tts
  BE->>TTS: synthesize
  TTS-->>BE: MP3
  BE-->>FE: audioBase64 + visemes
```

### Auth Flow

**File:** `routers/auth.py`

1. `POST /auth/login` — validate credentials (env admin first, then DB user).
2. Create JWT, set `auth-token` cookie (HTTP-only, SameSite=lax, 7-day max-age).
3. `GET /auth/me` — return `{ username, is_admin }` (requires valid cookie).
4. `POST /auth/logout` — delete cookie.

Frontend mapping: `/api/auth` → `/auth/login`, `/api/auth/me` → `/auth/me`, `/api/auth/logout` → `/auth/logout`.

### Chat SSE Flow

**File:** `routers/chat.py`

1. `POST /chat` with `{ message, history?, conversation_id?, language? }`.
2. Resolve user (create kiosk placeholder if env admin).
3. Resolve or create `Conversation` in PostgreSQL.
4. Save user `Message`, build Gemini history from DB.
5. Stream Gemini response, parse gesture from line 1.
6. Emit SSE events to client.
7. Save model `Message` in `finally` block.

### TTS Flow

**Files:** `routers/tts.py`, `services/tts_service.py`, `services/viseme.py`

1. `POST /tts` with `{ text, language? }`.
2. Call Google Cloud TTS (Gemini TTS model) in thread pool.
3. Build viseme frames via linear phoneme timing.
4. Return `{ audioBase64, mimeType, visemes }`.

### Admin Flow

**Files:** `routers/users.py`, `routers/analytics.py`, `routers/conversations.py`

- All admin routes require `require_admin` (JWT `is_admin=true`).
- Frontend proxies: `/api/admin/users` → `/users/`, `/api/admin/analytics` → `/analytics`, etc.

### Conversations Flow

**File:** `routers/conversations.py`

- Regular users: list/create/view/delete own conversations.
- Env admin: returns empty list (no DB user id); conversations created inline in `/chat`.
- DB admin users: full access like regular users plus `require_admin` on admin routes.

---

## 5. Features

### JWT Cookie Auth

**Files:** `auth/jwt.py`, `auth/dependencies.py`, `routers/auth.py`

- Login sets HTTP-only cookie; no token in response body.
- Every protected endpoint uses `Depends(get_current_user)`.
- Admin endpoints add `Depends(require_admin)`.

### Gemini SSE Chat

**Files:** `services/gemini.py`, `routers/chat.py`

- Model: `GEMINI_CHAT_MODEL` (default `gemini-2.5-flash`).
- System prompt forces output format: **line 1 = gesture**, **line 2+ = spoken response**.
- Valid gestures: `idle`, `nod`, `shake`, `tilt`, `lookup`, `excited`.
- Router buffers chunks until first `\n`, validates gesture, defaults to `idle`.
- Gemini 3.x models get `thinking_level="minimal"` for kiosk latency.

#### SSE Event Types

| Event `type` | Payload | When |
|---|---|---|
| `conversation_id` | UUID string | Start, if DB conversation exists |
| `gesture` | gesture name | First complete line of model output |
| `chunk` | text fragment | Remaining streamed text |
| `show_qr` | `true` | `[SHOW_QR]` marker detected in response |
| `done` | — | Stream finished |
| `error` | error string | Exception during stream |

SSE format: `data: {"type": "...", "value": "..."}\n\n`

### Vertex AI RAG Grounding

**File:** `services/gemini.py`

Optional retrieval tools attached when env vars are set:

```
projects/{GOOGLE_VERTEX_PROJECT}/locations/global/collections/default_collection/dataStores/{DATASTORE_ID}
```

| Env var | Content |
|---|---|
| `VERTEX_AI_WEB_DATASTORE_ID` | Website content |
| `VERTEX_AI_PDF_DATASTORE_ID` | PDF documents |

- Location is always `global` for Vertex AI Search (not `us-central1`).
- Both datastores can be active simultaneously as separate tools.
- Empty IDs = no grounding (Gemini uses system prompt only).
- **Grounding metadata / citations are not forwarded** to the client — only streamed text.

Required GCP IAM roles: `roles/aiplatform.user`, `roles/discoveryengine.viewer`.

### Conversation Persistence

**Files:** `routers/chat.py`, `models/`

- New conversation auto-created on first message if no `conversation_id` provided.
- Title set from first 200 characters of the first user message.
- Messages stored with role `user` or `model`.
- `updated_at` bumped when model response is saved.
- History for Gemini built from DB messages (preferred) or request `history` fallback.

### TTS + Visemes

**Files:** `services/tts_service.py`, `services/viseme.py`

```mermaid
sequenceDiagram
  participant Router as routers/tts.py
  participant TTS as tts_service.py
  participant Viseme as viseme.py

  Router->>TTS: text + language
  TTS->>TTS: Gemini TTS model → MP3
  TTS->>Viseme: text segmentation
  Viseme->>Viseme: word → phoneme → viseme frame
  Viseme-->>Router: audioBase64 + viseme frames
```

- TTS model: `TTS_MODEL` (default `gemini-2.5-flash-tts`).
- Voice: `TTS_VOICE_NAME` (default `Achernar`) with style prompt `TTS_VOICE_PROMPT`.
- Output: MP3, base64-encoded.
- Sync GCP SDK call wrapped in `asyncio.run_in_executor`.
- **No SSML timepoints** from Gemini TTS — visemes use linear timing (~110 ms/phoneme, 50 ms word gap).
- Chinese text segmented per character; English per word.
- Language mapping: `zh-cn` → `cmn-CN`, `zh-tw`/`zh-hk` → `cmn-tw`.

Response shape:

```json
{
  "audioBase64": "...",
  "mimeType": "audio/mpeg",
  "visemes": [{ "t": 0, "label": "silence", "mouth": 0 }, ...]
}
```

### User Management

**File:** `routers/users.py`

| Action | Endpoint |
|---|---|
| List users (paginated) | `GET /users/` |
| Create user | `POST /users/` — auto-generates 12-char password, returned once |
| Delete user | `DELETE /users/{user_id}` — cascades conversations/messages |
| Reset password | `POST /users/{user_id}/reset-password` — new random password |

New DB users default to `is_admin=false`.

### Analytics

**File:** `routers/analytics.py`

`GET /analytics` returns:

- Totals: users, conversations, messages
- Today: conversations, messages (UTC midnight boundary)
- `top_users`: top 10 by conversation count
- `recent_conversations`: paginated list with username and message count

### Kiosk Config

**File:** `routers/config_router.py`

`GET /config` — **no auth required**. Returns:

```json
{ "session_idle_timeout_minutes": 4 }
```

Value from `SESSION_IDLE_TIMEOUT_MINUTES` env var (default 4).

### Indoor Wayfinder QR

**File:** `routers/chat.py`

When Gemini appends `[SHOW_QR]` to its response (per system prompt rules for in-mall wayfinding):

1. SSE emits `{ "type": "show_qr", "value": true }`.
2. Marker stripped before saving to DB.
3. Frontend shows QR overlay and speaks extra TTS prompt.

---

## 6. Folder Structure

```
backend_fastapi/
├── main.py                         # FastAPI app entry, CORS, router registration
├── config.py                       # Pydantic Settings (reads repo-root .env)
├── pyproject.toml                  # Dependencies (uv)
├── uv.lock                         # Locked dependency versions
├── alembic.ini                     # Alembic config (URL overridden by env.py)
├── Dockerfile                      # Production image
├── Dockerfile.dev                  # Dev image with --reload
│
├── alembic/
│   ├── env.py                      # Async migration runner
│   ├── script.py.mako              # New migration template
│   └── versions/
│       └── 0001_initial.py         # Initial schema (users, conversations, messages)
│
├── auth/
│   ├── dependencies.py             # get_current_user, require_admin
│   └── jwt.py                      # JWT create/decode (HS256)
│
├── models/
│   ├── base.py                     # SQLAlchemy DeclarativeBase + utcnow()
│   ├── user.py                     # User model
│   ├── conversation.py             # Conversation model
│   └── message.py                  # Message model + MessageRole enum
│
├── routers/
│   ├── auth.py                     # /auth/login, /logout, /me
│   ├── users.py                    # /users/ CRUD (admin)
│   ├── conversations.py            # /conversations/ CRUD
│   ├── chat.py                     # /chat SSE streaming
│   ├── tts.py                      # /tts synthesis
│   ├── config_router.py            # /config public kiosk settings
│   └── analytics.py                # /analytics dashboard stats
│
├── services/
│   ├── db.py                       # Async engine + session factory
│   ├── gemini.py                   # Vertex AI Gemini streaming + RAG
│   ├── tts_service.py              # Google Cloud TTS
│   └── viseme.py                   # Phoneme → viseme frame pipeline
│
└── credentials/                    # GCP creds mount point (gitignored)
    └── (application_default_credentials.json or gcp-key.json)
```

### Database Schema

```mermaid
erDiagram
  users ||--o{ conversations : has
  conversations ||--o{ messages : contains

  users {
    uuid id PK
    string username UK
    string hashed_password
    boolean is_admin
    datetime created_at
  }

  conversations {
    uuid id PK
    uuid user_id FK
    string title
    datetime created_at
    datetime updated_at
  }

  messages {
    uuid id PK
    uuid conversation_id FK
    enum role "user|model"
    text content
    datetime created_at
  }
```

**Relationships:**

- `User` → many `Conversation` (CASCADE delete-orphan)
- `Conversation` → many `Message` (CASCADE delete-orphan, ordered by `created_at`)

**Migration:** single revision `0001_initial.py` creates all three tables plus `message_role` enum.

---

## 7. Key Files Reference

| File | Edit when you need to… |
|---|---|
| `routers/chat.py` | Change SSE events, gesture parsing, conversation logic |
| `services/gemini.py` | Update system prompt, RAG tools, model config |
| `services/tts_service.py` | Change TTS model, voice, language mapping |
| `services/viseme.py` | Adjust phoneme mapping or timing constants |
| `auth/dependencies.py` | Change auth guards or admin checks |
| `auth/jwt.py` | Change token expiry or algorithm |
| `routers/auth.py` | Modify login/logout behavior or cookie settings |
| `config.py` | Add new environment variables |
| `models/*.py` | Change database schema (+ new Alembic migration) |
| `alembic/versions/` | Add database migrations |
| `main.py` | Register new routers or change CORS |
| `routers/users.py` | Change user management logic |
| `routers/analytics.py` | Add or modify dashboard metrics |

---

## 8. Infrastructure

### Docker

#### Development (`Dockerfile.dev`)

- Base: `python:3.12-slim`
- `uv sync --frozen` (includes dev deps like `watchfiles`)
- Source bind-mounted from `./backend_fastapi:/app`
- Anonymous volume preserves `.venv` inside container
- CMD: `alembic upgrade head && uvicorn main:app --reload --host 0.0.0.0 --port 8000`

#### Production (`Dockerfile`)

- `uv sync --frozen --no-dev` (slim image)
- No source bind mount — code baked into image
- CMD: `alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000`

#### Ports

| Environment | Backend port |
|---|---|
| Dev (Docker) | `8000:8000` (published) |
| Prod (Docker) | `8000` (internal only, not published to host) |

### Database

| Environment | Connection | Hostname |
|---|---|---|
| Dev (Docker) | `DATABASE_URL_DOCKER` | `postgres:5432` (local Postgres container) |
| Dev (local uv) | `DATABASE_URL` | `localhost:5432` |
| Prod | `DATABASE_URL_PROD` | `cloud-sql-proxy:5432` (Cloud SQL Auth Proxy) |

Engine config (`services/db.py`):

- Driver: `postgresql+asyncpg://`
- Pool: size 10, max overflow 20, `pool_pre_ping=True`

Prod uses a `cloud-sql-proxy` sidecar in host network mode connecting to Cloud SQL instance `aiconcierge-prod-sea:asia-southeast1:aiconcierge-prod-sea-db-01`.

### GCP Credentials

| Environment | Method | Mount path |
|---|---|---|
| Dev | Application Default Credentials | `~/.config/gcloud/application_default_credentials.json` → `/app/credentials/application_default_credentials.json` |
| Prod | Service account key JSON | `./avatar-chatbot-key.json` → `/app/credentials/gcp-key.json` |

Setup for dev:

```bash
gcloud auth application-default login --project=YOUR_PROJECT_ID
```

Services (`genai.Client`, `TextToSpeechClient`) use the standard Google auth chain via `GOOGLE_APPLICATION_CREDENTIALS`.

### Alembic Migrations

Migrations run **automatically on container start** (both Dockerfiles).

Create a new migration:

```bash
cd backend_fastapi
uv run alembic revision --autogenerate -m "describe change"
uv run alembic upgrade head
```

Or let Docker apply on next restart.

Current state: single revision `0001_initial.py` (users, conversations, messages).

### Environment Variables

Loaded from repo-root `.env` via `config.py`. Docker Compose `environment:` overrides take precedence.

| Variable | Default | Required | Purpose |
|---|---|---|---|
| `DATABASE_URL` | — | Yes | Async PostgreSQL connection string |
| `JWT_SECRET` | — | Yes | JWT signing key |
| `JWT_ALGORITHM` | `HS256` | No | JWT algorithm |
| `JWT_EXPIRE_MINUTES` | `10080` (7 days) | No | Token lifetime |
| `ADMIN_USERNAME` | `""` | No | Kiosk admin login |
| `ADMIN_PASSWORD` | `""` | No | Kiosk admin password |
| `GOOGLE_VERTEX_PROJECT` | `""` | For chat | GCP project for Vertex AI |
| `GOOGLE_VERTEX_LOCATION` | `us-central1` | No | Vertex AI region |
| `VERTEX_AI_WEB_DATASTORE_ID` | `""` | No | Web RAG datastore |
| `VERTEX_AI_PDF_DATASTORE_ID` | `""` | No | PDF RAG datastore |
| `GEMINI_CHAT_MODEL` | `gemini-2.5-flash` | No | Chat model name |
| `GOOGLE_APPLICATION_CREDENTIALS` | `/app/credentials/gcp-key.json` | No | GCP key file path |
| `NEXT_PUBLIC_ORIGIN` | `http://localhost:3000` | No | CORS allowed origin |
| `SESSION_IDLE_TIMEOUT_MINUTES` | `4` | No | Kiosk idle timeout (public `/config`) |
| `TTS_MODEL` | `gemini-2.5-flash-tts` | No | TTS model |
| `TTS_VOICE_NAME` | `Achernar` | No | TTS voice |
| `TTS_VOICE_PROMPT` | Hospitality prompt | No | TTS style instruction |

Docker Compose also uses:

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL_DOCKER` | `docker-compose.dev.yml` | Dev DB hostname `postgres` |
| `DATABASE_URL_PROD` | `docker-compose.yml` | Prod Cloud SQL connection |

See [`.env.example`](../.env.example) for the template.

### Deployment

Backend is deployed as part of the full stack — no separate pipeline.

1. GitHub Actions (`.github/workflows/main.yml`) triggers on merge to `main`.
2. Source packaged and deployed to GCP Compute Engine VM at `/opt/aiconcierge`.
3. Secrets pulled from GCP Secret Manager into `.env`.
4. `docker compose build --no-cache && docker compose up -d`.
5. Alembic runs on container start before Uvicorn serves traffic.

See the [root README](../README.md) for full CI/CD details.

---

## 9. API Endpoints Reference

### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | `{"status": "ok"}` |

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | None | Login; sets `auth-token` cookie |
| POST | `/auth/logout` | None | Clears `auth-token` cookie |
| GET | `/auth/me` | Cookie | Returns `{ username, is_admin }` |

**Login request:**

```json
{ "username": "admin", "password": "..." }
```

**Login response:**

```json
{ "success": true, "message": "Authenticated successfully" }
```

(Set-Cookie header carries the JWT.)

### Chat

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/chat` | Cookie | SSE stream — Gemini chat with gesture/QR events |

**Request:**

```json
{
  "message": "Where is the food court?",
  "history": [],
  "conversation_id": "uuid-or-null",
  "language": "en-US"
}
```

**Response:** `text/event-stream` with `data: {"type": "...", "value": "..."}\n\n` events.

### TTS

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/tts` | Cookie | Synthesize speech + viseme frames |

**Request:**

```json
{ "text": "Welcome to Marina Square.", "language": "en-US" }
```

**Response:**

```json
{
  "audioBase64": "...",
  "mimeType": "audio/mpeg",
  "visemes": [{ "t": 0, "label": "silence", "mouth": 0 }]
}
```

### Config

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/config` | None | Public kiosk config |

### Users (Admin)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users/` | Admin | Paginated user list (`page`, `page_size`) |
| POST | `/users/` | Admin | Create user (201); returns generated password |
| DELETE | `/users/{user_id}` | Admin | Delete user (204) |
| POST | `/users/{user_id}/reset-password` | Admin | Reset password; returns new password |

### Conversations

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/conversations/` | Cookie | List own conversations (admin env → `[]`) |
| POST | `/conversations/` | Cookie | Create conversation (admin env → 403) |
| GET | `/conversations/{id}` | Cookie | Conversation detail + messages (owner or admin) |
| DELETE | `/conversations/{id}` | Cookie | Delete conversation (204; owner or admin) |

### Analytics (Admin)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/analytics` | Admin | Dashboard stats (`page`, `page_size`) |

### Frontend BFF Mapping

| Next.js route | Backend endpoint |
|---|---|
| `POST /api/auth` | `POST /auth/login` |
| `GET /api/auth/me` | `GET /auth/me` |
| `POST /api/auth/logout` | `POST /auth/logout` |
| `POST /api/chat` | `POST /chat` |
| `POST /api/tts` | `POST /tts` |
| `GET /api/config` | `GET /config` |
| `GET/POST /api/admin/users` | `GET/POST /users/` |
| `DELETE /api/admin/users/[id]` | `DELETE /users/{id}` |
| `POST /api/admin/users/[id]/reset-password` | `POST /users/{id}/reset-password` |
| `GET /api/admin/analytics` | `GET /analytics` |
| `GET /api/admin/conversations/[id]` | `GET /conversations/{id}` |

---

## 10. Conventions for Contributors

- **Request/response models** are defined inline in router files — no separate `schemas/` package.
- **All settings** go in `config.py` — also document in this README and `.env.example`.
- **Schema changes** require a new Alembic migration (`uv run alembic revision --autogenerate`).
- **Async SQLAlchemy** throughout — use `Depends(get_db)` for route handlers; use `async_session()` context manager inside SSE generators (session must outlive the stream).
- **Sync GCP SDK calls** (TTS) must be wrapped in `asyncio.run_in_executor` — do not block the event loop.
- **SSE format** — always `data: {json}\n\n`; event objects use `{ "type": "...", "value": "..." }`.
- **Password hashing** — bcrypt via `bcrypt.hashpw` / `bcrypt.checkpw`.
- **Do not commit** `.env`, `credentials/`, `*-key.json`, or `.venv/`.

---

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| **401** on protected routes | Missing, expired, or invalid cookie | Re-login via `POST /auth/login` |
| **403** on admin routes | User is not admin | Use `ADMIN_USERNAME`/`ADMIN_PASSWORD` or a DB user with `is_admin=true` |
| Chat stream **errors** or empty | Vertex AI creds or project misconfigured | Check `GOOGLE_VERTEX_PROJECT`; verify ADC or key mount |
| **TTS fails** (500) | Cloud TTS permissions or creds | Verify service account has TTS access; check logs |
| **DB connection refused** | Wrong `DATABASE_URL` | Dev Docker: use hostname `postgres`, not `localhost` |
| **Alembic fails** on container start | DB not ready | Dev: ensure postgres healthcheck passes before backend starts |
| **CORS errors** from frontend | Origin mismatch | Set `NEXT_PUBLIC_ORIGIN` to match frontend URL exactly |
| **RAG not grounding** responses | Empty datastore IDs | Set `VERTEX_AI_WEB_DATASTORE_ID` and/or `VERTEX_AI_PDF_DATASTORE_ID` |
| Chat returns text but **no gesture** | Model didn't follow format | Router defaults to `idle`; check system prompt in `services/gemini.py` |
| **502** from frontend | Backend not running | Start backend; check `NEXT_PUBLIC_BACKEND_URL` in frontend |
| Env admin has **no conversations** in `/conversations/` | By design | Env admin has `id: null`; conversations created via `/chat` only |

### Useful Debug Commands

```bash
# Check health
curl http://localhost:8000/health

# Test login (save cookie)
curl -c cookies.txt -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'

# Test authenticated endpoint
curl -b cookies.txt http://localhost:8000/auth/me

# View logs in Docker
docker compose -f docker-compose.dev.yml logs backend -f
```

---

## 12. Related Docs

| Document | Contents |
|---|---|
| [Root README](../README.md) | Full-stack hub — setup, Docker, CI/CD, architecture, end-to-end flows |
| [Frontend README](../frontend_nextjs/README.md) | BFF proxies, 3D avatar, lip-sync, kiosk UX |
