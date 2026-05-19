# AI Concierge — Marina Square

Singapore Land Group AI Concierge — a Next.js + FastAPI app with a 3D talking avatar, powered by Gemini and Google Cloud TTS.

## Architecture

| Service | Stack | Role |
|---|---|---|
| `frontend` | Next.js 16, React 19, Three.js | UI, 3D avatar with lip-sync |
| `backend` | FastAPI, SQLAlchemy, Alembic | Auth, chat (Gemini), TTS, users, conversations |
| `cloud-sql-proxy` | GCP Cloud SQL Proxy | Connects to Cloud SQL PostgreSQL |

```
avatar_chatbot/
├── frontend_nextjs/       # Next.js app (App Router, standalone output)
├── backend_fastapi/       # FastAPI backend
├── docker-compose.yml     # Production (Cloud SQL Proxy)
├── docker-compose.dev.yml # Development (local PostgreSQL)
└── .github/workflows/     # CI/CD → GCP Compute Engine
```

## Features

- 3D avatar with real-time lip-sync (viseme pipeline) and gesture animations
- AI chat powered by Gemini 2.5 Flash via Vertex AI with RAG grounding (web + PDF datastores)
- Text-to-speech via Gemini TTS with sentence-by-sentence audio streaming
- Message queue — user messages sent while avatar is speaking are queued and processed in order
- Kiosk idle timeout — configurable session timeout with countdown warning modal
- Admin dashboard — user management, conversation history with markdown rendering, analytics
- Auth via JWT (HTTP-only cookies) with middleware route protection

## Quick Start

### Prerequisites

- Docker + Docker Compose
- GCP service account key JSON file (for Vertex AI + TTS)

### 1. Environment File

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | PostgreSQL credentials |
| `DATABASE_URL_DOCKER` | Connection string for dev (Docker internal network) |
| `DATABASE_URL_PROD` | Connection string for production (Cloud SQL Proxy) |
| `JWT_SECRET` | Run: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Admin login credentials |
| `GOOGLE_VERTEX_PROJECT` | GCP project ID |
| `GOOGLE_VERTEX_LOCATION` | GCP region (default: `us-central1`) |
| `VERTEX_AI_WEB_DATASTORE_ID` | Vertex AI Search datastore (website content) |
| `VERTEX_AI_PDF_DATASTORE_ID` | Vertex AI Search datastore (PDFs) |
| `SESSION_IDLE_TIMEOUT_MINUTES` | Kiosk idle timeout in minutes |
| `TTS_MODEL` | TTS model (default: `gemini-2.5-flash-tts`) |
| `TTS_VOICE_NAME` | TTS voice (default: `Achernar`) |
| `NEXT_PUBLIC_ORIGIN` | Frontend origin URL for CORS |

### GCP Authentication

**Development:** Uses [Application Default Credentials (ADC)](https://cloud.google.com/docs/authentication/application-default-credentials) — no key file needed.

```bash
# One-time setup: login with your GCP account
brew install google-cloud-sdk   # if not installed
gcloud auth application-default login --project=YOUR_PROJECT_ID
```

Docker Compose dev mounts `~/.config/gcloud/application_default_credentials.json` into containers automatically.

**Production:** A service account key is stored as a **base64-encoded** secret in GCP Secret Manager (`AVATAR_CHATBOT_JSON_KEY`). The CI/CD pipeline decodes it and writes `avatar-chatbot-key.json` on the VM at deploy time.
```bash
# To encode the key for Secret Manager:
base64 -i avatar-chatbot-key.json | tr -d '\n' | gcloud secrets versions add AVATAR_CHATBOT_JSON_KEY --data-file=-
```

### 2. Run

#### Development (hot reload)

```bash
docker compose -f docker-compose.dev.yml up
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| PostgreSQL | localhost:5432 |

#### Production

```bash
docker compose up --build
```

Frontend exposed on port 3000. Backend and Cloud SQL Proxy are internal only.

### 3. Local Development (without Docker)

```bash
# Backend
cd backend_fastapi
uv run uvicorn main:app --reload

# Frontend
cd frontend_nextjs
npm run dev
```

## CI/CD

Automated deployment to GCP Compute Engine via GitHub Actions (`.github/workflows/main.yml`).

**Triggers:** PR merge to `main` or manual `workflow_dispatch`.

**Flow:**
1. Checkout code + authenticate with GCP (Workload Identity Federation)
2. Tar source code (excludes `node_modules`, `.next`, `.venv`, `.git`)
3. Copy tar to VM and extract
4. Fetch secrets from GCP Secret Manager → build `.env` on VM
5. Decode base64 GCP service account key → `avatar-chatbot-key.json`
6. Docker build + start

**Secrets managed in GCP Secret Manager** — no `.env` or credentials in the repo.

## Generate Keys

```bash
# JWT secret
python -c "import secrets; print(secrets.token_hex(32))"
```
