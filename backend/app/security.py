from __future__ import annotations

import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash

from .config import Settings


_password_hash = PasswordHash.recommended()
_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AdminPrincipal:
    username: str


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_admin_credentials(
    username: str,
    password: str,
    settings: Settings,
) -> bool:
    if not settings.admin_password_hash:
        return False

    username_matches = hmac.compare_digest(username, settings.admin_username)
    try:
        password_matches = _password_hash.verify(password, settings.admin_password_hash)
    except (ValueError, TypeError):
        password_matches = False
    return username_matches and password_matches


def create_access_token(settings: Settings) -> str:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=settings.jwt_expire_minutes)
    payload: dict[str, Any] = {
        "sub": settings.admin_username,
        "type": "admin",
        "iss": settings.jwt_issuer,
        "iat": now,
        "exp": expires_at,
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(
        payload,
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def build_admin_dependency(settings: Settings):
    def require_admin(
        credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    ) -> AdminPrincipal:
        authentication_error = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Valid administrator authentication is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
        if credentials is None or credentials.scheme.lower() != "bearer":
            raise authentication_error

        try:
            claims = jwt.decode(
                credentials.credentials,
                settings.jwt_secret,
                algorithms=[settings.jwt_algorithm],
                issuer=settings.jwt_issuer,
                options={"require": ["sub", "type", "iss", "iat", "exp", "jti"]},
            )
        except jwt.PyJWTError as exc:
            raise authentication_error from exc

        if claims.get("type") != "admin" or not hmac.compare_digest(
            str(claims.get("sub", "")),
            settings.admin_username,
        ):
            raise authentication_error
        return AdminPrincipal(username=settings.admin_username)

    return require_admin

