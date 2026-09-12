from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine


def create_db_engine(database_url: str) -> Engine:
    options: dict[str, object] = {"pool_pre_ping": True}

    if database_url.startswith("sqlite"):
        options["connect_args"] = {"check_same_thread": False}
        if database_url in {"sqlite://", "sqlite:///:memory:"}:
            options["poolclass"] = StaticPool

    return create_engine(database_url, **options)


def create_db_and_tables(engine: Engine) -> None:
    # Import registers the catalog tables before metadata creation.
    from .catalog import seed_catalog
    from .models import SiteBranding

    SQLModel.metadata.create_all(engine)
    _ensure_catalog_field_numeric_columns(engine)
    seed_catalog(engine)
    with Session(engine) as session:
        if session.get(SiteBranding, 1) is None:
            session.add(SiteBranding())
            session.commit()


def _ensure_catalog_field_numeric_columns(engine: Engine) -> None:
    """Upgrade pre-existing deployments without requiring a destructive reset."""

    columns = {column["name"] for column in inspect(engine).get_columns("catalog_fields")}
    statements = {
        "unit": "ALTER TABLE catalog_fields ADD COLUMN unit VARCHAR(16) NOT NULL DEFAULT ''",
        "min_value": "ALTER TABLE catalog_fields ADD COLUMN min_value DOUBLE PRECISION NULL",
        "max_value": "ALTER TABLE catalog_fields ADD COLUMN max_value DOUBLE PRECISION NULL",
        "step": "ALTER TABLE catalog_fields ADD COLUMN step DOUBLE PRECISION NULL",
    }
    missing = [statement for name, statement in statements.items() if name not in columns]
    if not missing:
        return
    with engine.begin() as connection:
        for statement in missing:
            connection.execute(text(statement))
