from app.schemas.auth import LoginRequest, LoginResponse, LogoutRequest, LogoutResponse
from pydantic import EmailStr, SecretStr

class AuthService:
    def __init__(self):
        pass

    def login(self, email: EmailStr, password: SecretStr) -> LoginResponse:
        pass

    def logout(self, access_token: str) -> LogoutResponse:
        pass