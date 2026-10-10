from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine, select

from .config import Settings
from .permissions import LEGACY_PERMISSIONS


def create_db_engine(database_url: str) -> Engine:
    options: dict[str, object] = {"pool_pre_ping": True}

    if database_url.startswith("sqlite"):
        options["connect_args"] = {"check_same_thread": False}
        if database_url in {"sqlite://", "sqlite:///:memory:"}:
            options["poolclass"] = StaticPool

    return create_engine(database_url, **options)


def create_db_and_tables(engine: Engine, *, settings: Settings | None = None) -> None:
    # Import registers the catalog tables before metadata creation.
    from .catalog import seed_catalog
    from .models import CompanyAccount, SiteBranding
    from .commerce import seed_commerce
    from .landing import seed_landing

    SQLModel.metadata.create_all(engine)
    _ensure_admin_permissions(engine)
    _ensure_subscription_columns(engine)
    with Session(engine) as session:
        account = session.get(CompanyAccount, 1)
        if account is not None and settings is not None and account.slug != settings.tenant_slug:
            raise ValueError("This database already belongs to a different company")
    _ensure_catalog_field_dynamic_columns(engine)
    if settings is not None:
        _ensure_bootstrap_admin(engine, settings)
    seed_catalog(engine)
    with Session(engine) as session:
        if settings is not None:
            account = session.get(CompanyAccount, 1)
            if account is None:
                session.add(CompanyAccount(slug=settings.tenant_slug, name=settings.tenant_name))
            elif account.slug != settings.tenant_slug:
                raise ValueError("This database already belongs to a different company")
        if session.get(SiteBranding, 1) is None:
            session.add(SiteBranding())
        seed_commerce(session)
        seed_landing(session)
        session.commit()


def _ensure_admin_permissions(engine: Engine) -> None:
    """Add permissions without resetting existing accounts or passwords."""
    import json
    columns = {column["name"] for column in inspect(engine).get_columns("admin_users")}
    if "permissions" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE admin_users ADD COLUMN permissions JSON NULL"))
            value = "CAST(:permissions AS JSON)" if engine.dialect.name == "postgresql" else ":permissions"
            connection.execute(text(f"UPDATE admin_users SET permissions = {value}"),
                               {"permissions": json.dumps(LEGACY_PERMISSIONS)})


def _ensure_subscription_columns(engine: Engine) -> None:
    columns = {column["name"] for column in inspect(engine).get_columns("company_account")}
    statements = {
        "subscription_starts_at": "ALTER TABLE company_account ADD COLUMN subscription_starts_at TIMESTAMP NULL",
        "subscription_ends_at": "ALTER TABLE company_account ADD COLUMN subscription_ends_at TIMESTAMP NULL",
        "subscription_email": "ALTER TABLE company_account ADD COLUMN subscription_email VARCHAR(254) NULL",
    }
    with engine.begin() as connection:
        for name, statement in statements.items():
            if name not in columns:
                connection.execute(text(statement))


def _ensure_bootstrap_admin(engine: Engine, settings: Settings) -> None:
    """Create the environment-defined administrator only on first deployment."""

    from .models import AdminUser

    with Session(engine) as session:
        if session.exec(select(AdminUser.id).limit(1)).first() is not None:
            return
        session.add(
            AdminUser(
                username=settings.admin_username.strip().casefold(),
                display_name="Sistem Yöneticisi",
                password_hash=settings.admin_password_hash,
                is_active=True,
                is_superuser=True,
            )
        )
        session.commit()


def _ensure_catalog_field_dynamic_columns(engine: Engine) -> None:
    """Upgrade pre-existing deployments without requiring a destructive reset."""

    columns = {column["name"] for column in inspect(engine).get_columns("catalog_fields")}
    statements = {
        "unit": "ALTER TABLE catalog_fields ADD COLUMN unit VARCHAR(16) NOT NULL DEFAULT ''",
        "min_value": "ALTER TABLE catalog_fields ADD COLUMN min_value DOUBLE PRECISION NULL",
        "max_value": "ALTER TABLE catalog_fields ADD COLUMN max_value DOUBLE PRECISION NULL",
        "step": "ALTER TABLE catalog_fields ADD COLUMN step DOUBLE PRECISION NULL",
        "placeholder": (
            "ALTER TABLE catalog_fields ADD COLUMN placeholder "
            "VARCHAR(160) NOT NULL DEFAULT ''"
        ),
    }
    missing_names = [name for name in statements if name not in columns]
    missing = [statements[name] for name in missing_names]
    if not missing:
        return
    with engine.begin() as connection:
        for statement in missing:
            connection.execute(text(statement))
        if "placeholder" in missing_names:
            connection.execute(
                text(
                    "UPDATE catalog_fields SET placeholder = 'Seriye göre' "
                    "WHERE field_type = 'number' AND key IN ("
                    "'frame_profile_width_mm', 'mullion_profile_width_mm', "
                    "'glazing_bar_width_mm', 'lock_height_mm', "
                    "'pivot_axis_offset_mm')"
                )
            )
