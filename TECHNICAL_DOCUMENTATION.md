# Marina Square AI Concierge — Technical Documentation

**Singapore Land Group · Internal Engineering Reference**

---

## Table of Contents

**Part 1 — Project**
1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [Monorepo & Folder Structure](#3-monorepo--folder-structure)
4. [Getting Started](#4-getting-started)

**Part 2 — Configuration**

5. [Environment Variables](#5-environment-variables)
6. [GCP Authentication](#6-gcp-authentication)

**Part 3 — Infrastructure**

7. [Docker & Deployment](#7-docker--deployment)

**Part 4 — Frontend**

8. [Frontend Deep Dive](#8-frontend-deep-dive)

**Part 5 — Backend**

9. [Backend Deep Dive](#9-backend-deep-dive)

**Part 6 — Reference**

10. [API Reference](#10-api-reference)
11. [End-to-End Data Flows](#11-end-to-end-data-flows)
12. [Troubleshooting](#12-troubleshooting)
13. [Contributing Guidelines](#13-contributing-guidelines)

---

## 1. Overview

The **Marina Square AI Concierge** is a kiosk application where visitors log in, pick a language, and have a conversation with a 3D talking avatar. The avatar's responses are powered by Google Vertex AI Gemini; speech is synthesised by Google Cloud TTS; lip-sync is driven by a real-time phoneme-to-viseme pipeline. An admin dashboard provides user management, conversation history, and analytics.

### Two-Service Architecture

The system is split into two independently-deployable services that communicate over HTTP.

| Service | Directory | Role |
|---|---|---|
| **Frontend** | `frontend_nextjs/` | Browser kiosk UI, 3D avatar rendering, thin BFF proxy to FastAPI |
| **Backend** | `backend_fastapi/` | Auth, Gemini chat (SSE), TTS + visemes, PostgreSQL, admin API |

In production, a **Cloud SQL Proxy** sidecar connects the backend container to managed PostgreSQL on GCP.

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | Next.js 16 (App Router), React 19, TypeScript 5 |
| 3D / Avatar | Three.js, `@react-three/fiber`, `@react-three/drei` |
| Styling | Tailwind CSS v4 |
| Backend framework | FastAPI, Uvicorn |
| Backend language | Python 3.12 |
| Package manager (BE) | `uv` |
| Database | PostgreSQL 16 (`asyncpg` async driver, SQLAlchemy 2.0) |
| Migrations | Alembic |
| AI Chat | Vertex AI Gemini (`google-genai` SDK) |
| RAG / Grounding | Vertex AI Search (web + PDF datastores) |
| Text-to-Speech | Google Cloud TTS (Gemini TTS model) |
| Auth | JWT in HTTP-only cookies (HS256, 7-day expiry) |
| Runtime | Node 20 Alpine (frontend) · Python 3.12 Slim (backend) |
| Deployment | Docker Compose on GCP Compute Engine |
| CI/CD | GitHub Actions → GCP Secret Manager → VM SSH via IAP |

### Key Features

- **3D avatar** with real-time lip-sync (viseme pipeline) and gesture animations
- **AI chat** powered by Gemini via Vertex AI with optional RAG grounding (web + PDF datastores)
- **Text-to-speech** via Gemini TTS with sentence-by-sentence audio streaming
- **Bilingual UI** — English (`en-US`) and Simplified Chinese (`zh-CN`)
- **Push-to-talk** via Web Speech API; typed messages queue while avatar speaks
- **Kiosk idle timeout** with two-stage countdown warning modal
- **Indoor wayfinder QR** triggered when Gemini appends a `[SHOW_QR]` marker
- **Admin dashboard** — user management, conversation history, analytics

---

## 2. System Architecture

### Component Overview

```mermaid
flowchart TB
  subgraph browser [Browser]
    Pages["App Router pages"]
    Avatar3D["Avatar.tsx (Three.js)"]
    ChatUI["Chat.tsx"]
  end

  subgraph nextjs [frontend_nextjs — port 3000]
    Middleware["middleware.ts (cookie gate)"]
    APIProxy["src/app/api/* (BFF proxies)"]
  end

  subgraph backend [backend_fastapi — port 8000]
    API["FastAPI routers"]
    DB["PostgreSQL"]
  end

  subgraph gcp [Google Cloud]
    Gemini["Vertex AI Gemini"]
    Search["Vertex AI Search (RAG)"]
    TTS["Cloud TTS"]
  end

  Pages --> Middleware
  ChatUI --> APIProxy
  APIProxy -->|"NEXT_PUBLIC_BACKEND_URL + cookie"| API
  API --> Gemini
  API --> Search
  API --> TTS
  API --> DB
```

### Layer Ownership

| Concern | Owner | Key location |
|---|---|---|
| Kiosk UI (lobby, chat, toolbar) | Frontend | `frontend_nextjs/src/app/` |
| 3D avatar + lip-sync | Frontend | `frontend_nextjs/src/components/Avatar.tsx` |
| BFF API proxies | Frontend | `frontend_nextjs/src/app/api/` |
| Route middleware (cookie presence) | Frontend | `frontend_nextjs/src/middleware.ts` |
| JWT validation | Backend | `backend_fastapi/auth/dependencies.py` |
| Gemini chat + SSE streaming | Backend | `backend_fastapi/routers/chat.py` |
| TTS + viseme generation | Backend | `backend_fastapi/services/tts_service.py` |
| User/conversation persistence | Backend | `backend_fastapi/models/` |
| Admin API | Backend | `backend_fastapi/routers/users.py`, `analytics.py` |

### Authentication Model

Auth is split between the two services:

| Layer | What it checks |
|---|---|
| **Frontend middleware** (`src/middleware.ts`) | `auth-token` cookie **exists** on protected routes (`/`, `/chat`, `/admin`) |
| **Backend** (`auth/dependencies.py`) | JWT is **valid** — signature + expiry — on every API call |

**Login flow:** `POST /api/auth` (Next.js proxy) → `POST /auth/login` (FastAPI) → backend sets an HTTP-only `auth-token` cookie (7-day max-age). All subsequent `/api/*` calls forward this cookie automatically.

**Two credential paths:**

| Type | Source | JWT `is_admin` | DB presence |
|---|---|---|---|
| Env admin (kiosk operator) | `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars | `true` | Not stored; placeholder row created on first chat |
| DB user | `users` table, bcrypt password | Per user row | Always present |

**Middleware redirect rules:**

- Unauthenticated `/` or `/admin` → `/login`
- Unauthenticated `/chat` → `/` (lobby, not login — kiosk session may have timed out)
- Authenticated `/login` → `/` (lobby)

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

**Cascade rules:** `User` delete cascades to `Conversation`; `Conversation` delete cascades to `Message`. Messages are ordered by `created_at`.

---

## 3. Monorepo & Folder Structure

```
avatar_chatbot/                         ← repo root
│
├── frontend_nextjs/                    ← Next.js kiosk UI + BFF proxies
│   ├── public/
│   │   └── avatar/
│   │       └── avatar_active.glb       ← 3D avatar model (ARKit blend shapes)
│   ├── src/
│   │   ├── middleware.ts               ← Auth cookie gate
│   │   ├── app/
│   │   │   ├── page.tsx                ← Lobby (/)
│   │   │   ├── chat/page.tsx           ← Kiosk in-call (/chat)
│   │   │   ├── login/page.tsx          ← Login form
│   │   │   ├── admin/                  ← Admin dashboard pages
│   │   │   └── api/                    ← BFF proxy route handlers
│   │   ├── components/
│   │   │   ├── Avatar.tsx              ← 3D avatar (lip-sync, gestures, blink)
│   │   │   ├── Chat.tsx                ← Chat UI, SSE, TTS queue, Web Speech
│   │   │   ├── IdleWarningModal.tsx
│   │   │   └── admin/
│   │   ├── hooks/
│   │   │   └── useIdleReset.ts         ← Kiosk idle timeout logic
│   │   ├── lib/
│   │   │   ├── locale.ts               ← en-US / zh-CN UI strings
│   │   │   └── kioskChatGate.ts        ← sessionStorage gate for /chat
│   │   └── types/
│   │       └── viseme.ts               ← VisemeFrame, TtsResponse, AvatarGesture
│   ├── Dockerfile                      ← Production multi-stage build
│   ├── Dockerfile.dev                  ← Dev container (npm run dev)
│   └── next.config.ts
│
├── backend_fastapi/                    ← FastAPI API service
│   ├── main.py                         ← App entry, CORS, router registration
│   ├── config.py                       ← Pydantic Settings (reads repo-root .env)
│   ├── auth/
│   │   ├── dependencies.py             ← get_current_user, require_admin
│   │   └── jwt.py                      ← JWT create/decode (HS256)
│   ├── models/
│   │   ├── user.py
│   │   ├── conversation.py
│   │   └── message.py
│   ├── routers/
│   │   ├── auth.py                     ← /auth/login, /logout, /me
│   │   ├── chat.py                     ← /chat SSE streaming
│   │   ├── tts.py                      ← /tts synthesis
│   │   ├── users.py                    ← /users/ CRUD (admin)
│   │   ├── conversations.py            ← /conversations/ CRUD
│   │   ├── analytics.py                ← /analytics dashboard stats
│   │   └── config_router.py            ← /config public kiosk settings
│   ├── services/
│   │   ├── db.py                       ← Async engine + session factory
│   │   ├── gemini.py                   ← Vertex AI Gemini streaming + hybrid RAG routing
│   │   ├── vertex_search.py            ← Discovery Engine direct search (cross-lingual)
│   │   ├── tts_service.py              ← Google Cloud TTS
│   │   └── viseme.py                   ← Phoneme → viseme frame pipeline
│   ├── alembic/
│   │   └── versions/0001_initial.py    ← Initial schema migration
│   ├── Dockerfile
│   └── Dockerfile.dev
│
├── docker-compose.yml                  ← Production (Cloud SQL Proxy)
├── docker-compose.dev.yml              ← Development (local PostgreSQL, hot reload)
├── .env.example                        ← Environment variable template
└── .github/workflows/main.yml          ← CI/CD → GCP Compute Engine
```

### Key Files Reference

| File | Edit when you need to… |
|---|---|
| `frontend_nextjs/src/components/Avatar.tsx` | Change lip-sync, gestures, blink, camera, or swap GLB |
| `frontend_nextjs/src/components/Chat.tsx` | Change message UI, SSE parsing, TTS queue, speech recognition |
| `frontend_nextjs/src/app/chat/page.tsx` | Change toolbar, audio playback, playhead clock, or chat layout |
| `frontend_nextjs/src/app/page.tsx` | Change lobby UX, language picker, or pre-call flow |
| `frontend_nextjs/src/middleware.ts` | Add/remove protected routes or change redirect rules |
| `frontend_nextjs/src/app/api/*/route.ts` | Change proxy headers, error handling, or add new backend endpoints |
| `frontend_nextjs/src/lib/locale.ts` | Add UI strings or a new language |
| `frontend_nextjs/src/types/viseme.ts` | Add shared types used across TTS, chat, and avatar |
| `backend_fastapi/routers/chat.py` | Change SSE events, gesture parsing, conversation logic |
| `backend_fastapi/services/gemini.py` | Update system prompt, RAG tools, query routing, model config |
| `backend_fastapi/services/vertex_search.py` | Change direct search behavior, datastores, Chinese query simplification |
| `backend_fastapi/services/tts_service.py` | Change TTS model, voice, or language mapping |
| `backend_fastapi/services/viseme.py` | Adjust phoneme mapping or timing constants |
| `backend_fastapi/auth/dependencies.py` | Change auth guards or admin checks |
| `backend_fastapi/auth/jwt.py` | Change token expiry or algorithm |
| `backend_fastapi/config.py` | Add new environment variables |
| `backend_fastapi/models/*.py` | Change database schema (also requires a new Alembic migration) |
| `backend_fastapi/main.py` | Register new routers or change CORS |
| `backend_fastapi/routers/analytics.py` | Add or modify dashboard metrics |

---

## 4. Getting Started

### Prerequisites

- Docker + Docker Compose (recommended path)
- GCP project with **Vertex AI** and **Cloud TTS** APIs enabled
- For development: `gcloud auth application-default login` (no key file needed)
- For local-only (no Docker): Node.js 20 + Python 3.12 + `uv` + a running PostgreSQL instance

### Step 1 — Create the environment file

```bash
cp .env.example .env
```

Minimum required variables (see [Section 5](#5-environment-variables) for the full list):

| Variable | Example value |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://avatar:change-me@localhost:5432/avatar_chatbot` |
| `DATABASE_URL_DOCKER` | `postgresql+asyncpg://avatar:change-me@postgres:5432/avatar_chatbot` |
| `JWT_SECRET` | 64-char hex string (see below) |
| `GOOGLE_VERTEX_PROJECT` | Your GCP project ID |

Generate a JWT secret:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### Step 2 — Run with Docker (recommended)

```bash
docker compose -f docker-compose.dev.yml up
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Backend API docs (Swagger) | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 |

Hot reload is enabled for both services. Edit files in `frontend_nextjs/` or `backend_fastapi/` and changes apply immediately without a rebuild.

### Step 3 — Run without Docker (optional)

Requires a running PostgreSQL instance and configured `.env`.

```bash
# Backend (terminal 1)
cd backend_fastapi
uv sync
uv run alembic upgrade head
uv run uvicorn main:app --reload     # → http://localhost:8000

# Frontend (terminal 2)
cd frontend_nextjs
npm install
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000 npm run dev  # → http://localhost:3000
```

### Step 4 — Production

```bash
docker compose up --build
```

Frontend is exposed on port 3000. Backend and the Cloud SQL Proxy are internal only.

---

## 5. Environment Variables

All services read from the repo-root `.env`. Docker Compose `environment:` blocks override specific variables per service.

| Variable | Consumed by | Required | Default | Description |
|---|---|---|---|---|
| `POSTGRES_USER` | Docker postgres service | Dev only | — | PostgreSQL username |
| `POSTGRES_PASSWORD` | Docker postgres service | Dev only | — | PostgreSQL password |
| `POSTGRES_DB` | Docker postgres service | Dev only | — | PostgreSQL database name |
| `DATABASE_URL` | Backend (local dev) | Yes | — | `postgresql+asyncpg://…@localhost:5432/…` |
| `DATABASE_URL_DOCKER` | Docker Compose dev | Dev Docker | — | Same URL with hostname `postgres` |
| `DATABASE_URL_PROD` | Docker Compose prod | Prod | — | Cloud SQL Proxy connection string |
| `JWT_SECRET` | Backend | Yes | — | JWT signing key (HS256) |
| `JWT_ALGORITHM` | Backend | No | `HS256` | JWT algorithm |
| `JWT_EXPIRE_MINUTES` | Backend | No | `10080` | Token lifetime (7 days) |
| `ADMIN_USERNAME` | Backend | Yes | — | Kiosk operator login username |
| `ADMIN_PASSWORD` | Backend | Yes | — | Kiosk operator login password |
| `GOOGLE_VERTEX_PROJECT` | Backend | For chat/TTS | — | GCP project ID |
| `GOOGLE_VERTEX_LOCATION` | Backend | No | `us-central1` | Vertex AI region |
| `GEMINI_CHAT_MODEL` | Backend | No | `gemini-2.5-flash` | Chat model name |
| `VERTEX_AI_WEB_ENGINE_ID` | Backend | No | — | Website search engine ID (cross-lingual semantic search, preferred) |
| `VERTEX_AI_WEB_DATASTORE_ID` | Backend | No | — | Website RAG datastore ID (fallback if no engine) |
| `VERTEX_AI_PDF_DATASTORE_ID` | Backend | No | — | PDF RAG datastore ID |
| `REQUIRE_DATASTORE_GROUNDING` | Backend | No | `true` | Return fallback message if no datastore results |
| `TTS_MODEL` | Backend | No | `gemini-2.5-flash-tts` | TTS model name |
| `TTS_VOICE_NAME` | Backend | No | `Achernar` | TTS voice |
| `TTS_VOICE_PROMPT` | Backend | No | Hospitality prompt | TTS style instruction |
| `SESSION_IDLE_TIMEOUT_MINUTES` | Backend | No | `4` | Kiosk idle timeout |
| `NEXT_PUBLIC_ORIGIN` | Backend (CORS) | No | `http://localhost:3000` | Frontend origin for CORS |
| `NEXT_PUBLIC_BACKEND_URL` | Frontend | No | `http://backend:8000` | FastAPI proxy target |
| `GOOGLE_APPLICATION_CREDENTIALS` | Backend, GCP SDK | No | `/app/credentials/gcp-key.json` | Path to GCP credentials file |

Template: [`.env.example`](.env.example)

> **Note:** `VERTEX_AI_WEB_ENGINE_ID` is preferred over `VERTEX_AI_WEB_DATASTORE_ID` for location queries. The engine supports cross-lingual semantic search (query in English, content in Chinese, or vice versa). If both are set, the engine is used and the datastore is ignored for web searches. Both can be set simultaneously.

---

## 6. GCP Authentication

### Development — Application Default Credentials (ADC)

No key file required. One-time setup:

```bash
brew install google-cloud-sdk   # macOS, if not installed
gcloud auth application-default login --project=YOUR_PROJECT_ID
```

Docker Compose dev automatically mounts the ADC file:

```
~/.config/gcloud/application_default_credentials.json
  → /app/credentials/application_default_credentials.json  (inside container)
```

The `GOOGLE_APPLICATION_CREDENTIALS` env var is set accordingly in `docker-compose.dev.yml`.

### Production — Service Account Key

A service account JSON key is stored as a **base64-encoded** secret in GCP Secret Manager (`AVATAR_CHATBOT_JSON_KEY`). The CI/CD pipeline decodes it to `avatar-chatbot-key.json` on the VM.

```bash
# Encode and upload key to Secret Manager
base64 -i avatar-chatbot-key.json | tr -d '\n' \
  | gcloud secrets versions add AVATAR_CHATBOT_JSON_KEY --data-file=-
```

Docker Compose prod mounts:

```
./avatar-chatbot-key.json → /app/credentials/gcp-key.json  (inside container)
```

### Required IAM Roles

| Role | Purpose |
|---|---|
| `roles/aiplatform.user` | Vertex AI Gemini chat |
| `roles/discoveryengine.viewer` | Vertex AI Search RAG grounding |

> **Note:** Vertex AI Search location is always `global`, not `us-central1`. This is separate from the Gemini region.

---

## 7. Docker & Deployment

### Development Compose (`docker-compose.dev.yml`)

| Service | Image / Build | Published port | Notes |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | `5432:5432` | Local DB, named volume |
| `backend` | `backend_fastapi/Dockerfile.dev` | `8000:8000` | `--reload`, source bind-mounted |
| `frontend` | `frontend_nextjs/Dockerfile.dev` | `3000:3000` | `npm run dev`, source bind-mounted |

- Backend runs `alembic upgrade head` then `uvicorn --reload` on startup.
- GCP credentials: ADC mount (see Section 6).
- `DATABASE_URL` is overridden to `DATABASE_URL_DOCKER` (hostname `postgres`).

### Production Compose (`docker-compose.yml`)

| Service | Image / Build | Published port | Notes |
|---|---|---|---|
| `cloud-sql-proxy` | `gcr.io/cloud-sql-connectors/cloud-sql-proxy:2` | host `5432` | Connects to Cloud SQL |
| `backend` | `backend_fastapi/Dockerfile` | Internal `8000` | Migrations on start, no reload |
| `frontend` | `frontend_nextjs/Dockerfile` | `3000:3000` | Standalone Next.js build |

- Backend runs `alembic upgrade head` then `uvicorn` on startup.
- GCP credentials: `avatar-chatbot-key.json` mount (see Section 6).
- `DATABASE_URL` is overridden to `DATABASE_URL_PROD` (hostname `cloud-sql-proxy`).

### Dockerfile Summary

| | Frontend | Backend |
|---|---|---|
| **Dev** | `node:20-alpine`, `npm ci`, `npm run dev` | `python:3.12-slim`, `uv sync`, `uvicorn --reload` |
| **Prod** | Multi-stage; `output: standalone`; `node server.js` | `uv sync --no-dev`; `alembic upgrade head && uvicorn` |

### Database Configuration

| Environment | `DATABASE_URL` hostname | Connection |
|---|---|---|
| Dev (Docker) | `postgres` | Local postgres container (`DATABASE_URL_DOCKER`) |
| Dev (local) | `localhost` | Local PostgreSQL instance (`DATABASE_URL`) |
| Production | `cloud-sql-proxy` | Cloud SQL Auth Proxy sidecar (`DATABASE_URL_PROD`) |

SQLAlchemy pool config (`services/db.py`): size 10, max overflow 20, `pool_pre_ping=True`.

Cloud SQL instance: `aiconcierge-prod-sea:asia-southeast1:aiconcierge-prod-sea-db-01`.

### Alembic Migrations

Migrations run **automatically on every container start** (both dev and prod Dockerfiles run `alembic upgrade head` before Uvicorn).

To create a new migration manually:

```bash
cd backend_fastapi
uv run alembic revision --autogenerate -m "describe change"
uv run alembic upgrade head
```

Current state: single revision `0001_initial.py` creates the `users`, `conversations`, and `messages` tables plus the `message_role` enum.

### CI/CD — GitHub Actions

**Trigger:** PR merge to `main` or manual `workflow_dispatch`.

**Target:** GCP Compute Engine VM at `/opt/aiconcierge` (environment: `Singaporelandgroup-prod`).

**Deployment flow:**

1. Checkout code; authenticate with GCP via Workload Identity Federation.
2. SSH to VM via IAP; ensure Docker + Compose v2 are installed.
3. `docker compose down`; clean old `.git`, `.env`, and credentials.
4. Tar source (excluding `node_modules`, `.next`, `.venv`, `.git`) → SCP to VM → extract.
5. Build repo-root `.env` on VM from **GCP Secret Manager** secrets.
6. Decode `AVATAR_CHATBOT_JSON_KEY` → `avatar-chatbot-key.json`.
7. `docker compose build --no-cache && docker compose up -d`.
8. `docker image prune -f`.

**Secret Manager keys used by CI/CD:**

| Secret | Purpose |
|---|---|
| `POSTGRES_PASSWORD` | Database password |
| `DATABASE_URL_PROD` | Cloud SQL connection string |
| `JWT_SECRET` | JWT signing key |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Admin login credentials |
| `GOOGLE_VERTEX_PROJECT` / `GOOGLE_VERTEX_LOCATION` | Vertex AI project and region |
| `VERTEX_AI_WEB_ENGINE_ID` | Website search engine (cross-lingual) |
| `VERTEX_AI_WEB_DATASTORE_ID` / `VERTEX_AI_PDF_DATASTORE_ID` | RAG datastores |
| `GEMINI_CHAT_MODEL` | Chat model name |
| `TTS_MODEL` / `TTS_VOICE_NAME` | TTS configuration |
| `SESSION_IDLE_TIMEOUT_MINUTES` | Kiosk idle timeout |
| `NEXT_PUBLIC_ORIGIN` | CORS allowed origin |
| `AVATAR_CHATBOT_JSON_KEY` | Base64-encoded GCP service account key |

No `.env` files or credentials are committed to the repository.

---

## 8. Frontend Deep Dive

The frontend (`frontend_nextjs/`) is a **kiosk UI + Backend-for-Frontend (BFF)**. It does not call Gemini or Cloud TTS directly. All `/api/*` route handlers forward requests to FastAPI and relay responses (including SSE streams) back to the browser.

### User Journeys

```mermaid
sequenceDiagram
  participant User
  participant Login as /login
  participant Lobby as /
  participant Chat as /chat
  participant Admin as /admin

  User->>Login: username/password
  Login->>Login: POST /api/auth
  alt is_admin
    Login->>Admin: redirect
  else kiosk user
    Login->>Lobby: redirect
  end
  Lobby->>Lobby: pick language, grant mic/cam
  Lobby->>Chat: sessionStorage gate + navigate
  Chat->>Chat: push-to-talk, avatar speaks
  Chat->>Lobby: hang up or idle timeout
```

#### Login (`/login`)

1. User submits username and password.
2. `POST /api/auth` → backend `POST /auth/login`.
3. Backend sets an HTTP-only `auth-token` JWT cookie.
4. Client calls `GET /api/auth/me` to read `is_admin`.
5. Admin → redirect to `/admin`; everyone else → `/` (lobby).

#### Lobby (`/`)

Pre-call screen with Marina Square branding:

1. **Language picker** — `en-US` or `zh-CN`, stored in `sessionStorage` as `selectedLang`.
2. **Avatar preview** — static `<Avatar />` (no lip-sync props).
3. **Start Chat** — requests `getUserMedia({ audio: true, video: true })`.
   - On success: sets `KIOSK_CHAT_ENTRY_KEY` in `sessionStorage` → navigates to `/chat`.
   - On denial: shows localized error, still sets gate key, redirects after 1.8s.
4. **Logout** — `POST /api/auth/logout` → `/login`.
5. **Admin link** — shown if `/api/auth/me` returns `is_admin: true`.

On lobby mount, `KIOSK_CHAT_ENTRY_KEY` is cleared so a direct `/chat` URL cannot bypass the lobby.

#### Chat (`/chat`)

1. **Gate check** — if `KIOSK_CHAT_ENTRY_KEY` is absent in `sessionStorage` → redirect to `/`.
2. **Split layout** — 3D avatar (left) + collapsible chat panel (right, 380 px).
3. **Toolbar** — call timer, push-to-talk mic button, chat toggle, captions toggle, hang-up.
4. **Idle reset** — configurable timeout from `GET /api/config`; 30-second warning modal → auto-return to lobby.
5. On 401 from chat or TTS, `Chat.tsx` clears the kiosk session gate and redirects to the lobby.

#### Admin (`/admin`)

Protected by the same middleware. Layout (`admin/layout.tsx`) checks admin status via `/api/auth/me`.

| Route | Purpose |
|---|---|
| `/admin/users` | Paginated user list — create, reset password, delete |
| `/admin/analytics` | Stats cards, recent conversations, top users |
| `/admin/conversations/[id]` | Full message thread rendered with ReactMarkdown |

### BFF Proxy Pattern

Every API route in `src/app/api/` follows the same pattern: forward the request body and cookie to FastAPI, relay the response (including `Set-Cookie` headers and SSE streams) back to the browser.

Example — chat SSE passthrough (`src/app/api/chat/route.ts`):

```typescript
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://backend:8000";

const upstream = await fetch(`${BACKEND}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": cookie },
    body,
});

return new Response(upstream.body, {
    status: upstream.status,
    headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
    },
});
```

### Page Routes

| Route | File | Purpose |
|---|---|---|
| `/` | `src/app/page.tsx` | Lobby — language picker, avatar preview, start chat |
| `/chat` | `src/app/chat/page.tsx` | Kiosk in-call — avatar + chat panel + toolbar |
| `/login` | `src/app/login/page.tsx` | Username/password login form |
| `/admin` | `src/app/admin/page.tsx` | Redirect to `/admin/users` |
| `/admin/users` | `src/app/admin/users/page.tsx` | User CRUD |
| `/admin/analytics` | `src/app/admin/analytics/page.tsx` | Stats and recent conversations |
| `/admin/conversations/[id]` | `src/app/admin/conversations/[id]/page.tsx` | Message thread detail |

### Features

#### Bilingual UI

- Supported locales: `en-US`, `zh-CN`.
- Locale chosen on lobby screen, stored in `sessionStorage` (`selectedLang`).
- All UI strings accessed via `getLocaleStrings(locale)` from `src/lib/locale.ts`.
- To add a new language: extend `SUPPORTED_LOCALES` and add a full string block in `locale.ts`.

#### 3D Avatar + Lip-Sync

**File:** `src/components/Avatar.tsx`

- Renders a bust-view 3D avatar using `@react-three/fiber` and `@react-three/drei`.
- Model loaded from `public/avatar/avatar_active.glb` — a Streamoji-style GLB with ARKit morph targets.
- Camera is fixed; orbit/pan/zoom disabled for kiosk use.
- Lip-sync driven by `VisemeFrame[]` — timestamped morph target weights from the TTS pipeline.

**Shared types** (`src/types/viseme.ts`):

```typescript
export type VisemeFrame = {
    t: number;       // timestamp in ms from audio start
    label: string;   // phoneme label (e.g. "AA", "PP", "silence")
    mouth: number;   // morph influence weight 0–1
};

export type AvatarGesture = "idle" | "nod" | "shake" | "tilt" | "lookup" | "excited";
```

**Avatar animation systems:**

| System | How it works |
|---|---|
| **Lip-sync** | TTS phoneme labels → ARKit blend shape combinations (`VISEME_TO_ARKIT` map). `sampleViseme()` interpolates frames by `playheadMs` with smoothstep. Teeth mirror `jawOpen`. |
| **Gestures** | `GESTURE_MOTION` maps each gesture to head rotation targets. During speech, gesture pulses in a slow loop. Idle head has subtle sine-wave micro-movement. |
| **Blink** | Fixed 10-second interval, 0.2-second duration. |
| **Idle smile** | `mouthSmileLeft/Right = 0.2` when not talking. |

> **Known limitation:** arm poses are defined in `GESTURE_MOTION` but `useFrame` always lerps arms to a relaxed position — only **head gestures** are visibly applied today.

> **Debugging tip:** open browser DevTools console on load. `Avatar.tsx` logs all discovered morph targets so you can verify the GLB was exported with blend shapes.

#### Chat + SSE Streaming

**File:** `src/components/Chat.tsx`

1. User sends a message (typed or voice).
2. `POST /api/chat` → FastAPI streams the Gemini response as Server-Sent Events.
3. Frontend parses SSE events:

| Event | Payload | Frontend action |
|---|---|---|
| `conversation_id` | UUID | Stored for follow-up messages |
| `gesture` | `AvatarGesture` | Passed to avatar |
| `chunk` | text fragment | Appended to bot message; triggers sentence TTS |
| `done` | — | Response marked complete |
| `show_qr` | — | Indoor wayfinder QR overlay shown |
| `error` | message | Error displayed to user |

#### TTS + Audio Queue

```mermaid
sequenceDiagram
  participant Chat as Chat.tsx
  participant TTS as /api/tts
  participant Page as chat/page.tsx
  participant Avatar as Avatar.tsx

  Chat->>TTS: sentence text
  TTS-->>Chat: audioBase64 + viseme frames
  Chat->>Page: onBotSpeech()
  Page->>Page: audio element + RAF playheadMs
  Page->>Avatar: visemes, playheadMs, gesture
  Avatar->>Avatar: ARKit morph targets
```

1. As text chunks arrive, `Chat.tsx` splits on sentence boundaries (`.?!` and Chinese `。！？`).
2. Each sentence fires a parallel `POST /api/tts` request.
3. Results are drained **in order** via an internal queue (`pendingTtsRef`).
4. `chat/page.tsx` receives segments via `onBotSpeech()`:
   - Decodes base64 MP3 into a hidden `<audio>` element.
   - Scales viseme timestamps to actual audio duration.
   - Ticks `playheadMs` each `requestAnimationFrame` frame.
5. Skip controls allow skipping the next segment or all queued segments.

#### Push-to-Talk (Voice Input)

- Uses the browser **Web Speech API** (`SpeechRecognition` / `webkitSpeechRecognition`).
- Activated by holding the toolbar mic button or the **Space** key.
- Language follows the lobby locale selection.

**Input mode behaviour while avatar speaks:**

| Input mode | Behaviour |
|---|---|
| Typed text | Queued — processed after current speech ends |
| Push-to-talk | Interrupts — clears audio queue, sends immediately |

#### Kiosk Idle Timeout

**Files:** `src/hooks/useIdleReset.ts`, `src/components/IdleWarningModal.tsx`

1. On chat mount, fetches `GET /api/config` for `session_idle_timeout_minutes`.
2. Two-stage timer:
   - **Stage 1** — after `(timeout − 30 s)` of inactivity → warning modal with countdown.
   - **Stage 2** — after 30-second countdown → redirect to lobby (`/`).
3. Mouse, keyboard, and touch activity reset the timer.
4. "Stay active" button dismisses the warning and resets.
5. Fallback if backend is unreachable: 1-minute timeout (hardcoded in `src/app/api/config/route.ts`).

#### Indoor Wayfinder QR

When the backend SSE stream emits a `show_qr` event:

1. Chat UI renders a QR code overlay.
2. An extra TTS prompt (`qrTts` locale string) is spoken.

#### Admin Dashboard

- User CRUD with pagination, password reset, and delete.
- Analytics: total users, conversations, messages; recent activity; top users by conversation count.
- Conversation detail with full markdown-rendered message history.
- All admin API routes proxy to FastAPI with cookie forwarding.

---

## 9. Backend Deep Dive

The backend (`backend_fastapi/`) is the **API and business-logic layer**. It receives proxied requests from the Next.js BFF, calls Google Cloud services, and persists all data in PostgreSQL.

### Layer Responsibilities

| Layer | Package | Owns |
|---|---|---|
| **Routers** | `routers/` | HTTP endpoints, Pydantic request/response models, SSE generators |
| **Services** | `services/` | Gemini streaming, Vertex AI Search, TTS synthesis, viseme generation, DB engine |
| **Auth** | `auth/` | JWT create/decode, `get_current_user`, `require_admin` dependencies |
| **Models** | `models/` | SQLAlchemy ORM (`User`, `Conversation`, `Message`) |
| **Config** | `config.py` | Pydantic Settings loaded from repo-root `.env` |
| **Migrations** | `alembic/` | Database schema migrations |

> There is no separate `schemas/` package — Pydantic request/response models are defined inline in each router file.

### Application Entry Point (`main.py`)

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.next_public_origin],
    allow_credentials=True,   # Required for cookie forwarding from Next.js
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

CORS is restricted to `NEXT_PUBLIC_ORIGIN` (default `http://localhost:3000`) with `allow_credentials=True` so the frontend can forward cookies.

### Auth Model

**Files:** `auth/jwt.py`, `auth/dependencies.py`, `routers/auth.py`

- **Token:** HTTP-only cookie named `auth-token`.
- **Algorithm:** HS256.
- **Expiry:** 7 days (`jwt_expire_minutes = 10080`).
- **Payload:** `{ sub: username, exp, is_admin: bool }`.

Auth dependencies:

- `get_current_user` — reads `auth-token` cookie, decodes JWT, resolves user.
- `require_admin` — raises HTTP 403 if `is_admin` is false.

Login flow:

1. `POST /auth/login` — validate credentials (env admin first, then DB lookup).
2. Create JWT, set `auth-token` cookie (HTTP-only, SameSite=lax, 7-day max-age).
3. `GET /auth/me` — returns `{ username, is_admin }` (requires valid cookie).
4. `POST /auth/logout` — deletes the cookie.

> **Env admin note:** Env admin credentials are never stored in PostgreSQL. On the first chat message, a placeholder DB user row is created by `_get_or_create_kiosk_user` in `routers/chat.py` so the conversation can be persisted.

### Gemini SSE Chat

**Files:** `services/gemini.py`, `routers/chat.py`

**Request:** `POST /chat` with `{ message, history?, conversation_id?, language? }`.

**Flow:**

1. Resolve user (create kiosk placeholder if env admin).
2. Resolve or create `Conversation` in PostgreSQL.
3. Save user `Message`; build Gemini history from DB messages.
4. Stream Gemini response; parse gesture from line 1 of output.
5. Emit SSE events to client.
6. Save model `Message` in `finally` block (guaranteed even on error).

**System prompt format:** Gemini is instructed to output **line 1 = gesture name**, **line 2+ = spoken response text**. Valid gestures: `idle`, `nod`, `shake`, `tilt`, `lookup`, `excited`. Router buffers chunks until the first `\n`, validates the gesture, defaults to `idle` if unrecognised.

**SSE event types:**

| Event `type` | Payload | When emitted |
|---|---|---|
| `conversation_id` | UUID string | Start of stream, if a DB conversation exists |
| `gesture` | gesture name | First complete line parsed |
| `chunk` | text fragment | Remaining streamed text |
| `show_qr` | `true` | `[SHOW_QR]` marker detected in response |
| `done` | — | Stream finished |
| `error` | error string | Exception during stream |

SSE wire format: `data: {"type": "...", "value": "..."}\n\n`

> **Latency note:** Gemini 3.x models receive `thinking_level="minimal"` to reduce kiosk response latency.

### Vertex AI RAG — Hybrid Search

**Files:** `services/gemini.py`, `services/vertex_search.py`

The chat route uses a **hybrid search strategy** with three paths based on query classification:

| Query type | Detection | Search method | Rationale |
|---|---|---|---|
| Promo / event / entertainment | Keyword regex (`_PROMO_EVENT_PATTERN`) | Gemini built-in retrieval tools | Richer content; better for time-limited items |
| Location / general | Everything else | Direct Discovery Engine API (`vertex_search.py`) | Deterministic; cross-lingual via search engine |
| Small talk | Greeting/thanks regex | No search | No datastore needed |

**Direct search** (`services/vertex_search.py`):

- Uses `SearchServiceAsyncClient` from `google-cloud-discoveryengine`.
- Prefers `VERTEX_AI_WEB_ENGINE_ID` (cross-lingual semantic search engine) over `VERTEX_AI_WEB_DATASTORE_ID`.
- Web and PDF datastores are searched concurrently via `asyncio.gather`.
- Chinese question words (`在哪里`, `怎么去`, etc.) are stripped before searching for better match quality.
- Results are formatted into a context block injected into the system prompt.

**Gemini retrieval** (promo/event queries):

- Attaches Vertex AI Search retrieval tools directly to the Gemini API request.
- System prompt includes date-filtering rules to suppress expired promotions.

> **Important:** Vertex AI Search location is always `global` (not `us-central1`). Grounding metadata / citations are not forwarded to the client — only the streamed text is relayed.

If `REQUIRE_DATASTORE_GROUNDING=true` (default) and no search results are returned, the backend returns a fallback response instead of hallucinating.

### TTS + Viseme Pipeline

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
- Voice: `TTS_VOICE_NAME` (default `Achernar`) with style instruction `TTS_VOICE_PROMPT`.
- Output format: MP3, base64-encoded.
- GCP SDK call is synchronous; wrapped in `asyncio.run_in_executor` to avoid blocking the event loop.
- Viseme timing uses linear interpolation (~110 ms/phoneme, 50 ms word gap) — Gemini TTS does not provide SSML timepoints.
- Chinese text is segmented per character; English per word.
- Language mapping: `zh-cn` → `cmn-CN`; `zh-tw`/`zh-hk` → `cmn-tw`.

**Response shape:**

```json
{
  "audioBase64": "...",
  "mimeType": "audio/mpeg",
  "visemes": [
    { "t": 0, "label": "silence", "mouth": 0 },
    { "t": 110, "label": "AA", "mouth": 0.8 }
  ]
}
```

### Conversation Persistence

**File:** `routers/chat.py`

- A new `Conversation` is auto-created on the first message if no `conversation_id` is provided.
- Conversation title is set from the first 200 characters of the first user message.
- Messages are stored with role `user` or `model`.
- `updated_at` is bumped when the model response is saved.
- Gemini history is built from DB messages (preferred) or the request `history` field as a fallback.

### Indoor Wayfinder QR

**File:** `routers/chat.py`

When Gemini appends `[SHOW_QR]` to its response (per system prompt instructions for in-mall wayfinding directions):

1. SSE emits `{ "type": "show_qr", "value": true }`.
2. The `[SHOW_QR]` marker is stripped before the message is saved to the DB.
3. Frontend shows the QR overlay and speaks an extra TTS prompt.

### User Management

**File:** `routers/users.py`

| Action | Endpoint | Notes |
|---|---|---|
| List users (paginated) | `GET /users/` | `page` + `page_size` query params |
| Create user | `POST /users/` | Auto-generates a 12-char password; returned once only |
| Delete user | `DELETE /users/{user_id}` | Cascades conversations and messages |
| Reset password | `POST /users/{user_id}/reset-password` | Returns new random password |

New DB users default to `is_admin=false`.

### Analytics

**File:** `routers/analytics.py`

`GET /analytics` returns:

- Totals: users, conversations, messages.
- Today: conversations and messages (UTC midnight boundary).
- `top_users`: top 10 by conversation count.
- `recent_conversations`: paginated list with username and message count.

### Kiosk Config

**File:** `routers/config_router.py`

`GET /config` — **no auth required**. Returns:

```json
{ "session_idle_timeout_minutes": 4 }
```

Value from `SESSION_IDLE_TIMEOUT_MINUTES` env var (default 4).

---

## 10. API Reference

### Backend Endpoints

#### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | `{"status": "ok"}` |

#### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | None | Validates credentials; sets `auth-token` cookie |
| POST | `/auth/logout` | None | Clears `auth-token` cookie |
| GET | `/auth/me` | Cookie | Returns `{ username, is_admin }` |

Login request body:

```json
{ "username": "admin", "password": "..." }
```

#### Chat

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/chat` | Cookie | SSE stream — Gemini chat with gesture and QR events |

Request body:

```json
{
  "message": "Where is the food court?",
  "history": [],
  "conversation_id": "uuid-or-null",
  "language": "en-US"
}
```

Response: `text/event-stream` with `data: {"type": "...", "value": "..."}\n\n` events. See [SSE event types](#gemini-sse-chat) for the full list.

#### TTS

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/tts` | Cookie | Synthesize speech + viseme frames |

Request body:

```json
{ "text": "Welcome to Marina Square.", "language": "en-US" }
```

Response: See [TTS + Viseme Pipeline](#tts--viseme-pipeline) for the JSON shape.

#### Config

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/config` | None | Public kiosk configuration |

#### Users (Admin only)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users/` | Admin | Paginated user list (`page`, `page_size`) |
| POST | `/users/` | Admin | Create user; returns generated password (201) |
| DELETE | `/users/{user_id}` | Admin | Delete user and all data (204) |
| POST | `/users/{user_id}/reset-password` | Admin | Reset password; returns new password |

#### Conversations

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/conversations/` | Cookie | List own conversations (env admin → `[]`) |
| POST | `/conversations/` | Cookie | Create conversation (env admin → 403) |
| GET | `/conversations/{id}` | Cookie | Conversation detail + messages (owner or admin) |
| DELETE | `/conversations/{id}` | Cookie | Delete conversation (204; owner or admin) |

#### Analytics (Admin only)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/analytics` | Admin | Dashboard stats (`page`, `page_size`) |

### BFF Proxy Map

All frontend `/api/*` routes proxy to `NEXT_PUBLIC_BACKEND_URL` (default `http://backend:8000`). Cookies are forwarded on every request.

#### Auth

| Next.js route | Method | Backend endpoint | Notes |
|---|---|---|---|
| `/api/auth` | POST | `/auth/login` | Forwards `Set-Cookie` to browser |
| `/api/auth/me` | GET | `/auth/me` | Returns `{ username, is_admin }` |
| `/api/auth/logout` | POST | `/auth/logout` | Clears cookie via `Set-Cookie` |

#### Kiosk

| Next.js route | Method | Backend endpoint | Notes |
|---|---|---|---|
| `/api/chat` | POST | `/chat` | SSE stream passthrough (`force-dynamic`) |
| `/api/tts` | POST | `/tts` | Returns `{ audioBase64, mimeType, visemes }` |
| `/api/config` | GET | `/config` | Idle timeout; fallback `{ session_idle_timeout_minutes: 1 }` on error |

#### Admin

| Next.js route | Method | Backend endpoint | Notes |
|---|---|---|---|
| `/api/admin/users` | GET | `/users/?page=&page_size=` | Paginated user list |
| `/api/admin/users` | POST | `/users/` | Create user |
| `/api/admin/users/[id]` | DELETE | `/users/{id}` | Delete user |
| `/api/admin/users/[id]/reset-password` | POST | `/users/{id}/reset-password` | Reset password |
| `/api/admin/analytics` | GET | `/analytics?page=&page_size=` | Dashboard stats |
| `/api/admin/conversations/[id]` | GET | `/conversations/{id}` | Conversation detail |

---

## 11. End-to-End Data Flows

### User Journey

```mermaid
sequenceDiagram
  participant User
  participant Login as /login
  participant Lobby as /
  participant Chat as /chat
  participant Admin as /admin

  User->>Login: username/password
  Login->>Login: POST /api/auth
  alt is_admin
    Login->>Admin: redirect
  else kiosk user
    Login->>Lobby: redirect
  end
  Lobby->>Lobby: pick language, grant mic/cam
  Lobby->>Chat: sessionStorage gate + navigate
  Chat->>Chat: push-to-talk, avatar speaks
  Chat->>Lobby: hang up or idle timeout
```

### Full Message Path — Chat + TTS + Lip-Sync

```mermaid
sequenceDiagram
  participant User
  participant Chat as Chat.tsx
  participant BFF as Next.js /api/*
  participant BE as FastAPI
  participant Gemini as Vertex AI
  participant TTS as Cloud TTS
  participant Page as chat/page.tsx
  participant Avatar as Avatar.tsx

  User->>Chat: text or voice input
  Chat->>BFF: POST /api/chat
  BFF->>BE: POST /chat SSE
  BE->>BE: save user message to DB
  BE->>Gemini: stream + optional RAG
  Gemini-->>BE: text chunks
  BE-->>BFF: SSE gesture/chunk/done
  BFF-->>Chat: relay SSE
  Chat->>Chat: split into sentences
  Chat->>BFF: POST /api/tts per sentence
  BFF->>BE: POST /tts
  BE->>TTS: synthesize MP3 + visemes
  BE-->>Chat: audioBase64 + viseme frames
  Chat->>Page: onBotSpeech()
  Page->>Page: audio playback + RAF playhead
  Page->>Avatar: visemes, playheadMs, gesture
  BE->>BE: save model message to DB
```

---

## 12. Troubleshooting

### Symptom Reference

| Layer | Symptom | Likely cause | Fix |
|---|---|---|---|
| Full-stack | Chat returns **502** | Backend not running or wrong URL | Start FastAPI; set `NEXT_PUBLIC_BACKEND_URL=http://localhost:8000` |
| Full-stack | **CORS errors** | Origin mismatch | Set `NEXT_PUBLIC_ORIGIN` to match the frontend URL exactly |
| Full-stack | Nothing works after deploy | Missing Secret Manager secrets | Check CI/CD logs; inspect `.env` on VM |
| Frontend | Redirected from **/chat to /** | Missing kiosk gate or no auth cookie | Start chat from lobby (sets `KIOSK_CHAT_ENTRY_KEY`); ensure you are logged in |
| Frontend | **Lip-sync not moving** | GLB missing morph targets | Open DevTools console — `Avatar.tsx` logs discovered morph targets on load |
| Frontend | **Mic not working** | Browser permissions or non-secure context | `getUserMedia` requires HTTPS or `localhost`; check browser permission prompt |
| Frontend | **Idle timeout too short** | Backend `/config` unreachable | Proxy falls back to 1 minute; ensure backend is running |
| Frontend | Admin pages show **401** | Not logged in as admin | Use `ADMIN_USERNAME` / `ADMIN_PASSWORD` credentials |
| Frontend | Avatar **flickers on load** | React Strict Mode double-mount | Already disabled in `next.config.ts` — do not re-enable |
| Frontend | TTS audio **out of sync** with lips | Viseme timestamp scaling | Check `chat/page.tsx` playhead scaling; report if consistently off |
| Backend | **401** on API routes | Missing, expired, or invalid cookie | Re-login via `POST /auth/login` |
| Backend | **403** on admin routes | User is not admin | Use env admin credentials or a DB user with `is_admin=true` |
| Backend | Chat stream **errors** | Vertex AI creds misconfigured | Check `GOOGLE_VERTEX_PROJECT`; verify ADC or key mount |
| Backend | **TTS fails** (500) | Cloud TTS permissions | Verify service account has TTS access; check backend logs |
| Backend | **DB connection refused** | Wrong `DATABASE_URL` | Dev Docker: use hostname `postgres`, not `localhost` |
| Backend | **Alembic fails** on start | DB not ready | Dev: wait for postgres healthcheck to pass before backend starts |
| Backend | **RAG not grounding** responses | Empty datastore IDs | Set `VERTEX_AI_WEB_ENGINE_ID` and/or `VERTEX_AI_WEB_DATASTORE_ID` |
| Backend | Chat returns text but **no gesture** | Model did not follow output format | Router defaults to `idle`; check system prompt in `services/gemini.py` |
| Backend | Env admin has **no conversations** | By design | Env admin has `id: null`; conversations exist in DB but `/conversations/` returns `[]` |

### Debug Commands

```bash
# Backend health check
curl http://localhost:8000/health

# Test login (saves cookie to file)
curl -c cookies.txt -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'

# Test authenticated endpoint
curl -b cookies.txt http://localhost:8000/auth/me

# View Docker logs (development)
docker compose -f docker-compose.dev.yml logs backend -f
docker compose -f docker-compose.dev.yml logs frontend -f

# Interactive API docs
open http://localhost:8000/docs
```

---

## 13. Contributing Guidelines

### Frontend Conventions

- **`"use client"`** on interactive pages and components. API routes (`src/app/api/`) are server-only — no `"use client"`.
- **BFF only** — Next.js API routes must stay thin proxies. Business logic belongs in `backend_fastapi/`, not in Next.js handlers.
- **Shared types** — define in `src/types/viseme.ts` and import from there. Do not duplicate interfaces.
- **Avatar animation** logic stays in `Avatar.tsx` inside `useFrame`. Do not split or merge `AvatarRefined.tsx` without discussion.
- **`reactStrictMode: false`** is intentional — do not enable it. React Strict Mode double-mounts components, which breaks Three.js `SkinnedMesh` materials.
- **i18n** — when adding UI strings, update both `en-US` and `zh-CN` blocks in `src/lib/locale.ts`.
- **Path alias** — use `@/` imports (maps to `src/`) rather than deep relative paths.

### Backend Conventions

- **Request/response models** are defined inline in router files — no separate `schemas/` package.
- **All settings** go in `config.py`. Also document in `.env.example`.
- **Schema changes** require a new Alembic migration (`uv run alembic revision --autogenerate -m "description"`).
- **Async SQLAlchemy** throughout — use `Depends(get_db)` for route handlers; use the `async_session()` context manager inside SSE generators (the session must outlive the stream).
- **Sync GCP SDK calls** (TTS) must be wrapped in `asyncio.run_in_executor` — do not block the async event loop.
- **SSE format** — always `data: {json}\n\n`; event objects use `{ "type": "...", "value": "..." }`.
- **Password hashing** — bcrypt via `bcrypt.hashpw` / `bcrypt.checkpw`.

### Files to Never Commit

- `.env` and `.env.local` — API keys and secrets
- `*-key.json` — GCP service account key files
- `frontend_nextjs/.env.local` — frontend secrets
- `backend_fastapi/credentials/` — GCP credential mounts
- `.venv/` — Python virtual environments
- `node_modules/` — Node.js dependencies

> **Note on diagrams:** Mermaid diagrams in this document can be rendered at [mermaid.live](https://mermaid.live) and pasted as images into Google Docs, or use the "Mermaid Diagrams" Google Docs add-on for inline rendering.
