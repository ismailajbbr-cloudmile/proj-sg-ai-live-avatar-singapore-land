from pydantic import BaseModel, EmailStr, Field, SecretStr

class LoginRequest(BaseModel):
    email: EmailStr = Field(..., description="User's email address")
    password: SecretStr = Field(..., description="User's password")

class LoginResponse(BaseModel):
    access_token: str = Field(..., description="Access token")
    refresh_token: str = Field(..., description="Refresh token")

class LogoutRequest(BaseModel):
    access_token: str = Field(..., description="Access token")

class LogoutResponse(BaseModel):
    message: str = Field(..., description="Logout message")