from __future__ import annotations

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
    seed_catalog(engine)
    with Session(engine) as session:
        if session.get(SiteBranding, 1) is None:
            session.add(SiteBranding())
            session.commit()
