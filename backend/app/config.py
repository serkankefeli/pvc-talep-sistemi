from __future__ import annotations

from typing import Literal
from urllib.parse import urlparse

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


_DEVELOPMENT_JWT_SECRET = "development-only-change-this-secret-32-chars"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "PVC Teklif Talep API"
    environment: Literal["development", "test", "production"] = "development"
    debug: bool = False
    enable_docs: bool = True

    database_url: str = "sqlite:///./pvc_requests.db"

    # Comma-separated exact origins. Wildcards are deliberately rejected.
    cors_origins: str = "http://localhost:4200"

    admin_username: str = "admin"
    admin_password_hash: str = ""
    jwt_secret: str = Field(default=_DEVELOPMENT_JWT_SECRET, min_length=32)
    jwt_algorithm: Literal["HS256"] = "HS256"
    jwt_issuer: str = "pvc-quote-api"
    jwt_expire_minutes: int = Field(default=15, ge=5, le=60)

    public_rate_limit_requests: int = Field(default=10, ge=1, le=1000)
    public_rate_limit_window_seconds: int = Field(default=60, ge=10, le=3600)
    auth_rate_limit_requests: int = Field(default=10, ge=1, le=100)
    auth_rate_limit_window_seconds: int = Field(default=300, ge=30, le=3600)
    max_request_body_bytes: int = Field(default=131_072, ge=4096, le=1_048_576)
    max_branding_logo_bytes: int = Field(
        default=2_097_152,
        ge=65_536,
        le=5_242_880,
    )
    branding_upload_dir: str = "uploads/branding"

    smtp_host: str = ""
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_admin_email: str = ""
    smtp_starttls: bool = True
    smtp_timeout_seconds: int = Field(default=10, ge=1, le=60)
    admin_panel_base_url: str = "http://localhost:4200/admin"

    @field_validator("cors_origins")
    @classmethod
    def validate_cors_origins(cls, value: str) -> str:
        origins = [item.strip().rstrip("/") for item in value.split(",") if item.strip()]
        if not origins:
            raise ValueError("CORS_ORIGINS must contain at least one exact origin")
        for origin in origins:
            if origin == "*":
                raise ValueError("Wildcard CORS origins are not permitted")
            parsed = urlparse(origin)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.netloc
                or parsed.path not in {"", "/"}
                or parsed.params
                or parsed.query
                or parsed.fragment
            ):
                raise ValueError(f"Invalid exact CORS origin: {origin}")
        return ",".join(origins)

    @field_validator("admin_panel_base_url")
    @classmethod
    def validate_admin_panel_url(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("ADMIN_PANEL_BASE_URL must be an absolute HTTP(S) URL")
        return value.rstrip("/")

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        if self.environment == "production":
            if self.debug:
                raise ValueError("DEBUG cannot be enabled in production")
            if not self.admin_password_hash:
                raise ValueError("ADMIN_PASSWORD_HASH is required in production")
            if self.jwt_secret == _DEVELOPMENT_JWT_SECRET:
                raise ValueError("JWT_SECRET must be changed in production")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return self.cors_origins.split(",")

    @property
    def docs_enabled(self) -> bool:
        return self.enable_docs and self.environment != "production"
