"""Authentication utilities for FastAPI endpoints with proper JWT signature verification.

This module provides FastAPI dependencies and utility functions for AWS Cognito token management
with offline signature verification. Uses PyJWT and PyJWKClient for secure, fast token validation
without network calls.

Key Functions:
    - require_login: FastAPI dependency for protected routes
    - get_current_user_id: Extract user ID from verified token
    - get_user_from_id_token: Extract user information from ID token

Reference:
https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html
"""

from typing import Dict, Any
from fastapi import Request, HTTPException

from app.utils.jwt_validator import (
    verify_access_token_local,
    verify_id_token_local,
    should_refresh_from_claims,
    get_token_expiration_time_from_claims,
)


def require_login(request: Request, validate_token: bool = True) -> Dict[str, Any]:
    """FastAPI dependency function to require user authentication with JWT verification.
    
    Checks if access_token cookie exists and optionally validates the token signature,
    expiration, issuer, and client_id claims using offline verification.
    
    Args:
        request: FastAPI Request object containing cookies
        validate_token: If True, performs full JWT signature verification.
                       If False, only checks if token exists (faster but less secure).
                       Defaults to True for security.
        
    Returns:
        Dictionary containing user token information:
        {
            "access_token": str,
            "id_token": Optional[str],
            "token_type": str,
            "refresh_token": Optional[str],
            "claims": Optional[Dict[str, Any]],  # If validation was performed
            "should_refresh": Optional[bool],  # If validation was performed
            "expires_at": Optional[datetime]  # If validation was performed
        }
        
    Raises:
        HTTPException: 401 if user is not authenticated or token is invalid
        
    Example:
        ```python
        @router.get("/protected")
        async def protected_route(user=Depends(require_login)):
            access_token = user["access_token"]
            claims = user.get("claims")  # Contains verified token claims
            return {"message": "Access granted"}
        ```
        
    Note:
        - Tokens are stored as httponly cookies for security (prevents XSS)
        - When validate_token=True, performs offline signature verification (no network call)
        - Signature verification uses JWKS caching for performance
        - Validates: signature, expiration, issuer, client_id, token_use
        - Use as FastAPI dependency: `user=Depends(require_login)`
    """
    access_token = request.cookies.get("access_token")
    id_token = request.cookies.get("id_token")
    refresh_token = request.cookies.get("refresh_token")

    if not access_token:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated. Please log in to access this resource.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result: Dict[str, Any] = {
        "access_token": access_token,
        "id_token": id_token,
        "refresh_token": refresh_token,
        "token_type": "Bearer",
    }

    if validate_token:
        # Perform full JWT signature verification
        claims = verify_access_token_local(access_token)
        result["claims"] = claims

        # Check if token should be proactively refreshed (AWS best practice: refresh at 75% of lifetime)
        result["should_refresh"] = should_refresh_from_claims(claims, refresh_threshold=0.75)
        result["expires_at"] = get_token_expiration_time_from_claims(claims)

    return result


def get_current_user_id(request: Request) -> str:
    """Extract user ID from the authenticated user's verified access token.
    
    Gets the user's unique identifier (sub claim) from the verified access token claims.
    This function internally calls require_login with validation enabled.
    
    Args:
        request: FastAPI Request object containing cookies
        
    Returns:
        User ID (sub claim from verified access token)
        
    Raises:
        HTTPException: 401 if user is not authenticated or token is invalid
        HTTPException: 500 if 'sub' claim is missing from verified token
        
    Example:
        ```python
        user_id = get_current_user_id(request)
        # Use user_id for database queries, logging, etc.
        ```
        
    Note:
        - This function uses the 'sub' claim from the access token
        - For user identity information (email, username, etc.), use get_user_from_id_token() instead
        - Automatically validates token signature and expiration
    """
    user = require_login(request, validate_token=True)
    claims = user.get("claims")
    
    if not claims:
        raise HTTPException(
            status_code=500,
            detail="Token claims not available. This should not happen with validate_token=True.",
        )
    
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(
            status_code=500,
            detail="Missing 'sub' claim in verified token. Cannot determine user ID.",
        )
    
    return sub


def get_user_from_id_token(request: Request) -> Dict[str, Any]:
    """Extract user information from verified ID token.
    
    Verifies and decodes the ID token to get user identity information.
    ID tokens contain more user claims than access tokens (email, username, groups, etc.).
    
    Args:
        request: FastAPI Request object containing cookies
        
    Returns:
        Dictionary containing verified ID token claims including:
        - Standard claims: sub, email, email_verified, iss, aud, exp, iat, auth_time
        - Cognito claims: cognito:username, cognito:groups, cognito:roles
        - Token metadata: token_use, jti, origin_jti, at_hash
        
    Raises:
        HTTPException: 401 if user is not authenticated or ID token is invalid
        HTTPException: 500 if ID token is missing
        
    Example:
        ```python
        user_info = get_user_from_id_token(request)
        email = user_info.get("email")
        username = user_info.get("cognito:username")
        groups = user_info.get("cognito:groups", [])
        ```
        
    Note:
        - Automatically validates user authentication via require_login()
        - Performs offline signature verification (no network call)
        - ID tokens contain user identity information, not just authorization
        - All claims are verified: signature, expiration, issuer, audience
    """
    # First ensure user is authenticated (validates access token)
    require_login(request, validate_token=True)
    
    id_token = request.cookies.get("id_token")
    if not id_token:
        raise HTTPException(
            status_code=500,
            detail="ID token not found. Cannot retrieve user information.",
        )
    
    # Verify and decode ID token (offline verification)
    claims = verify_id_token_local(id_token)
    return claims
