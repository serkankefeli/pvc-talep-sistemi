"""Optional integration tests. Use an isolated, disposable PostgreSQL server only."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url
from sqlmodel import Session

from app.config import Settings
from app.db import create_db_engine
from app.main import create_app
from app.models import CompanyAccount
from app.saas import TenantDefinition, TenantManifest
from app.security import hash_password
from app.subscription_reminders import send_due_reminder
from unittest.mock import Mock
from test_saas import PASSWORD, login, request_payload


pytestmark = pytest.mark.skipif(
    not os.environ.get("SAAS_TEST_POSTGRES_URL"),
    reason="Requires an isolated disposable PostgreSQL server",
)


@pytest.fixture
def postgres_saas(tmp_path):
    admin_url = make_url(os.environ["SAAS_TEST_POSTGRES_URL"])
    names = [f"saas_test_{uuid4().hex}" for _ in range(2)]
    engine = create_db_engine(admin_url.render_as_string(hide_password=False))
    created = []
    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            for name in names:
                connection.exec_driver_sql(f'CREATE DATABASE "{name}"')
                created.append(name)
        tenants = [TenantDefinition(slug=slug, auth_id=uuid4(), name=slug.title(),
            public_url=f"https://{slug}.example", plan="starter",
            subscription_starts_at=datetime.now(timezone.utc),
            subscription_ends_at=datetime.now(timezone.utc) + timedelta(days=365),
            database_url=admin_url.set(database=name).render_as_string(hide_password=False),
            admin_password_hash=hash_password(PASSWORD))
            for slug, name in zip(("alpha", "beta"), names)]
        registry = tmp_path / "tenants.json"
        registry.write_text(TenantManifest(tenants=tenants).model_dump_json(), encoding="utf-8")
        settings = Settings(environment="test", saas_enabled=True,
            saas_manifest_path=str(registry), saas_upload_root=str(tmp_path / "logos"),
            admin_password_hash=hash_password(PASSWORD), public_rate_limit_requests=100,
            auth_rate_limit_requests=100)
        with TestClient(create_app(settings=settings)) as client:
            yield client, tenants
    finally:
        # These exact random names were created by this fixture, never user databases.
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            for name in created:
                assert name.startswith("saas_test_") and len(name) == 42
                connection.exec_driver_sql(f'DROP DATABASE "{name}" WITH (FORCE)')
        engine.dispose()


def test_postgres_company_data_and_concurrent_request_quota(postgres_saas):
    client, tenants = postgres_saas
    alpha, beta = login(client, "alpha"), login(client, "beta")
    engine = create_db_engine(tenants[0].database_url)
    with Session(engine) as session:
        account = session.get(CompanyAccount, 1)
        account.monthly_request_limit = 1
        session.add(account)
        session.commit()
    engine.dispose()
    with ThreadPoolExecutor(max_workers=4) as executor:
        responses = list(executor.map(lambda _: client.post("/api/v1/requests",
            headers={"Host": "alpha.example"}, json=request_payload()), range(4)))
    assert sorted(response.status_code for response in responses) == [202, 429, 429, 429]
    assert client.get("/api/v1/admin/requests", headers=alpha).json()["total"] == 1
    assert client.get("/api/v1/admin/requests", headers=beta).json()["total"] == 0
    assert client.get("/api/v1/admin/company", headers={**alpha, "Host": "beta.example"}).status_code == 401


def test_postgres_concurrent_user_quota(postgres_saas):
    client, _ = postgres_saas
    alpha = login(client, "alpha")
    with ThreadPoolExecutor(max_workers=4) as executor:
        responses = list(executor.map(lambda index: client.post("/api/v1/admin/users",
            headers=alpha, json={"username": f"user{index}", "display_name": f"User {index}",
                "password": PASSWORD}), range(4)))
    assert sorted(response.status_code for response in responses) == [201, 201, 409, 409]
    assert client.get("/api/v1/admin/company", headers=alpha).json()["active_users"] == 3


def test_postgres_concurrent_reminders_are_deduplicated(postgres_saas):
    client, tenants = postgres_saas
    login(client, "alpha")
    tenant = tenants[0].model_copy(update={"subscription_email": "owner@example.com"})
    engine = create_db_engine(tenant.database_url)
    mailer = Mock()
    mailer.send_customer_message.return_value = True
    now = tenant.subscription_ends_at - timedelta(days=30)
    try:
        with ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(lambda _: send_due_reminder(engine, tenant, mailer, now=now), range(4)))
        assert results.count("sent") == 1
        assert results.count("already_sent") == 3
        assert mailer.send_customer_message.call_count == 1
    finally:
        engine.dispose()
