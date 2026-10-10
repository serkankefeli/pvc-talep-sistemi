from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlmodel import Session

from app.config import Settings
from app.db import create_db_and_tables, create_db_engine
from app.main import create_app
from app.models import CompanyAccount
from app.saas import TenantDefinition, TenantManifest, initialize_tenant, load_manifest
from app.security import hash_password


PASSWORD = "shared test password 123"


@pytest.fixture
def setup_saas(tmp_path):
    registry = tmp_path / "tenants.json"
    settings = Settings(
        environment="test", database_url="sqlite://",
        cors_origins="https://original.example",
        jwt_secret="saas-tests-master-secret-with-at-least-thirty-two-characters",
        admin_password_hash=hash_password(PASSWORD),
        public_rate_limit_requests=100, auth_rate_limit_requests=100,
        saas_enabled=True, saas_manifest_path=str(registry),
        saas_upload_root=str(tmp_path / "logos"),
        smtp_host="original-mail.example", smtp_admin_email="private@original.example",
    )
    tenants = [TenantDefinition(
        slug=slug, auth_id=uuid4(), name=f"Firma {slug}", public_url=f"https://{slug}.example",
        database_url=f"sqlite:///{(tmp_path / (slug + '.db')).as_posix()}",
        admin_password_hash=hash_password(PASSWORD),
        plan="starter",
        subscription_starts_at=datetime.now(timezone.utc),
        subscription_ends_at=datetime.now(timezone.utc) + timedelta(days=365),
    ) for slug in ("alpha", "beta")]
    registry.write_text(TenantManifest(tenants=tenants).model_dump_json(), encoding="utf-8")
    with TestClient(create_app(settings=settings)) as client:
        yield settings, tenants, registry, client


def login(client, slug):
    response = client.post("/api/v1/admin/login", headers={"Host": f"{slug}.example"}, json={
        "username": "admin", "password": PASSWORD,
    })
    assert response.status_code == 200, response.text
    return {"Host": f"{slug}.example", "Authorization": f"Bearer {response.json()['access_token']}"}


def request_payload():
    return {
        "contact": {"full_name": "Test Customer", "email": "customer@example.com", "preferred_contact": "email"},
        "items": [{"product_type": "pvc_window", "width_mm": 1200, "height_mm": 1400,
                   "quantity": 1, "color": "white", "layout": "fixed", "glazing": "double_glazing",
                   "opening_direction": "none", "divisions": []}],
        "privacy_consent": True,
    }


def test_company_tokens_data_catalog_and_branding_are_isolated(setup_saas):
    settings, tenants, registry, client = setup_saas
    alpha, beta = login(client, "alpha"), login(client, "beta")
    response = client.post("/api/v1/requests", headers={"Host": "alpha.example"}, json=request_payload())
    assert response.status_code == 202, response.text
    alpha_requests = client.get("/api/v1/admin/requests", headers=alpha).json()
    assert alpha_requests["total"] == 1
    assert client.get("/api/v1/admin/requests", headers=beta).json()["total"] == 0
    request_id = alpha_requests["items"][0]["id"]
    assert client.get(f"/api/v1/admin/requests/{request_id}", headers=beta).status_code == 404
    assert client.put(f"/api/v1/admin/requests/{request_id}/favorite", headers=beta).status_code == 404

    assert client.get("/api/v1/admin/users", headers={**alpha, "Host": "beta.example"}).status_code == 401
    assert client.patch("/api/v1/admin/site-branding", headers=alpha, json={"brand_name": "Alpha Markası"}).status_code == 200
    assert client.get("/api/v1/site-branding", headers={"Host": "alpha.example"}).json()["brand_name"] == "Alpha Markası"
    assert client.get("/api/v1/site-branding", headers={"Host": "beta.example"}).json()["brand_name"] != "Alpha Markası"
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
    assert client.put("/api/v1/admin/site-branding/logo", headers={**alpha, "Content-Type": "image/png"}, content=png).status_code == 200
    assert client.get("/api/v1/site-logo", headers={"Host": "alpha.example"}).content == png
    assert client.get("/api/v1/site-logo", headers={"Host": "beta.example"}).status_code == 404

    assert client.delete("/api/v1/admin/catalog/products/pvc_window", headers=alpha).status_code == 204
    assert "pvc_window" not in [p["key"] for p in client.get("/api/v1/catalog", headers={"Host": "alpha.example"}).json()["products"]]
    assert "pvc_window" in [p["key"] for p in client.get("/api/v1/catalog", headers={"Host": "beta.example"}).json()["products"]]
    account = client.get("/api/v1/admin/company", headers=alpha).json()
    assert account["slug"] == "alpha" and account["requests_this_month"] == 1
    assert account["saas_enabled"] is True
    app = initialize_tenant(settings, tenants[1])
    assert app.state.settings.smtp_host == ""
    assert app.state.settings.smtp_admin_email == ""
    app.state.engine.dispose()


def test_unknown_host_and_forwarded_host_cannot_select_a_company(setup_saas):
    _, _, _, client = setup_saas
    assert client.get("/api/v1/catalog", headers={"Host": "unknown.example", "X-Forwarded-Host": "alpha.example"}).status_code == 404
    headers = login(client, "alpha")
    company = client.get("/api/v1/admin/company", headers={**headers, "X-Forwarded-Host": "beta.example", "X-Tenant-Id": "beta"})
    assert company.json()["slug"] == "alpha"
    assert client.get("/api/v1/admin/company", headers={"Host": "alpha.example"}).status_code == 401
    assert client.options("/api/v1/catalog", headers={"Host": "alpha.example", "Origin": "https://beta.example", "Access-Control-Request-Method": "GET"}).status_code == 400


def test_reprovisioning_identity_invalidates_prior_tokens(setup_saas):
    _, tenants, registry, client = setup_saas
    headers = login(client, "alpha")
    tenants[0] = tenants[0].model_copy(update={"auth_id": uuid4()})
    registry.write_text(TenantManifest(tenants=tenants).model_dump_json(), encoding="utf-8")
    assert client.get("/api/v1/admin/company", headers=headers).status_code == 401
    assert client.get("/api/v1/admin/company", headers=login(client, "alpha")).status_code == 200


def test_seat_and_monthly_request_limits_are_enforced(setup_saas):
    _, tenants, _, client = setup_saas
    alpha = login(client, "alpha")
    for username in ("user1", "user2"):
        assert client.post("/api/v1/admin/users", headers=alpha, json={
            "username": username, "display_name": username, "password": PASSWORD,
        }).status_code == 201
    assert client.post("/api/v1/admin/users", headers=alpha, json={
        "username": "user3", "display_name": "User three", "password": PASSWORD,
    }).status_code == 409
    users = client.get("/api/v1/admin/users", headers=alpha).json()
    user1 = next(user for user in users if user["username"] == "user1")
    assert client.patch(f"/api/v1/admin/users/{user1['id']}", headers=alpha, json={"is_active": False}).status_code == 200
    assert client.post("/api/v1/admin/users", headers=alpha, json={
        "username": "user3", "display_name": "User three", "password": PASSWORD,
    }).status_code == 201
    assert client.patch(f"/api/v1/admin/users/{user1['id']}", headers=alpha, json={"is_active": True}).status_code == 409
    engine = create_db_engine(tenants[0].database_url)
    with Session(engine) as session:
        account = session.get(CompanyAccount, 1)
        account.monthly_request_limit = 1
        session.add(account)
        session.commit()
    engine.dispose()
    assert client.post("/api/v1/requests", headers={"Host": "alpha.example"}, json=request_payload()).status_code == 202
    assert client.post("/api/v1/requests", headers={"Host": "alpha.example"}, json=request_payload()).status_code == 429


def test_suspension_and_trial_expiry_take_effect_with_cached_sessions(setup_saas):
    _, tenants, registry, client = setup_saas
    alpha, beta = login(client, "alpha"), login(client, "beta")
    manifest = TenantManifest(tenants=[
        tenants[0].model_copy(update={"status": "suspended"}), tenants[1],
    ])
    registry.write_text(manifest.model_dump_json(), encoding="utf-8")
    assert client.get("/api/v1/admin/requests", headers=alpha).status_code == 403
    assert client.get("/api/v1/catalog", headers={"Host": "alpha.example"}).status_code == 403
    assert client.get("/api/v1/admin/requests", headers=beta).status_code == 200
    manifest.tenants[0] = tenants[0].model_copy(update={
        "plan": "trial", "trial_ends_at": datetime.now(timezone.utc) - timedelta(seconds=1),
    })
    registry.write_text(manifest.model_dump_json(), encoding="utf-8")
    assert client.get("/api/v1/admin/requests", headers=alpha).status_code == 403
    manifest.tenants[0] = tenants[0]
    registry.write_text(manifest.model_dump_json(), encoding="utf-8")
    assert client.get("/api/v1/admin/requests", headers=alpha).status_code == 200


def test_duplicate_database_and_upload_paths_are_rejected(setup_saas):
    settings, tenants, registry, _ = setup_saas
    with pytest.raises(ValidationError):
        TenantManifest(tenants=[tenants[0], tenants[1].model_copy(update={"database_url": tenants[0].database_url})])
    manifest = TenantManifest(tenants=[tenants[0], tenants[1]])
    for tenant in manifest.tenants:
        tenant.branding_upload_dir = settings.saas_upload_root
    registry.write_text(manifest.model_dump_json(), encoding="utf-8")
    with pytest.raises(ValueError):
        load_manifest(settings)


def test_database_cannot_be_reassigned_to_another_company(tmp_path):
    engine = create_db_engine(f"sqlite:///{(tmp_path / 'owned.db').as_posix()}")
    settings = Settings(environment="test", tenant_slug="original", admin_password_hash=hash_password(PASSWORD))
    create_db_and_tables(engine, settings=settings)
    with pytest.raises(ValueError):
        create_db_and_tables(engine, settings=settings.model_copy(update={"tenant_slug": "intruder"}))
    with Session(engine) as session:
        assert session.get(CompanyAccount, 1).slug == "original"
    engine.dispose()
