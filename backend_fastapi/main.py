import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routers import auth, chat, conversations, tts, users, config_router, analytics

# Configure app-level logging so services.vertex_search / services.gemini logs are visible
logging.basicConfig(
    level=logging.INFO,
    format="[%(name)s] %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Schema is managed by Alembic — run via CMD in Dockerfile before uvicorn starts
    yield


app = FastAPI(title="Avatar Chatbot API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.next_public_origin],
    allow_credentials=True,  # Required for cookie forwarding
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


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok"}
