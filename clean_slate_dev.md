# Clean Slate Development Quickstart

This guide is for setting up a **brand new project from scratch**. If you're working with an existing repository, see [quickstart.md](quickstart.md) instead.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Python 3.11+** with `uv` package manager
- **Node.js 18+** and `npm`
- **Docker** and **Docker Compose** (for PostgreSQL database)
- **Git**

## Initial Project Setup

### 1. Initialize Git Repository

```bash
# Initialize Git
git init
git remote add origin https://github.com/chenglongwu0510/ai-application-template.git

# Create project folders
mkdir frontend_nextjs backend_fastapi
```

### 2. Frontend Setup

```bash
cd frontend_nextjs

# Create Next.js app with TypeScript and Tailwind
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"

# Initialize shadcn/ui
npx shadcn init

# Add login component
npx shadcn@latest add login-02

# Install dependencies
npm install

# Serve
npm run dev
```

```bash
npm i zod zustand
npm i ws
npm i react-use

# Redner 3D avatar
npm i three @react-three/fiber @react-three/drei
npm install @react-three/fiber @react-three/drei three
```

### 3. Backend Setup

```bash
cd ../backend_fastapi

# Initialize uv project
uv init

# Create virtual environment
uv venv

# Install basic dependencies
uv add fastapi uvicorn

# Create app directory
mkdir -p app

# Create basic main.py
cat > app/main.py << 'EOF'
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def read_root():
    return {"message": "Hello, FastAPI!"}
EOF
```

### 4. Install Backend Dependencies

Install all required web application framework libraries:

```bash
cd backend_fastapi

uv add python-dotenv structlog sqlmodel sqlalchemy "python-jose[cryptography]" \
    bcrypt cryptography pydantic email-validator prometheus-fastapi-instrumentator \
    slowapi "psycopg[binary]" requests google-auth langchain-core langchain-google-genai \
    langchain langgraph langfuse pandas langchain-mcp-adapters google-cloud-bigquery \
    boto3 snowflake-connector-python langgraph-checkpoint-postgres tabulate \
    google-api-python-client google-auth-oauthlib google-auth-httplib2
```

**Note:** This installs all dependencies needed for:

- Web framework (FastAPI, SQLModel, SQLAlchemy)
- Authentication (JWT, OAuth, bcrypt)
- AI/LLM integration (LangChain, LangGraph, Langfuse)
- Database connectors (PostgreSQL, BigQuery, Snowflake, Athena)
- Monitoring and observability (Prometheus, Langfuse)

### 5. Database Setup

```bash
# Start PostgreSQL database
docker compose up -d postgres

# Wait for database to be ready, then create initial migration
mkdir -p alembic/versions
uv run alembic revision --autogenerate -m "Initial migration"

# Apply migrations
uv run alembic upgrade head
```

### 6. Start the Application

```bash
# Start the FastAPI application
uv run uvicorn app.main:app --reload
```

**Backend Access:**

- API: <http://127.0.0.1:8000>
- API Documentation: <http://127.0.0.1:8000/docs>

---

## Testing with Postman

### Setup Postman for OAuth Testing

1. **Download OpenAPI Specification:**
   - Go to <http://127.0.0.1:8000/docs>
   - Click "Download" > "openapi.json"
   - Import into Postman

2. **Auto-capture Cookies:**
   - In Postman, go to the Login API
   - Add this script in the **Tests** tab:

     ```javascript
     const json = pm.response.json();
     pm.environment.set("bearerToken", json.access_token);
     ```

   - This automatically saves the token for authenticated requests