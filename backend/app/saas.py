"""Host-routed SaaS with a dedicated database and upload directory per company."""
from __future__ import annotations

import hashlib
import hmac
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse
from uuid import UUID

import anyio
from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlmodel import Session
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse

from .company import utc
from .config import Settings
from .db import create_db_and_tables, create_db_engine
from .models import CompanyAccount, utc_now
from .middleware import SecurityHeadersMiddleware


logger = logging.getLogger(__name__)
PLANS = {
    "legacy": (None, None),
    "trial": (2, 50),
    "starter": (3, 250),
    "pro": (10, 2000),
    "enterprise": (None, None),
}


def database_identity(value: str) -> tuple:
    url = make_url(value)
    if url.get_backend_name() == "sqlite":
        if not url.database or url.database == ":memory:" or url.query:
            raise ValueError("Tenant SQLite databases must be persistent files")
        return ("sqlite", str(Path(url.database).resolve()).casefold())
    if url.get_backend_name() == "postgresql":
        if not url.database or not url.host:
            raise ValueError("Tenant PostgreSQL database and host are required")
        return ("postgresql", url.host.casefold(), url.port or 5432, url.database)
    raise ValueError("Only PostgreSQL and persistent SQLite tenant databases are supported")


class TenantDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slug: str = Field(pattern=r"^[a-z][a-z0-9-]{1,62}$")
    # Immutable provisioning identity prevents old tokens surviving slug reuse.
    auth_id: UUID
    name: str = Field(min_length=2, max_length=120)
    public_url: str
    database_url: str = Field(repr=False)
    admin_username: str = Field(default="admin", min_length=3, max_length=64)
    admin_password_hash: str = Field(repr=False)
    plan: Literal["legacy", "trial", "starter", "pro", "enterprise"] = "trial"
    status: Literal["active", "suspended"] = "active"
    trial_ends_at: datetime | None = None
    subscription_starts_at: datetime | None = None
    subscription_ends_at: datetime | None = None
    subscription_email: EmailStr | None = None
    # Only needed when adopting an existing logo directory. New tenants use slug paths.
    branding_upload_dir: str | None = None
    smtp_host: str = ""
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str = ""
    smtp_password: str = Field(default="", repr=False)
    smtp_from_email: str = ""
    smtp_admin_email: str = ""
    smtp_starttls: bool = True

    @field_validator("public_url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        if any(char.isspace() or ord(char) < 32 for char in value):
            raise ValueError("Public URL cannot contain whitespace or control characters")
        parsed = urlparse(value.rstrip("/"))
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username or parsed.password
            or parsed.path or parsed.query or parsed.fragment
        ):
            raise ValueError("Public URL must be an exact HTTP(S) origin")
        # Avoid wildcard, path or header ambiguities in the host allowlist.
        if "*" in parsed.netloc or not parsed.hostname.isascii():
            raise ValueError("Use an exact ASCII hostname")
        if parsed.port is not None and not 1 <= parsed.port <= 65535:
            raise ValueError("Invalid public URL port")
        return value.rstrip("/").lower()

    @field_validator("database_url")
    @classmethod
    def validate_database(cls, value: str) -> str:
        database_identity(value)
        return value

    @field_validator("admin_password_hash")
    @classmethod
    def validate_hash(cls, value: str) -> str:
        if not value.startswith("$argon2id$"):
            raise ValueError("Bootstrap password must be an Argon2id hash")
        return value

    @model_validator(mode="after")
    def require_trial_end(self):
        if self.plan == "trial" and self.trial_ends_at is None:
            raise ValueError("Trial accounts require an expiry date")
        if (self.subscription_starts_at is None) != (self.subscription_ends_at is None):
            raise ValueError("Subscription requires both start and end dates")
        if self.subscription_ends_at and utc(self.subscription_ends_at) <= utc(self.subscription_starts_at):
            raise ValueError("Subscription end must follow start")
        return self

    @property
    def host(self) -> str:
        parsed = urlparse(self.public_url)
        return parsed.netloc.lower()


class TenantManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal[1] = 1
    tenants: list[TenantDefinition] = Field(min_length=1)

    @model_validator(mode="after")
    def reject_shared_resources(self):
        for values in (
            [tenant.slug for tenant in self.tenants],
            [tenant.host for tenant in self.tenants],
            [database_identity(tenant.database_url) for tenant in self.tenants],
        ):
            if len(set(values)) != len(values):
                raise ValueError("Company slugs, hosts and databases must be unique")
        return self


def upload_directory(settings: Settings, tenant: TenantDefinition) -> str:
    root = Path(settings.saas_upload_root).resolve()
    return str(Path(tenant.branding_upload_dir).resolve()) if tenant.branding_upload_dir else str((root / tenant.slug).resolve())


def load_manifest(settings: Settings) -> TenantManifest:
    manifest = TenantManifest.model_validate_json(Path(settings.saas_manifest_path).read_text(encoding="utf-8"))
    if len(manifest.tenants) > settings.saas_max_tenants:
        raise ValueError("Registered company count exceeds this server's tenant limit")
    directories = [upload_directory(settings, tenant) for tenant in manifest.tenants]
    for left in directories:
        for right in directories:
            if left != right and (Path(left) in Path(right).parents or Path(right) in Path(left).parents):
                raise ValueError("Company upload directories cannot overlap")
    if len(set(directories)) != len(directories):
        raise ValueError("Company upload directories must be unique")
    if settings.environment == "production":
        for tenant in manifest.tenants:
            if not tenant.public_url.startswith("https://"):
                raise ValueError("Production company URLs require HTTPS")
            if make_url(tenant.database_url).get_backend_name() != "postgresql":
                raise ValueError("Production companies require PostgreSQL")
    return manifest


def tenant_settings(settings: Settings, tenant: TenantDefinition) -> Settings:
    values = settings.model_dump()
    values.update(
        saas_enabled=False,
        tenant_saas=True,
        tenant_slug=tenant.slug,
        tenant_name=tenant.name,
        database_url=tenant.database_url,
        cors_origins=tenant.public_url,
        admin_panel_base_url=f"{tenant.public_url}/admin",
        branding_upload_dir=upload_directory(settings, tenant),
        admin_username=tenant.admin_username,
        admin_password_hash=tenant.admin_password_hash,
        jwt_secret=hmac.new(settings.jwt_secret.encode(), f"tenant:{tenant.slug}:{tenant.auth_id}".encode(), hashlib.sha256).hexdigest(),
        jwt_issuer=f"{settings.jwt_issuer}:{tenant.slug}",
        smtp_host=tenant.smtp_host,
        smtp_port=tenant.smtp_port,
        smtp_username=tenant.smtp_username,
        smtp_password=tenant.smtp_password,
        smtp_from_email=tenant.smtp_from_email,
        smtp_admin_email=tenant.smtp_admin_email,
        smtp_starttls=tenant.smtp_starttls,
    )
    return Settings.model_validate(values)


def initialize_tenant(settings: Settings, tenant: TenantDefinition):
    from .main import create_app

    resolved = tenant_settings(settings, tenant)
    engine = create_db_engine(resolved.database_url)
    guard = None
    try:
        if engine.dialect.name == "postgresql":
            # Serialize migrations/bootstrap across workers in this tenant DB.
            guard = engine.connect().execution_options(isolation_level="AUTOCOMMIT")
            guard.execute(text("SELECT pg_advisory_lock(524155)"))
        create_db_and_tables(engine, settings=resolved)
        seat_limit, request_limit = PLANS[tenant.plan]
        with Session(engine) as session:
            account = session.get(CompanyAccount, 1)
            account.name = tenant.name
            account.plan = tenant.plan
            account.status = tenant.status
            account.trial_ends_at = tenant.trial_ends_at
            account.subscription_starts_at = tenant.subscription_starts_at
            account.subscription_ends_at = tenant.subscription_ends_at
            account.subscription_email = str(tenant.subscription_email) if tenant.subscription_email else None
            account.seat_limit = seat_limit
            account.monthly_request_limit = request_limit
            account.updated_at = utc_now()
            session.add(account)
            session.commit()
        Path(resolved.branding_upload_dir).mkdir(parents=True, exist_ok=True)
        return create_app(settings=resolved, engine=engine)
    except Exception:
        engine.dispose()
        raise
    finally:
        if guard is not None:
            try:
                guard.execute(text("SELECT pg_advisory_unlock(524155)"))
            finally:
                guard.close()


class TenantDispatcher:
    def __init__(self, app, *, settings: Settings):
        self.app = app
        self.settings = settings
        self.lock = anyio.Lock()
        self.cache: dict[str, tuple[str, FastAPI]] = {}

    def close(self):
        for _, target in self.cache.values():
            target.state.engine.dispose()
        self.cache.clear()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        try:
            manifest = await run_in_threadpool(load_manifest, self.settings)
        except Exception:
            # Manifest errors can contain connection secrets, so never log validation inputs.
            logger.error("SaaS company registry could not be loaded")
            await JSONResponse({"detail": "Company registry is unavailable."}, status_code=503)(scope, receive, send)
            return
        hosts = [value.decode("latin-1").lower() for key, value in scope["headers"] if key.lower() == b"host"]
        host = hosts[0] if len(hosts) == 1 else ""
        if (
            scope["path"] == "/api/v1/health"
            and host in {"127.0.0.1:8000", "localhost:8000"}
            and scope.get("client", ("",))[0] in {"127.0.0.1", "::1"}
        ):
            await JSONResponse({"status": "ok"})(scope, receive, send)
            return
        tenant = next((item for item in manifest.tenants if item.host == host), None)
        if tenant is None:
            await JSONResponse({"detail": "Company domain not found."}, status_code=404)(scope, receive, send)
            return
        if tenant.status != "active":
            await JSONResponse({"detail": "Company account is suspended."}, status_code=403)(scope, receive, send)
            return
        fingerprint = hashlib.sha256(tenant.model_dump_json().encode()).hexdigest()
        async with self.lock:
            registered = {item.slug for item in manifest.tenants}
            for removed in set(self.cache) - registered:
                self.cache.pop(removed)[1].state.engine.dispose()
            cached = self.cache.get(tenant.slug)
            if cached is None or cached[0] != fingerprint:
                try:
                    target = await run_in_threadpool(initialize_tenant, self.settings, tenant)
                except Exception:
                    logger.error("Company initialization failed (company=%s)", tenant.slug)
                    await JSONResponse({"detail": "Company service is unavailable."}, status_code=503)(scope, receive, send)
                    return
                if cached is not None:
                    cached[1].state.engine.dispose()
                self.cache[tenant.slug] = (fingerprint, target)
            target = self.cache[tenant.slug][1]
        await target(scope, receive, send)


def create_saas_app(settings: Settings) -> FastAPI:
    @asynccontextmanager
    async def lifespan(_):
        try:
            await run_in_threadpool(load_manifest, settings)
        except Exception:
            raise RuntimeError("SaaS company registry is invalid or unavailable") from None
        try:
            yield
        finally:
            dispatcher = app.middleware_stack
            while dispatcher is not None and not isinstance(dispatcher, TenantDispatcher):
                dispatcher = getattr(dispatcher, "app", None)
            if dispatcher is not None:
                await run_in_threadpool(dispatcher.close)

    app = FastAPI(title="Doğrama SaaS", docs_url=None, openapi_url=None, lifespan=lifespan)
    app.add_middleware(TenantDispatcher, settings=settings)
    app.add_middleware(SecurityHeadersMiddleware, production=settings.environment == "production")
    app.state.settings = settings
    return app
