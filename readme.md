# Quickstart

## Prerequisites

- Docker + Docker Compose
- GCP service account key JSON file (for Vertex AI + TTS)
---

## 1. Environment File

A single `.env` at the repo root is used by all services (backend, frontend, postgres).

```bash
cp .env.example .env
```

Fill in:
| Variable | Description |
|---|---|
| `POSTGRES_PASSWORD` | Any secure password |
| `JWT_SECRET` | Run: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Admin login credentials |
| `GOOGLE_VERTEX_PROJECT` | GCP project ID |
| `VERTEX_AI_WEB_DATASTORE_ID` | Vertex AI Search datastore (website content) |
| `VERTEX_AI_PDF_DATASTORE_ID` | Vertex AI Search datastore (PDFs) |

### GCP Key File
Place your service account JSON at the repo root:
```
avatar_chatbot/
└── avatar-chatbot-key.json   ← here (gitignored)
```
Both backend and frontend containers mount it at `/app/credentials/gcp-key.json` automatically.

---

## 2. Run

### Development (hot reload)
Code changes in `backend_fastapi/` and `frontend_nextjs/src/` apply instantly — no rebuild needed.

```bash
docker compose -f docker-compose.dev.yml up
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| PostgreSQL | localhost:5432 |

> `POSTGRES_PASSWORD` defaults to `devpassword` if not set in `.env`.

### Production
```bash
docker compose up --build
```

Frontend is exposed on port 3000. Backend and PostgreSQL are internal only (not port-mapped).

---

## 3. Services at a Glance

| Service | Image / Build | Role |
|---|---|---|
| `postgres` | `postgres:16-alpine` | Database |
| `backend` | `./backend_fastapi` | FastAPI: auth, chat, TTS, users |
| `frontend` | `./frontend_nextjs` | Next.js UI + 3D avatar |

Backend waits for postgres health check before starting. Frontend waits for backend.

---

## 4. Local Development (without Docker)

```bash
# Backend
cd backend_fastapi
uv run uvicorn app.main:app --reload

# Frontend
cd frontend_nextjs
npm run dev        # http://localhost:3000
```

Set `GOOGLE_APPLICATION_CREDENTIALS` to an absolute path to the GCP key file in `.env`.

---

## Generate Keys

```bash
# JWT secret
python -c "import secrets; print(secrets.token_hex(32))"

# Fernet encryption key (if needed)
cd backend_fastapi && uv run python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```
