FROM python:3.12-slim

WORKDIR /app

RUN pip install uv --no-cache-dir

COPY pyproject.toml uv.lock ./

RUN uv sync --frozen --no-dev

# Headless Chromium for browse_web (Qwen-VL + Playwright browser automation).
# libatomic1 is needed before the Playwright CLI itself can start on slim images.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libatomic1 \
    && rm -rf /var/lib/apt/lists/*
RUN uv run playwright install --with-deps chromium

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn main:app --host 0.0.0.0 --port 8000"]
