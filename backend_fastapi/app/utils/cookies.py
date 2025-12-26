"""Cookie management utilities for authentication.

This module provides utilities for setting and deleting authentication cookies
on FastAPI responses. These are HTTP-specific utilities that work with FastAPI
response objects.
"""

from fastapi.responses import JSONResponse, RedirectResponse

from app.core.config import settings


def set_auth_cookies(
    response: JSONResponse | RedirectResponse,
    access_token: str,
    id_token: str,
    expires_in: int = 3600,
    refresh_token: str | None = None
) -> JSONResponse | RedirectResponse:
    """Set authentication cookies on response.
    
    Sets HttpOnly cookies for access_token, id_token, and optionally refresh_token.
    Uses secure cookie settings from configuration.
    
    Args:
        response: Response object to set cookies on
        access_token: Access token value
        id_token: ID token value
        expires_in: Token expiration time in seconds (default: 3600)
        refresh_token: Optional refresh token value
        
    Returns:
        Response object with cookies set
        
    Example:
        ```python
        response = JSONResponse(content={"message": "Success"})
        response = set_auth_cookies(
            response,
            access_token="...",
            id_token="...",
            expires_in=3600,
            refresh_token="..."
        )
        ```
    """
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=expires_in,
        **settings.COOKIE_SETTINGS
    )
    response.set_cookie(
        key="id_token",
        value=id_token,
        max_age=expires_in,
        **settings.COOKIE_SETTINGS
    )
    
    if refresh_token:
        response.set_cookie(
            key="refresh_token",
            value=refresh_token,
            max_age=settings.REFRESH_TOKEN_MAX_AGE,
            **settings.COOKIE_SETTINGS
        )
    
    return response


def delete_auth_cookies(response: JSONResponse | RedirectResponse) -> JSONResponse | RedirectResponse:
    """Delete authentication cookies from response.
    
    Removes all authentication cookies (access_token, id_token, refresh_token)
    from the response using the same cookie settings as when they were set.
    
    Args:
        response: Response object to delete cookies from
        
    Returns:
        Response object with cookies deleted
        
    Example:
        ```python
        response = JSONResponse(content={"message": "Logged out"})
        response = delete_auth_cookies(response)
        ```
    """
    response.delete_cookie("access_token", **settings.COOKIE_SETTINGS)
    response.delete_cookie("id_token", **settings.COOKIE_SETTINGS)
    response.delete_cookie("refresh_token", **settings.COOKIE_SETTINGS)
    return response

