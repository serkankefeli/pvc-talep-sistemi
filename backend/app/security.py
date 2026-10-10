from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError
from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from .config import Settings
from .models import AdminUser
from .permissions import effective_permissions, required_permission


_password_hash = PasswordHash.recommended()
_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AdminPrincipal:
    id: int
    username: str
    display_name: str
    is_superuser: bool
    token_version: int
    permissions: tuple[str, ...] = ()


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    try:
        return _password_hash.verify(password, password_hash)
    except (UnknownHashError, ValueError, TypeError):
        return False


def create_access_token(settings: Settings, user: AdminUser) -> str:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=settings.jwt_expire_minutes)
    payload: dict[str, Any] = {
        "sub": user.username,
        "uid": user.id,
        "ver": user.token_version,
        "tenant": settings.tenant_slug,
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


def build_admin_dependency(settings: Settings, engine: Engine):
    def require_admin(
        request: Request,
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
                options={
                    "require": [
                        "sub",
                        "uid",
                        "ver",
                        "tenant",
                        "type",
                        "iss",
                        "iat",
                        "exp",
                        "jti",
                    ]
                },
            )
        except jwt.PyJWTError as exc:
            raise authentication_error from exc

        if claims.get("type") != "admin" or claims.get("tenant") != settings.tenant_slug:
            raise authentication_error
        try:
            user_id = int(claims["uid"])
            token_version = int(claims["ver"])
        except (KeyError, TypeError, ValueError) as exc:
            raise authentication_error from exc
        with Session(engine) as session:
            user = session.exec(
                select(AdminUser).where(
                    AdminUser.id == user_id,
                    AdminUser.username == str(claims.get("sub", "")),
                )
            ).first()
        if user is None or not user.is_active or user.token_version != token_version:
            raise authentication_error
        permissions = effective_permissions(user)
        required = required_permission(request.method, request.url.path)
        if required is not None and not user.is_superuser and required not in permissions:
            raise HTTPException(status_code=403, detail="PERMISSION_DENIED")
        return AdminPrincipal(
            id=user.id,
            username=user.username,
            display_name=user.display_name,
            is_superuser=user.is_superuser,
            token_version=user.token_version,
            permissions=permissions,
        )

    return require_admin

