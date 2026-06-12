# AI Concierge — Marina Square

Singapore Land Group AI Concierge — a Next.js + FastAPI app with a 3D talking avatar, powered by Gemini and Google Cloud TTS.

This is the **full-stack documentation hub**. For deep dives, see the package-level READMEs:

- [Frontend documentation](frontend_nextjs/README.md) — kiosk UI, 3D avatar, BFF proxies
- [Backend documentation](backend_fastapi/README.md) — API, Gemini, TTS, database

---

## Table of Contents

**Part I — Project**

1. [Overview](#1-overview)
2. [Monorepo Structure](#2-monorepo-structure)
3. [Full-Stack Architecture](#3-full-stack-architecture)
4. [Features](#4-features)
5. [Quick Start](#5-quick-start)
6. [Environment Variables](#6-environment-variables)
7. [GCP Authentication](#7-gcp-authentication)
8. [Docker & Infrastructure](#8-docker--infrastructure)
9. [CI/CD](#9-cicd)
10. [End-to-End Data Flows](#10-end-to-end-data-flows)

**Part II — Summaries**

11. [Frontend Summary](#11-frontend-summary)
12. [Backend Summary](#12-backend-summary)
13. [API Surface (BFF Proxy Map)](#13-api-surface-bff-proxy-map)

**Part III — Reference**

14. [Combined Troubleshooting](#14-combined-troubleshooting)
15. [Documentation Index](#15-documentation-index)

---

## 1. Overview

The Marina Square AI Concierge is a **kiosk application** where visitors log in, pick a language, and chat with a 3D avatar that speaks answers powered by Gemini and Google Cloud TTS. An admin dashboard manages users, views conversation history, and shows analytics.

The system is split into two services:

| Service | Directory | Role |
|---|---|---|
| **Frontend** | `frontend_nextjs/` | Browser UI, 3D avatar with lip-sync, BFF API proxies |
| **Backend** | `backend_fastapi/` | Auth, Gemini chat (SSE), TTS/visemes, PostgreSQL, admin API |

In production, a **Cloud SQL Proxy** sidecar connects the backend to managed PostgreSQL.

### Tech Stack at a Glance

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript 5, Three.js, Tailwind v4 |
| Backend | FastAPI, Python 3.12, SQLAlchemy async, Alembic |
| Database | PostgreSQL 16 (`asyncpg` driver) |
| AI Chat | Vertex AI Gemini (`google-genai`) |
| RAG | Vertex AI Search (optional web + PDF datastores) |
| TTS | Google Cloud Text-to-Speech (Gemini TTS model) |
| Auth | JWT in HTTP-only cookies (HS256, 7-day expiry) |
| Deployment | Docker Compose on GCP Compute Engine |

---

## 2. Monorepo Structure

```
avatar_chatbot/
├── frontend_nextjs/          # Next.js kiosk UI + BFF proxies  → see frontend README
│   ├── src/app/              # Pages, API routes, layouts
│   ├── src/components/       # Avatar, Chat, admin UI
│   └── public/avatar/        # 3D GLB models
│
├── backend_fastapi/          # FastAPI API service             → see backend README
│   ├── routers/              # HTTP endpoints
│   ├── services/             # Gemini, TTS, viseme, DB
│   ├── models/               # SQLAlchemy ORM
│   └── alembic/              # Database migrations
│
├── docker-compose.yml        # Production (Cloud SQL Proxy)
├── docker-compose.dev.yml    # Development (local PostgreSQL, hot reload)
├── .env.example              # Environment variable template
└── .github/workflows/        # CI/CD → GCP Compute Engine
```

---

## 3. Full-Stack Architecture

```mermaid
flowchart TB
  subgraph browser [Browser]
    UI["Next.js pages + 3D Avatar"]
  end
  subgraph frontend [frontend_nextjs port 3000]
    BFF["/api/* BFF proxies"]
  end
  subgraph backend [backend_fastapi port 8000]
    API["FastAPI routers"]
    DB["PostgreSQL"]
  end
  subgraph gcp [Google Cloud]
    Gemini["Vertex AI Gemini"]
    Search["Vertex AI Search"]
    TTS["Cloud TTS"]
  end
  UI --> BFF
  BFF -->|"Cookie + JSON/SSE"| API
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

### Auth Split

Authentication spans both layers:

| Layer | What it checks |
|---|---|
| **Frontend middleware** | `auth-token` cookie **exists** on protected routes (`/`, `/chat`, `/admin`) |
| **Backend dependencies** | JWT is **valid** (signature, expiry) on every API call |

Login flow: `POST /api/auth` (frontend proxy) → `POST /auth/login` (backend) → sets HTTP-only `auth-token` cookie. The frontend forwards this cookie on all subsequent `/api/*` requests.

Two login paths:

- **Env admin** (`ADMIN_USERNAME` / `ADMIN_PASSWORD`) — kiosk operator, not stored in DB
- **DB users** — bcrypt passwords, created via admin dashboard

---

## 4. Features

- **3D avatar** with real-time lip-sync (viseme pipeline) and gesture animations
- **AI chat** powered by Gemini via Vertex AI with optional RAG grounding (web + PDF datastores)
- **Text-to-speech** via Gemini TTS with sentence-by-sentence audio streaming
- **Bilingual UI** — English (`en-US`) and Simplified Chinese (`zh-CN`)
- **Push-to-talk** — Web Speech API for voice input
- **Message queue** — typed messages queued while avatar speaks; voice interrupts
- **Kiosk idle timeout** — configurable session timeout with countdown warning modal
- **Indoor wayfinder QR** — triggered when Gemini appends `[SHOW_QR]` for in-mall directions
- **Admin dashboard** — user management, conversation history, analytics
- **Auth** via JWT (HTTP-only cookies) with middleware route protection

---

## 5. Quick Start

### Prerequisites

- Docker + Docker Compose
- GCP project with Vertex AI and Cloud TTS enabled
- **Development:** `gcloud auth application-default login` (no key file needed)
- **Production:** GCP service account key JSON (managed via Secret Manager)

### 1. Environment File

```bash
cp .env.example .env
# Edit .env — see Section 6 for all variables
```

For Docker dev, also add:

```
DATABASE_URL_DOCKER=postgresql+asyncpg://avatar:change-me@postgres:5432/avatar_chatbot
```

Generate a JWT secret:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### 2. Run (recommended — Docker dev)

```bash
docker compose -f docker-compose.dev.yml up
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Backend API docs | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 |

Hot reload is enabled for both frontend and backend.

### 3. Run (production)

```bash
docker compose up --build
```

Frontend exposed on port 3000. Backend and Cloud SQL Proxy are internal only.

### 4. Local Development (without Docker)

Requires a running PostgreSQL instance and configured `.env`.

```bash
# Backend
cd backend_fastapi
uv sync
uv run alembic upgrade head
uv run uvicorn main:app --reload    # http://localhost:8000

# Frontend (separate terminal)
cd frontend_nextjs
npm install
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000 npm run dev   # http://localhost:3000
```

See [frontend README](frontend_nextjs/README.md#2-quick-start) and [backend README](backend_fastapi/README.md#2-quick-start) for package-specific details.

---

## 6. Environment Variables

All services read from repo-root `.env`. Docker Compose `environment:` overrides take precedence.

| Variable | Consumed by | Required | Description |
|---|---|---|---|
| `POSTGRES_USER` | Docker (postgres service) | Dev | PostgreSQL username |
| `POSTGRES_PASSWORD` | Docker (postgres service) | Dev | PostgreSQL password |
| `POSTGRES_DB` | Docker (postgres service) | Dev | PostgreSQL database name |
| `DATABASE_URL` | Backend | Yes (local uv) | `postgresql+asyncpg://...@localhost:5432/...` |
| `DATABASE_URL_DOCKER` | Docker Compose dev | Dev Docker | Same URL with hostname `postgres` |
| `DATABASE_URL_PROD` | Docker Compose prod | Prod | Cloud SQL Proxy connection string |
| `JWT_SECRET` | Backend | Yes | JWT signing key |
| `ADMIN_USERNAME` | Backend | Yes | Kiosk/admin login username |
| `ADMIN_PASSWORD` | Backend | Yes | Kiosk/admin login password |
| `GOOGLE_VERTEX_PROJECT` | Backend | For chat/TTS | GCP project ID |
| `GOOGLE_VERTEX_LOCATION` | Backend | No | Vertex AI region (default `us-central1`) |
| `GEMINI_CHAT_MODEL` | Backend | No | Chat model (default `gemini-2.5-flash`) |
| `VERTEX_AI_WEB_DATASTORE_ID` | Backend | No | RAG — website datastore |
| `VERTEX_AI_PDF_DATASTORE_ID` | Backend | No | RAG — PDF datastore |
| `TTS_MODEL` | Backend | No | TTS model (default `gemini-2.5-flash-tts`) |
| `TTS_VOICE_NAME` | Backend | No | TTS voice (default `Achernar`) |
| `TTS_VOICE_PROMPT` | Backend | No | TTS style instruction |
| `SESSION_IDLE_TIMEOUT_MINUTES` | Backend | No | Kiosk idle timeout (default `4`) |
| `NEXT_PUBLIC_ORIGIN` | Backend (CORS) | No | Frontend origin URL (default `http://localhost:3000`) |
| `NEXT_PUBLIC_BACKEND_URL` | Frontend | No | FastAPI proxy target (default `http://backend:8000` in Docker) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Backend, GCP SDK | No | Path to GCP key file (set by Docker Compose) |

Template: [`.env.example`](.env.example)

---

## 7. GCP Authentication

### Development — Application Default Credentials (ADC)

No key file needed. One-time setup:

```bash
brew install google-cloud-sdk   # if not installed
gcloud auth application-default login --project=YOUR_PROJECT_ID
```

Docker Compose dev mounts the ADC file automatically:

```
~/.config/gcloud/application_default_credentials.json
  → /app/credentials/application_default_credentials.json
```

Set in compose: `GOOGLE_APPLICATION_CREDENTIALS=/app/credentials/application_default_credentials.json`

### Production — Service Account Key

A service account JSON key is stored as a **base64-encoded** secret in GCP Secret Manager (`AVATAR_CHATBOT_JSON_KEY`). The CI/CD pipeline decodes it to `avatar-chatbot-key.json` on the VM.

```bash
# Encode key for Secret Manager:
base64 -i avatar-chatbot-key.json | tr -d '\n' | gcloud secrets versions add AVATAR_CHATBOT_JSON_KEY --data-file=-
```

Docker Compose prod mounts:

```
./avatar-chatbot-key.json → /app/credentials/gcp-key.json
```

### Required IAM Roles

| Role | Purpose |
|---|---|
| `roles/aiplatform.user` | Vertex AI Gemini chat |
| `roles/discoveryengine.viewer` | Vertex AI Search RAG grounding |

---

## 8. Docker & Infrastructure

### Development (`docker-compose.dev.yml`)

| Service | Image / Build | Port | Notes |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | `5432:5432` | Local DB, named volume |
| `backend` | `backend_fastapi/Dockerfile.dev` | `8000:8000` | `--reload`, source bind-mounted |
| `frontend` | `frontend_nextjs/Dockerfile.dev` | `3000:3000` | `npm run dev`, source bind-mounted |

- Backend runs `alembic upgrade head` then `uvicorn --reload` on start
- GCP creds: ADC mount (see Section 7)
- `DATABASE_URL` overridden to `DATABASE_URL_DOCKER`

### Production (`docker-compose.yml`)

| Service | Image / Build | Port | Notes |
|---|---|---|---|
| `cloud-sql-proxy` | `gcr.io/cloud-sql-connectors/cloud-sql-proxy:2` | host `5432` | Connects to Cloud SQL |
| `backend` | `backend_fastapi/Dockerfile` | internal `8000` | Migrations on start, no reload |
| `frontend` | `frontend_nextjs/Dockerfile` | `3000:3000` | Standalone Next.js build |

- Backend runs `alembic upgrade head` then `uvicorn` on start
- GCP creds: `avatar-chatbot-key.json` mount (see Section 7)
- `DATABASE_URL` overridden to `DATABASE_URL_PROD`

### Dockerfile Summary

| | Frontend | Backend |
|---|---|---|
| **Dev** | `node:20-alpine`, `npm ci`, `npm run dev` | `python:3.12-slim`, `uv sync`, `uvicorn --reload` |
| **Prod** | Multi-stage, `output: standalone`, `node server.js` | `uv sync --no-dev`, `alembic upgrade head && uvicorn` |

---

## 9. CI/CD

Automated deployment to GCP Compute Engine via [`.github/workflows/main.yml`](.github/workflows/main.yml).

**Triggers:** PR merge to `main` or manual `workflow_dispatch`.

**Target:** GCP Compute Engine VM at `/opt/aiconcierge` (environment: `Singaporelandgroup-prod`).

**Flow:**

1. Checkout code + authenticate with GCP (Workload Identity Federation)
2. SSH via IAP to VM; ensure Docker + compose v2
3. `docker compose down`; clean old `.git`, `.env`, credentials
4. Tar source (excludes `node_modules`, `.next`, `.venv`, `.git`) → SCP → extract
5. Build `.env` on VM from **GCP Secret Manager** secrets (see table below)
6. Decode `AVATAR_CHATBOT_JSON_KEY` → `avatar-chatbot-key.json`
7. `docker compose build --no-cache && docker compose up -d`
8. `docker image prune -f`

### Secret Manager Keys

| Secret | Purpose |
|---|---|
| `POSTGRES_PASSWORD` | Database password |
| `DATABASE_URL_PROD` | Cloud SQL connection string |
| `JWT_SECRET` | JWT signing key |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Admin login |
| `GOOGLE_VERTEX_PROJECT` / `GOOGLE_VERTEX_LOCATION` | Vertex AI |
| `VERTEX_AI_WEB_DATASTORE_ID` / `VERTEX_AI_PDF_DATASTORE_ID` | RAG datastores |
| `GEMINI_CHAT_MODEL` | Chat model |
| `TTS_MODEL` / `TTS_VOICE_NAME` | TTS config |
| `SESSION_IDLE_TIMEOUT_MINUTES` | Kiosk idle timeout |
| `NEXT_PUBLIC_ORIGIN` | CORS origin |
| `AVATAR_CHATBOT_JSON_KEY` | Base64-encoded GCP service account key |

No `.env` or credentials are committed to the repo.

---

## 10. End-to-End Data Flows

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

### Message Path (chat + TTS + lip-sync)

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

## 11. Frontend Summary

The frontend (`frontend_nextjs/`) is a **kiosk UI + BFF proxy layer**. It does not call Gemini or TTS directly — all `/api/*` routes forward requests to FastAPI.

| Area | Details |
|---|---|
| **Pages** | `/` lobby, `/chat` in-call, `/login`, `/admin/*` dashboard |
| **BFF pattern** | `src/app/api/*/route.ts` proxies to `NEXT_PUBLIC_BACKEND_URL` with cookie forwarding |
| **Avatar** | Three.js + `@react-three/fiber`, lip-sync via ARKit morph targets, 6 gestures |
| **Chat** | SSE consumer, TTS sentence queue, Web Speech API push-to-talk |
| **i18n** | `en-US` / `zh-CN` via `src/lib/locale.ts` |
| **Idle timeout** | Two-stage warning modal, config from `/api/config` |

Key files: `Avatar.tsx`, `Chat.tsx`, `chat/page.tsx`, `middleware.ts`

> **Full documentation:** [frontend_nextjs/README.md](frontend_nextjs/README.md) — architecture, user journeys, features, folder structure, API proxies, troubleshooting.

---

## 12. Backend Summary

The backend (`backend_fastapi/`) is the **API and business-logic layer**. It owns all Gemini, TTS, auth, and database operations.

| Area | Details |
|---|---|
| **Routers** | `/auth`, `/chat` (SSE), `/tts`, `/users`, `/conversations`, `/analytics`, `/config` |
| **Services** | `gemini.py` (Vertex AI streaming + RAG), `tts_service.py`, `viseme.py` |
| **Database** | PostgreSQL — `users`, `conversations`, `messages` tables |
| **Auth** | JWT cookie, env admin + DB users, bcrypt passwords |
| **Chat SSE** | Events: `conversation_id`, `gesture`, `chunk`, `show_qr`, `done`, `error` |
| **Migrations** | Alembic — auto-runs `upgrade head` on container start |

Key files: `routers/chat.py`, `services/gemini.py`, `auth/dependencies.py`, `config.py`

Interactive API docs: http://localhost:8000/docs

> **Full documentation:** [backend_fastapi/README.md](backend_fastapi/README.md) — architecture, API endpoints, database schema, features, troubleshooting.

---

## 13. API Surface (BFF Proxy Map)

The frontend BFF proxies map to these backend endpoints. All admin routes forward the `Cookie` header for JWT auth.

### Auth

| Next.js route | Method | Backend endpoint | Notes |
|---|---|---|---|
| `/api/auth` | POST | `/auth/login` | Forwards `Set-Cookie` |
| `/api/auth/me` | GET | `/auth/me` | Returns `{ username, is_admin }` |
| `/api/auth/logout` | POST | `/auth/logout` | Clears cookie |

### Kiosk

| Next.js route | Method | Backend endpoint | Notes |
|---|---|---|---|
| `/api/chat` | POST | `/chat` | SSE stream passthrough |
| `/api/tts` | POST | `/tts` | Returns `{ audioBase64, mimeType, visemes }` |
| `/api/config` | GET | `/config` | Idle timeout; fallback if backend unreachable |

### Admin

| Next.js route | Method | Backend endpoint |
|---|---|---|
| `/api/admin/users` | GET | `/users/?page=&page_size=` |
| `/api/admin/users` | POST | `/users/` |
| `/api/admin/users/[id]` | DELETE | `/users/{id}` |
| `/api/admin/users/[id]/reset-password` | POST | `/users/{id}/reset-password` |
| `/api/admin/analytics` | GET | `/analytics?page=&page_size=` |
| `/api/admin/conversations/[id]` | GET | `/conversations/{id}` |

### Backend-only

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | Health check |
| GET | `/conversations/` | Cookie | List own conversations |
| POST | `/conversations/` | Cookie | Create conversation |
| DELETE | `/conversations/{id}` | Cookie | Delete conversation |

---

## 14. Combined Troubleshooting

| Layer | Symptom | Likely cause | Fix |
|---|---|---|---|
| Full-stack | Chat returns **502** | Backend not running or wrong URL | Start FastAPI; set `NEXT_PUBLIC_BACKEND_URL=http://localhost:8000` |
| Full-stack | **CORS errors** | Origin mismatch | Set `NEXT_PUBLIC_ORIGIN` to match frontend URL |
| Full-stack | Nothing works after deploy | Missing Secret Manager secrets | Check CI/CD logs; verify `.env` on VM |
| Frontend | Redirected from **/chat to /** | Missing kiosk gate or no auth cookie | Start chat from lobby; log in first |
| Frontend | **Lip-sync not moving** | GLB missing morph targets | Check browser console for Avatar morph target log |
| Frontend | **Mic not working** | Browser permissions | `getUserMedia` requires HTTPS or `localhost` |
| Frontend | **Idle timeout too short** | Backend `/config` unreachable | Proxy falls back to 1 minute; ensure backend is running |
| Frontend | Admin pages show **401** | Not logged in as admin | Use `ADMIN_USERNAME` / `ADMIN_PASSWORD` |
| Backend | **401** on API routes | Missing/expired cookie | Re-login via `POST /auth/login` |
| Backend | **403** on admin routes | User is not admin | Use env admin credentials |
| Backend | Chat stream **errors** | Vertex AI creds misconfigured | Check `GOOGLE_VERTEX_PROJECT`; verify ADC or key mount |
| Backend | **TTS fails** (500) | Cloud TTS permissions | Verify service account roles; check backend logs |
| Backend | **DB connection refused** | Wrong `DATABASE_URL` | Dev Docker: use hostname `postgres`, not `localhost` |
| Backend | **Alembic fails** on start | DB not ready | Dev: wait for postgres healthcheck |
| Backend | **RAG not grounding** | Empty datastore IDs | Set `VERTEX_AI_*_DATASTORE_ID` env vars |

### Debug Commands

```bash
# Backend health
curl http://localhost:8000/health

# Test login (save cookie)
curl -c cookies.txt -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'

# View Docker logs
docker compose -f docker-compose.dev.yml logs backend -f
docker compose -f docker-compose.dev.yml logs frontend -f
```

For layer-specific troubleshooting, see:

- [Frontend troubleshooting](frontend_nextjs/README.md#11-troubleshooting)
- [Backend troubleshooting](backend_fastapi/README.md#11-troubleshooting)

---

## 15. Documentation Index

| Document | Scope | When to read |
|---|---|---|
| **This file** (`README.md`) | Full-stack hub — setup, architecture, infra, flows | **Start here** — onboarding and shared concerns |
| [Frontend README](frontend_nextjs/README.md) | Everything in `frontend_nextjs/` | Working on UI, avatar, chat, BFF proxies |
| [Backend README](backend_fastapi/README.md) | Everything in `backend_fastapi/` | Working on API, Gemini, TTS, database |
| [`.env.example`](.env.example) | Environment variable template | Setting up local or Docker environment |

**Recommended reading order for new developers:**

1. This README — Sections 1–10 (overview, setup, architecture)
2. [Frontend README](frontend_nextjs/README.md) — if working on UI/avatar
3. [Backend README](backend_fastapi/README.md) — if working on API/services
