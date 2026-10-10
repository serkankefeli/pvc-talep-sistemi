from __future__ import annotations

import io
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import saas_cli
from app.config import Settings
from app.db import create_db_and_tables, create_db_engine
from app.main import create_app
from app.models import AdminUser, CompanyAccount, SiteBranding
from app.saas import load_manifest
from app.security import hash_password, verify_password


@pytest.fixture
def cli(tmp_path, monkeypatch):
    settings = Settings(environment="test", saas_enabled=True,
        saas_manifest_path=str(tmp_path / "tenants.json"),
        saas_upload_root=str(tmp_path / "uploads"),
        branding_upload_dir=str(tmp_path / "existing-logo"),
        admin_password_hash=hash_password("environment password 123"),
        tenant_slug="existing", tenant_name="Existing Company")
    monkeypatch.setattr(saas_cli, "Settings", lambda: settings)
    database_url = f"sqlite:///{(tmp_path / 'company.db').as_posix()}"
    monkeypatch.setenv("NEW_DB_URL", database_url)
    monkeypatch.setattr("sys.stdin", io.StringIO("new company password 123\n"))
    return settings, database_url


def register_args(slug="existing"):
    return ["register", "--slug", slug, "--name", "Example Company",
        "--url", "https://example.test", "--database-env", "NEW_DB_URL"]


def test_register_plan_and_suspend_commands(cli, capsys):
    settings, database_url = cli
    assert saas_cli.main([*register_args(), "--password-stdin"]) == 0
    tenant = load_manifest(settings).tenants[0]
    assert tenant.plan == "trial"
    assert tenant.trial_ends_at > datetime.now(timezone.utc)
    engine = create_db_engine(database_url)
    with Session(engine) as session:
        user = session.exec(select(AdminUser)).one()
        assert verify_password("new company password 123", user.password_hash)
        assert session.get(CompanyAccount, 1).seat_limit == 2
    engine.dispose()
    with pytest.raises(ValueError):
        saas_cli.main([*register_args(), "--password-stdin"])
    assert saas_cli.main(["set-plan", "existing", "pro"]) == 0
    assert load_manifest(settings).tenants[0].auth_id == tenant.auth_id
    with TestClient(create_app(settings=settings)) as client:
        assert client.get("/api/v1/catalog", headers={"Host": "example.test"}).status_code == 200
        assert saas_cli.main(["suspend", "existing"]) == 0
        assert client.get("/api/v1/catalog", headers={"Host": "example.test"}).status_code == 403
        assert saas_cli.main(["resume", "existing"]) == 0
        assert client.get("/api/v1/catalog", headers={"Host": "example.test"}).status_code == 200
    assert saas_cli.main(["list"]) == 0
    output = capsys.readouterr().out
    assert "sqlite" not in output and "$argon2" not in output and "password" not in output


def test_adoption_preserves_current_password_and_branding(cli):
    settings, database_url = cli
    engine = create_db_engine(database_url)
    create_db_and_tables(engine, settings=settings)
    with Session(engine) as session:
        admin = session.exec(select(AdminUser)).one()
        admin.password_hash = hash_password("previously changed password 123")
        session.add(admin)
        branding = session.get(SiteBranding, 1)
        branding.brand_name = "Preserved Brand"
        session.add(branding)
        session.commit()
    assert saas_cli.main([*register_args(), "--plan", "legacy", "--adopt-existing"]) == 0
    tenant = load_manifest(settings).tenants[0]
    assert tenant.branding_upload_dir == settings.branding_upload_dir
    with Session(engine) as session:
        assert verify_password("previously changed password 123", session.exec(select(AdminUser)).one().password_hash)
        assert session.get(SiteBranding, 1).brand_name == "Preserved Brand"
        assert session.get(CompanyAccount, 1).plan == "legacy"
    engine.dispose()


def test_new_company_refuses_a_populated_database(cli):
    settings, database_url = cli
    engine = create_db_engine(database_url)
    create_db_and_tables(engine, settings=settings)
    engine.dispose()
    with pytest.raises(ValueError, match="empty"):
        saas_cli.main([*register_args(), "--password-stdin"])


def test_adoption_cannot_reassign_database_identity(cli):
    settings, database_url = cli
    engine = create_db_engine(database_url)
    create_db_and_tables(engine, settings=settings)
    engine.dispose()
    with pytest.raises(ValueError, match="different company"):
        saas_cli.main([*register_args("other"), "--plan", "legacy", "--adopt-existing"])
