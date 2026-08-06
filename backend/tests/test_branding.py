from __future__ import annotations

import base64
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.db import create_db_engine
from app.main import create_app
from app.security import hash_password


PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


class NoopMailer:
    def notify_admin(self, _: Any) -> bool:
        return False

    def send_customer_message(self, **_: Any) -> bool:
        return False


@pytest.fixture
def branding_setup(tmp_path: Path) -> tuple[TestClient, Settings, Path]:
    upload_dir = tmp_path / "branding"
    settings = Settings(
        environment="test",
        database_url="sqlite://",
        cors_origins="https://quote.example.com",
        admin_username="administrator",
        admin_password_hash=hash_password("correct horse battery staple"),
        jwt_secret="test-secret-that-is-longer-than-thirty-two-characters",
        public_rate_limit_requests=100,
        auth_rate_limit_requests=100,
        branding_upload_dir=str(upload_dir),
    )
    engine = create_db_engine(settings.database_url)
    app = create_app(settings=settings, engine=engine, mailer=NoopMailer())
    with TestClient(app) as client:
        yield client, settings, upload_dir


def _admin_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/v1/admin/login",
        json={
            "username": "administrator",
            "password": "correct horse battery staple",
        },
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_public_branding_has_safe_default_and_no_logo(
    branding_setup: tuple[TestClient, Settings, Path],
) -> None:
    client, _, _ = branding_setup

    response = client.get("/api/v1/site-branding")

    assert response.status_code == 200
    assert response.json()["brand_name"] == "Proje Çizim"
    assert response.json()["logo_url"] is None
    assert "logo_filename" not in response.json()
    assert client.get("/api/v1/site-logo").status_code == 404


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/v1/admin/site-branding"),
        ("patch", "/api/v1/admin/site-branding"),
        ("put", "/api/v1/admin/site-branding/logo"),
        ("delete", "/api/v1/admin/site-branding/logo"),
    ],
)
def test_admin_branding_endpoints_require_authentication(
    branding_setup: tuple[TestClient, Settings, Path],
    method: str,
    path: str,
) -> None:
    client, _, _ = branding_setup

    response = getattr(client, method)(path)

    assert response.status_code == 401


def test_admin_updates_public_branding_and_rejects_markup(
    branding_setup: tuple[TestClient, Settings, Path],
) -> None:
    client, _, _ = branding_setup
    headers = _admin_headers(client)

    response = client.patch(
        "/api/v1/admin/site-branding",
        headers=headers,
        json={
            "brand_name": "Anadolu PVC",
            "tagline": "Mekânınızı birlikte tasarlayalım",
            "logo_alt": "Anadolu PVC kurumsal logosu",
        },
    )

    assert response.status_code == 200
    public = client.get("/api/v1/site-branding").json()
    assert public["brand_name"] == "Anadolu PVC"
    assert public["tagline"] == "Mekânınızı birlikte tasarlayalım"
    assert public["logo_alt"] == "Anadolu PVC kurumsal logosu"

    unsafe = client.patch(
        "/api/v1/admin/site-branding",
        headers=headers,
        json={"brand_name": "<script>alert(1)</script>"},
    )
    assert unsafe.status_code == 422


def test_logo_upload_replacement_serving_and_delete(
    branding_setup: tuple[TestClient, Settings, Path],
) -> None:
    client, _, upload_dir = branding_setup
    headers = {**_admin_headers(client), "Content-Type": "image/png"}

    first = client.put(
        "/api/v1/admin/site-branding/logo",
        headers=headers,
        content=PNG_1X1,
    )

    assert first.status_code == 200
    assert first.json()["logo_url"] == "/api/v1/site-logo?v=1"
    assert "logo_filename" not in first.json()
    stored_files = [path for path in upload_dir.iterdir() if not path.name.startswith(".")]
    assert len(stored_files) == 1

    served = client.get("/api/v1/site-logo")
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/png"
    assert served.content == PNG_1X1

    second = client.put(
        "/api/v1/admin/site-branding/logo",
        headers=headers,
        content=PNG_1X1,
    )
    assert second.status_code == 200
    assert second.json()["logo_url"] == "/api/v1/site-logo?v=2"
    assert len([path for path in upload_dir.iterdir() if not path.name.startswith(".")]) == 1

    deleted = client.delete("/api/v1/admin/site-branding/logo", headers=headers)
    assert deleted.status_code == 204
    assert client.get("/api/v1/site-branding").json()["logo_url"] is None
    assert client.get("/api/v1/site-logo").status_code == 404
    assert not [path for path in upload_dir.iterdir() if not path.name.startswith(".")]


def test_logo_upload_rejects_svg_mismatch_and_oversize(
    branding_setup: tuple[TestClient, Settings, Path],
) -> None:
    client, settings, upload_dir = branding_setup
    auth = _admin_headers(client)

    svg = client.put(
        "/api/v1/admin/site-branding/logo",
        headers={**auth, "Content-Type": "image/svg+xml"},
        content=b"<svg><script>alert(1)</script></svg>",
    )
    assert svg.status_code == 415

    mismatch = client.put(
        "/api/v1/admin/site-branding/logo",
        headers={**auth, "Content-Type": "image/jpeg"},
        content=PNG_1X1,
    )
    assert mismatch.status_code == 415

    oversize = client.put(
        "/api/v1/admin/site-branding/logo",
        headers={**auth, "Content-Type": "image/png"},
        content=b"x" * (settings.max_branding_logo_bytes + 1),
    )
    assert oversize.status_code == 413
    assert not upload_dir.exists() or not list(upload_dir.iterdir())


def test_put_logo_cors_preflight_is_allowed(
    branding_setup: tuple[TestClient, Settings, Path],
) -> None:
    client, _, _ = branding_setup

    response = client.options(
        "/api/v1/admin/site-branding/logo",
        headers={
            "Origin": "https://quote.example.com",
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert response.status_code == 200
    assert "PUT" in response.headers["access-control-allow-methods"]
