import os
import secrets
from datetime import datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import FileResponse
from pydantic import Field, field_validator, model_validator
from sqlalchemy.engine import Engine
from sqlmodel import Session

from .config import Settings
from .models import SiteBranding, utc_now
from .schemas import PlainText, StrictModel
from .security import AdminPrincipal, build_admin_dependency


_LOGO_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}


class SiteBrandingPublic(StrictModel):
    brand_name: str
    tagline: str
    logo_url: str | None
    logo_alt: str
    updated_at: datetime


class SiteBrandingUpdate(StrictModel):
    brand_name: Annotated[PlainText, Field(min_length=2, max_length=120)] | None = None
    tagline: Annotated[PlainText, Field(max_length=200)] | None = None
    logo_alt: Annotated[PlainText, Field(min_length=2, max_length=160)] | None = None

    @field_validator("brand_name", "tagline", "logo_alt")
    @classmethod
    def reject_null_values(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("Branding fields cannot be null")
        return value

    @model_validator(mode="after")
    def require_change(self) -> "SiteBrandingUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one branding field is required")
        return self


def _branding_or_500(session: Session) -> SiteBranding:
    branding = session.get(SiteBranding, 1)
    if branding is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Site branding is not initialized.",
        )
    return branding


def _public_branding(branding: SiteBranding) -> SiteBrandingPublic:
    return SiteBrandingPublic(
        brand_name=branding.brand_name,
        tagline=branding.tagline,
        logo_url=(
            f"/api/v1/site-logo?v={branding.logo_revision}"
            if branding.logo_filename
            else None
        ),
        logo_alt=branding.logo_alt,
        updated_at=branding.updated_at,
    )


def _verified_logo_type(data: bytes, declared_type: str) -> tuple[str, str]:
    declared_type = declared_type.split(";", 1)[0].strip().lower()
    detected_type: str | None = None
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        if len(data) >= 33 and data[12:16] == b"IHDR":
            detected_type = "image/png"
    elif len(data) >= 4 and data.startswith(b"\xff\xd8\xff") and data.endswith(b"\xff\xd9"):
        detected_type = "image/jpeg"
    elif (
        len(data) >= 20
        and data[:4] == b"RIFF"
        and data[8:12] == b"WEBP"
        and data[12:16] in {b"VP8 ", b"VP8L", b"VP8X"}
        and int.from_bytes(data[4:8], "little") + 8 == len(data)
    ):
        detected_type = "image/webp"

    if detected_type is None or declared_type not in _LOGO_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PNG, JPEG and WebP logo files are accepted.",
        )
    if detected_type != declared_type:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="The file content does not match its declared image type.",
        )
    return detected_type, _LOGO_TYPES[detected_type]


def _upload_directory(settings: Settings) -> Path:
    directory = Path(settings.branding_upload_dir).expanduser().resolve()
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _safe_logo_path(directory: Path, filename: str | None) -> Path | None:
    if not filename or Path(filename).name != filename:
        return None
    candidate = (directory / filename).resolve()
    return candidate if candidate.parent == directory else None


def _remove_logo_file(directory: Path, filename: str | None) -> None:
    candidate = _safe_logo_path(directory, filename)
    if candidate is not None:
        candidate.unlink(missing_ok=True)


def build_branding_router(*, settings: Settings, engine: Engine) -> APIRouter:
    router = APIRouter(prefix="/api/v1")
    require_admin = build_admin_dependency(settings)

    def get_session():
        with Session(engine) as session:
            yield session

    @router.get(
        "/site-branding",
        response_model=SiteBrandingPublic,
        tags=["site branding"],
    )
    def get_public_branding(
        session: Session = Depends(get_session),
    ) -> SiteBrandingPublic:
        return _public_branding(_branding_or_500(session))

    @router.get(
        "/site-logo",
        response_class=FileResponse,
        tags=["site branding"],
    )
    def get_public_logo(
        session: Session = Depends(get_session),
    ) -> FileResponse:
        branding = _branding_or_500(session)
        directory = _upload_directory(settings)
        logo_path = _safe_logo_path(directory, branding.logo_filename)
        if logo_path is None or not logo_path.is_file() or not branding.logo_content_type:
            raise HTTPException(status_code=404, detail="Site logo is not configured.")
        return FileResponse(
            path=logo_path,
            media_type=branding.logo_content_type,
            filename=None,
        )

    @router.get(
        "/admin/site-branding",
        response_model=SiteBrandingPublic,
        tags=["admin"],
    )
    def get_admin_branding(
        _: Annotated[AdminPrincipal, Depends(require_admin)],
        session: Session = Depends(get_session),
    ) -> SiteBrandingPublic:
        return _public_branding(_branding_or_500(session))

    @router.patch(
        "/admin/site-branding",
        response_model=SiteBrandingPublic,
        tags=["admin"],
    )
    def update_admin_branding(
        payload: SiteBrandingUpdate,
        _: Annotated[AdminPrincipal, Depends(require_admin)],
        session: Session = Depends(get_session),
    ) -> SiteBrandingPublic:
        branding = _branding_or_500(session)
        supplied = payload.model_fields_set
        if "brand_name" in supplied:
            branding.brand_name = payload.brand_name
        if "tagline" in supplied:
            branding.tagline = payload.tagline
        if "logo_alt" in supplied:
            branding.logo_alt = payload.logo_alt
        branding.updated_at = utc_now()
        session.add(branding)
        session.commit()
        session.refresh(branding)
        return _public_branding(branding)

    @router.put(
        "/admin/site-branding/logo",
        response_model=SiteBrandingPublic,
        tags=["admin"],
    )
    async def upload_admin_logo(
        request: Request,
        _: Annotated[AdminPrincipal, Depends(require_admin)],
        session: Session = Depends(get_session),
    ) -> SiteBrandingPublic:
        data = await request.body()
        if not data:
            raise HTTPException(status_code=400, detail="Logo file cannot be empty.")
        if len(data) > settings.max_branding_logo_bytes:
            raise HTTPException(status_code=413, detail="Logo file is too large.")

        content_type, extension = _verified_logo_type(
            data,
            request.headers.get("content-type", ""),
        )
        directory = _upload_directory(settings)
        token = secrets.token_hex(20)
        filename = f"{token}{extension}"
        final_path = directory / filename
        temporary_path = directory / f".{token}.upload"
        try:
            temporary_path.write_bytes(data)
            os.replace(temporary_path, final_path)
        finally:
            temporary_path.unlink(missing_ok=True)

        branding = _branding_or_500(session)
        old_filename = branding.logo_filename
        branding.logo_filename = filename
        branding.logo_content_type = content_type
        branding.logo_revision += 1
        branding.updated_at = utc_now()
        session.add(branding)
        try:
            session.commit()
            session.refresh(branding)
        except Exception:
            final_path.unlink(missing_ok=True)
            raise
        _remove_logo_file(directory, old_filename)
        return _public_branding(branding)

    @router.delete(
        "/admin/site-branding/logo",
        status_code=status.HTTP_204_NO_CONTENT,
        tags=["admin"],
    )
    def delete_admin_logo(
        _: Annotated[AdminPrincipal, Depends(require_admin)],
        session: Session = Depends(get_session),
    ) -> Response:
        branding = _branding_or_500(session)
        old_filename = branding.logo_filename
        branding.logo_filename = None
        branding.logo_content_type = None
        branding.logo_revision += 1
        branding.updated_at = utc_now()
        session.add(branding)
        session.commit()
        _remove_logo_file(_upload_directory(settings), old_filename)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return router
