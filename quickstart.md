
# Project Initialization

## Backend Setup
```bash
mkdir backend_fastapi

cd backend_fastapi

mkdir app/ app/api app/api/v1 app/api/v1/admin app/core app/models app/schemas app/services app/utils app/tests

uv init

uv add fastapi python-dotenv slowapi uvicorn structlog itsdangerous 

uv run uvicorn app.main:app --reload

```


## Frontend Setup
```bash
mkdir frontend_nextjs

cd frontend_nextjs

npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"

npx shadcn init

npm install

npm install @react-three/fiber @react-three/drei three

npm run dev
```

# Key Generation

```bash
# Generate JWT secret key
cd backend_fastapi && uv run python3 -c "import secrets; print(secrets.token_urlsafe(64))"

# Generate Fernet encryption key (for database credentials)
cd backend_fastapi && uv run python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```