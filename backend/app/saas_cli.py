"""Operator-only company onboarding. Run inside the API container."""
from __future__ import annotations

import argparse
import getpass
import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy import inspect
from sqlmodel import Session, select

from .config import Settings
from .db import create_db_engine
from .models import AdminUser
from .saas import (
    PLANS, TenantDefinition, TenantManifest, initialize_tenant, load_manifest,
)
from .security import hash_password
from .company import annual_end, utc


def save_manifest(settings: Settings, tenants: list[TenantDefinition]) -> None:
    manifest = TenantManifest(tenants=tenants)
    path = Path(settings.saas_manifest_path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    # Validate upload paths and production rules before replacing the live file.
    fd, temporary = tempfile.mkstemp(prefix=".tenants-", suffix=".json", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(manifest.model_dump_json(indent=2))
            stream.write("\n")
        os.chmod(temporary, 0o600)
        check = settings.model_copy(update={"saas_manifest_path": temporary})
        load_manifest(check)
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Firma hesabı hazırlığı (sunucu operatörü)")
    subparsers = parser.add_subparsers(dest="command", required=True)
    register = subparsers.add_parser("register")
    register.add_argument("--slug", required=True)
    register.add_argument("--name", required=True)
    register.add_argument("--url", required=True)
    register.add_argument("--database-env", required=True, help="DB URL içeren ortam değişkeninin adı")
    register.add_argument("--plan", choices=PLANS, default="trial")
    register.add_argument("--trial-days", type=int, default=14)
    register.add_argument("--admin-username", default="admin")
    register.add_argument("--adopt-existing", action="store_true")
    register.add_argument("--password-stdin", action="store_true")
    register.add_argument("--subscription-email", help="Firma abonelik hatırlatma adresi")
    subparsers.add_parser("list")
    plan = subparsers.add_parser("set-plan")
    plan.add_argument("slug")
    plan.add_argument("plan", choices=PLANS)
    plan.add_argument("--trial-days", type=int, default=14)
    renewal = subparsers.add_parser("renew")
    renewal.add_argument("slug")
    renewal.add_argument("--subscription-email")
    for command in ("suspend", "resume"):
        status = subparsers.add_parser(command)
        status.add_argument("slug")
    args = parser.parse_args(argv)
    settings = Settings()
    path = Path(settings.saas_manifest_path)
    tenants = load_manifest(settings).tenants if path.exists() else []
    if args.command == "list":
        for tenant in tenants:
            print(f"{tenant.slug}\t{tenant.name}\t{tenant.public_url}\t{tenant.plan}\t{tenant.status}")
        return 0
    if args.command == "register":
        if any(tenant.slug == args.slug for tenant in tenants):
            raise ValueError("Company slug is already registered")
        database_url = os.environ.get(args.database_env)
        if not database_url:
            raise ValueError("Named database environment variable has no value")
        engine = create_db_engine(database_url)
        try:
            tables = inspect(engine).get_table_names()
            if args.adopt_existing:
                if "admin_users" not in tables:
                    raise ValueError("Existing user database is required for adoption")
                with Session(engine) as session:
                    admin = session.exec(select(AdminUser).where(
                        AdminUser.username == args.admin_username,
                        AdminUser.is_active.is_(True),
                        AdminUser.is_superuser.is_(True),
                    )).first()
                    if admin is None:
                        raise ValueError("An active company owner is required for adoption")
                    password_hash = admin.password_hash
            else:
                if tables:
                    raise ValueError("New company requires an empty, dedicated database")
                password = sys.stdin.readline().rstrip("\r\n") if args.password_stdin else getpass.getpass("İlk yönetici parolası (en az 12 karakter): ")
                if len(password) < 12:
                    raise ValueError("Password must be at least 12 characters")
                password_hash = hash_password(password)
        finally:
            engine.dispose()
        if not 1 <= args.trial_days <= 90:
            raise ValueError("Trial days must be between 1 and 90")
        started_at = datetime.now(timezone.utc)
        tenant = TenantDefinition(
            slug=args.slug, auth_id=uuid4(), name=args.name, public_url=args.url,
            database_url=database_url, plan=args.plan,
            admin_username=args.admin_username, admin_password_hash=password_hash,
            trial_ends_at=(datetime.now(timezone.utc) + timedelta(days=args.trial_days)) if args.plan == "trial" else None,
            subscription_starts_at=started_at if args.plan not in {"legacy", "trial"} else None,
            subscription_ends_at=annual_end(started_at) if args.plan not in {"legacy", "trial"} else None,
            subscription_email=args.subscription_email,
            branding_upload_dir=settings.branding_upload_dir if args.adopt_existing else None,
            smtp_host=settings.smtp_host if args.adopt_existing else "",
            smtp_port=settings.smtp_port,
            smtp_username=settings.smtp_username if args.adopt_existing else "",
            smtp_password=settings.smtp_password if args.adopt_existing else "",
            smtp_from_email=settings.smtp_from_email if args.adopt_existing else "",
            smtp_admin_email=settings.smtp_admin_email if args.adopt_existing else "",
            smtp_starttls=settings.smtp_starttls,
        )
        # Validate resources before any tenant database initialization.
        candidate = [*tenants, tenant]
        TenantManifest(tenants=candidate)
        # Validate all routing rules without exposing partially initialized tenants.
        fd, temporary = tempfile.mkstemp(suffix=".json")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                stream.write(TenantManifest(tenants=candidate).model_dump_json())
            load_manifest(settings.model_copy(update={"saas_manifest_path": temporary}))
        finally:
            Path(temporary).unlink(missing_ok=True)
        app = initialize_tenant(settings, tenant)
        app.state.engine.dispose()
        save_manifest(settings, candidate)
        print(f"Company registered: {tenant.slug} ({tenant.public_url})")
        return 0
    tenant = next((item for item in tenants if item.slug == args.slug), None)
    if tenant is None:
        raise ValueError("Company not found")
    if args.command == "renew":
        if tenant.plan in {"legacy", "trial"}:
            raise ValueError("Set a paid plan before annual renewal")
        now = datetime.now(timezone.utc)
        start = max(now, utc(tenant.subscription_ends_at)) if tenant.subscription_ends_at else now
        updated = tenant.model_copy(update={
            "subscription_starts_at": start,
            "subscription_ends_at": annual_end(start),
            "subscription_email": args.subscription_email or tenant.subscription_email,
        })
    elif args.command == "set-plan":
        if not 1 <= args.trial_days <= 90:
            raise ValueError("Trial days must be between 1 and 90")
        updated = tenant.model_copy(update={
            "plan": args.plan,
            "trial_ends_at": datetime.now(timezone.utc) + timedelta(days=args.trial_days) if args.plan == "trial" else None,
            "subscription_starts_at": (tenant.subscription_starts_at or datetime.now(timezone.utc)) if args.plan not in {"legacy", "trial"} else None,
            "subscription_ends_at": (tenant.subscription_ends_at or annual_end(datetime.now(timezone.utc))) if args.plan not in {"legacy", "trial"} else None,
        })
    else:
        updated = tenant.model_copy(update={"status": "suspended" if args.command == "suspend" else "active"})
    save_manifest(settings, [updated if item.slug == tenant.slug else item for item in tenants])
    print(f"Company updated: {tenant.slug}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        # Validation exceptions may include database URLs. Never dump their inputs.
        print("Company operation failed. Check parameters, database access and registry permissions.", file=sys.stderr)
        raise SystemExit(1)
