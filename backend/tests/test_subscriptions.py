from datetime import datetime, timedelta, timezone
from unittest.mock import Mock

import pytest
from pydantic import ValidationError
from sqlmodel import Session, select

from app.company import annual_end
from app.models import SubscriptionReminder
from app.saas import TenantManifest, load_manifest, initialize_tenant
from app.subscription_reminders import send_due_reminder, run_once
from test_saas import setup_saas, login, request_payload
from test_saas_cli import cli, register_args
from app import saas_cli


def test_expired_member_can_login_but_not_use_any_business_routes(setup_saas):
    settings, tenants, registry, client = setup_saas
    old_session = login(client, "alpha")
    end = datetime.now(timezone.utc) - timedelta(seconds=1)
    tenants[0] = tenants[0].model_copy(update={
        "subscription_starts_at": end - timedelta(days=365), "subscription_ends_at": end,
    })
    registry.write_text(TenantManifest(tenants=tenants).model_dump_json(), encoding="utf-8")
    for headers in (old_session, login(client, "alpha")):
        account = client.get("/api/v1/admin/company", headers=headers)
        assert account.status_code == 200
        assert account.json()["access_mode"] == "expired"
        assert client.get("/api/v1/admin/users/me", headers=headers).status_code == 200
        for path in ("/api/v1/admin/requests", "/api/v1/admin/catalog/products",
                     "/api/v1/admin/users", "/api/v1/admin/requests/1/pdf"):
            assert client.get(path, headers=headers).json()["detail"] == "SUBSCRIPTION_EXPIRED"
        assert client.patch("/api/v1/admin/site-branding", headers=headers, json={"brand_name": "No"}).status_code == 403
        assert client.post("/api/v1/requests", headers={"Host": "alpha.example"}, json=request_payload()).status_code == 403
    assert client.get("/api/v1/admin/requests", headers=login(client, "beta")).status_code == 200
    tenants[0] = tenants[0].model_copy(update={"subscription_ends_at": annual_end(datetime.now(timezone.utc))})
    registry.write_text(TenantManifest(tenants=tenants).model_dump_json(), encoding="utf-8")
    assert client.get("/api/v1/admin/requests", headers=old_session).status_code == 200


def test_calendar_year_and_paid_plan_renewal(cli):
    settings, _ = cli
    start = datetime(2024, 2, 29, 12, tzinfo=timezone.utc)
    assert annual_end(start) == datetime(2025, 2, 28, 12, tzinfo=timezone.utc)
    saas_cli.main([*register_args(), "--plan", "starter", "--password-stdin", "--subscription-email", "owner@example.com"])
    tenant = load_manifest(settings).tenants[0]
    assert tenant.subscription_ends_at == annual_end(tenant.subscription_starts_at)
    saas_cli.main(["renew", "existing"])
    renewed = load_manifest(settings).tenants[0]
    assert renewed.subscription_starts_at == tenant.subscription_ends_at
    assert renewed.subscription_ends_at == annual_end(tenant.subscription_ends_at)
    assert renewed.auth_id == tenant.auth_id


def reminder_setup(settings, tenant, end):
    tenant = tenant.model_copy(update={"subscription_email": "owner@example.com",
        "subscription_starts_at": end - timedelta(days=365), "subscription_ends_at": end})
    target = initialize_tenant(settings, tenant)
    return tenant, target.state.engine


def test_reminder_checkpoints_are_sent_once_and_downtime_does_not_burst(setup_saas):
    settings, tenants, _, _ = setup_saas
    end = datetime.now(timezone.utc) + timedelta(days=40)
    tenant, engine = reminder_setup(settings, tenants[0], end)
    mailer = Mock()
    mailer.send_customer_message.return_value = True
    try:
        assert send_due_reminder(engine, tenant, mailer, now=end - timedelta(days=31)) == "skipped"
        for days in (30, 14, 7, 1):
            now = end - timedelta(days=days)
            assert send_due_reminder(engine, tenant, mailer, now=now) == "sent"
            assert send_due_reminder(engine, tenant, mailer, now=now) == "already_sent"
        assert mailer.send_customer_message.call_count == 4
        assert send_due_reminder(engine, tenant, mailer, now=end) == "skipped"
        new_tenant = tenant.model_copy(update={"subscription_ends_at": annual_end(end)})
        assert send_due_reminder(engine, new_tenant, mailer, now=annual_end(end) - timedelta(days=5)) == "sent"
        assert mailer.send_customer_message.call_count == 5
        with Session(engine) as session:
            assert len(session.exec(select(SubscriptionReminder)).all()) == 5
    finally:
        engine.dispose()


def test_failed_mail_retries_without_claiming_delivery(setup_saas):
    settings, tenants, _, _ = setup_saas
    end = datetime.now(timezone.utc) + timedelta(days=20)
    tenant, engine = reminder_setup(settings, tenants[0], end)
    mailer = Mock()
    mailer.send_customer_message.side_effect = RuntimeError("no SMTP")
    now = end - timedelta(days=20)
    try:
        assert send_due_reminder(engine, tenant, mailer, now=now) == "failed"
        assert send_due_reminder(engine, tenant, mailer, now=now + timedelta(hours=1)) == "retry_later"
        mailer.send_customer_message.side_effect = None
        mailer.send_customer_message.return_value = True
        assert send_due_reminder(engine, tenant, mailer, now=now + timedelta(hours=6)) == "sent"
        with Session(engine) as session:
            row = session.exec(select(SubscriptionReminder)).one()
            assert row.attempts == 2 and row.sent_at is not None
    finally:
        engine.dispose()


def test_worker_delivers_to_each_company_contact_and_deduplicates(setup_saas):
    settings, tenants, registry, _ = setup_saas
    now = datetime.now(timezone.utc)
    tenants = [tenant.model_copy(update={"subscription_email": f"owner-{tenant.slug}@example.com",
        "subscription_starts_at": now - timedelta(days=330),
        "subscription_ends_at": now + timedelta(days=30)}) for tenant in tenants]
    registry.write_text(TenantManifest(tenants=tenants).model_dump_json(), encoding="utf-8")
    mailer = Mock()
    mailer.send_customer_message.return_value = True
    assert run_once(settings, now=now, mailer_factory=lambda _: mailer) == {"sent": 2}
    assert run_once(settings, now=now, mailer_factory=lambda _: mailer) == {"already_sent": 2}
    recipients = {call.kwargs["recipient"] for call in mailer.send_customer_message.call_args_list}
    assert recipients == {"owner-alpha@example.com", "owner-beta@example.com"}


def test_subscription_columns_migrate_without_losing_existing_company():
    from sqlalchemy import text
    from app.db import create_db_and_tables, create_db_engine
    from app.config import Settings
    from app.models import CompanyAccount
    from app.security import hash_password
    engine = create_db_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("""CREATE TABLE company_account (
            id INTEGER PRIMARY KEY, slug VARCHAR(64), name VARCHAR(120), plan VARCHAR(32),
            status VARCHAR(16), seat_limit INTEGER, monthly_request_limit INTEGER,
            trial_ends_at TIMESTAMP, created_at TIMESTAMP, updated_at TIMESTAMP)"""))
        connection.execute(text("""INSERT INTO company_account
            (id,slug,name,plan,status,created_at,updated_at)
            VALUES (1,'sunyapi','Preserved Company','legacy','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"""))
    create_db_and_tables(engine, settings=Settings(environment="test", admin_password_hash=hash_password("test password 123")))
    with Session(engine) as session:
        account = session.get(CompanyAccount, 1)
        assert account.name == "Preserved Company"
        assert account.subscription_ends_at is None
    engine.dispose()
