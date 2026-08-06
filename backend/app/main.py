from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.engine import Engine

from .api import build_router
from .branding_api import build_branding_router
from .catalog_api import build_catalog_router
from .config import Settings
from .db import create_db_and_tables, create_db_engine
from .mailer import MailService, SmtpMailService
from .middleware import RequestBodyLimitMiddleware, SecurityHeadersMiddleware


def create_app(
    *,
    settings: Settings | None = None,
    engine: Engine | None = None,
    mailer: MailService | None = None,
) -> FastAPI:
    app_settings = settings or Settings()
    app_engine = engine or create_db_engine(app_settings.database_url)
    app_mailer = mailer or SmtpMailService(app_settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        create_db_and_tables(app_engine)
        yield

    app = FastAPI(
        title=app_settings.app_name,
        version="0.1.0",
        debug=app_settings.debug,
        docs_url="/docs" if app_settings.docs_enabled else None,
        redoc_url=None,
        openapi_url="/openapi.json" if app_settings.docs_enabled else None,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=app_settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Cache-Control"],
        max_age=600,
    )
    app.add_middleware(
        RequestBodyLimitMiddleware,
        max_bytes=app_settings.max_request_body_bytes,
        path_limits={
            "/api/v1/admin/site-branding/logo": app_settings.max_branding_logo_bytes,
        },
    )
    app.add_middleware(
        SecurityHeadersMiddleware,
        production=app_settings.environment == "production",
    )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_, exc: RequestValidationError):
        # Pydantic includes raw input in its default errors; strip it so invalid
        # submissions cannot reflect contact details or notes back in responses.
        errors = []
        for error in exc.errors():
            errors.append(
                {
                    "type": error.get("type"),
                    "loc": error.get("loc"),
                    "msg": error.get("msg"),
                }
            )
        return JSONResponse(status_code=422, content={"detail": errors})

    app.include_router(
        build_router(
            settings=app_settings,
            engine=app_engine,
            mailer=app_mailer,
        )
    )
    app.include_router(
        build_catalog_router(
            settings=app_settings,
            engine=app_engine,
        )
    )
    app.include_router(
        build_branding_router(
            settings=app_settings,
            engine=app_engine,
        )
    )
    app.state.settings = app_settings
    app.state.engine = app_engine
    return app


app = create_app()
