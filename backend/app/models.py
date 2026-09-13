from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import JSON, Column, Numeric, Text, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class QuoteRequest(SQLModel, table=True):
    __tablename__ = "quote_requests"

    id: int | None = Field(default=None, primary_key=True)
    request_number: str = Field(max_length=40, unique=True, index=True)
    status: str = Field(default="new", max_length=32, index=True)

    customer_name: str = Field(max_length=120, index=True)
    company_name: str | None = Field(default=None, max_length=160)
    customer_email: str | None = Field(default=None, max_length=254, index=True)
    customer_phone: str | None = Field(default=None, max_length=32, index=True)
    preferred_contact: str = Field(max_length=16)
    city: str | None = Field(default=None, max_length=80)
    district: str | None = Field(default=None, max_length=80)
    project_note: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
    )
    privacy_consent: bool = Field(default=False)

    internal_notes: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
    )
    quoted_amount: Decimal | None = Field(
        default=None,
        sa_column=Column(Numeric(14, 2), nullable=True),
    )
    quote_currency: str = Field(default="TRY", max_length=3)

    admin_notification_state: str = Field(default="pending", max_length=16)
    admin_notified_at: datetime | None = None
    customer_email_sent_at: datetime | None = None
    created_at: datetime = Field(default_factory=utc_now, index=True)
    updated_at: datetime = Field(default_factory=utc_now)

    items: list["QuoteRequestItem"] = Relationship(
        back_populates="quote_request",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan",
            "lazy": "selectin",
        },
    )


class QuoteRequestItem(SQLModel, table=True):
    __tablename__ = "quote_request_items"

    id: int | None = Field(default=None, primary_key=True)
    quote_request_id: int = Field(
        foreign_key="quote_requests.id",
        index=True,
        ondelete="CASCADE",
    )
    product_type: str = Field(max_length=64, index=True)
    width_mm: int
    height_mm: int
    quantity: int
    configuration_json: dict[str, Any] = Field(
        sa_column=Column(JSON, nullable=False),
    )
    created_at: datetime = Field(default_factory=utc_now)

    quote_request: QuoteRequest | None = Relationship(back_populates="items")


class QuoteRequestRevision(SQLModel, table=True):
    """Immutable drawing snapshot created by an administrator."""

    __tablename__ = "quote_request_revisions"
    __table_args__ = (
        UniqueConstraint("quote_request_id", "revision_number"),
    )

    id: int | None = Field(default=None, primary_key=True)
    quote_request_id: int = Field(
        foreign_key="quote_requests.id",
        index=True,
        ondelete="CASCADE",
    )
    revision_number: int = Field(index=True)
    note: str = Field(sa_column=Column(Text, nullable=False))
    items_json: list[dict[str, Any]] = Field(sa_column=Column(JSON, nullable=False))
    created_by: str = Field(max_length=120)
    created_at: datetime = Field(default_factory=utc_now, index=True)


class AdminRequestFavorite(SQLModel, table=True):
    """A request pinned by one authenticated administrator."""

    __tablename__ = "admin_request_favorites"

    admin_username: str = Field(primary_key=True, max_length=120)
    quote_request_id: int = Field(
        primary_key=True,
        foreign_key="quote_requests.id",
        ondelete="CASCADE",
    )
    created_at: datetime = Field(default_factory=utc_now)


class CatalogProduct(SQLModel, table=True):
    __tablename__ = "catalog_products"

    key: str = Field(primary_key=True, max_length=64)
    name: str = Field(max_length=120)
    description: str = Field(sa_column=Column(Text, nullable=False))
    mark: str = Field(max_length=8)
    active: bool = Field(default=True, index=True)
    sort_order: int = Field(default=0, index=True)
    measurement_variant: str = Field(max_length=16)
    width_instruction: str = Field(max_length=300)
    height_instruction: str = Field(max_length=300)
    short_width_label: str = Field(max_length=80)
    short_height_label: str = Field(max_length=80)


class CatalogProductMaterial(SQLModel, table=True):
    """Admin-managed top-level material branch for a catalog product."""

    __tablename__ = "catalog_product_materials"

    product_key: str = Field(
        primary_key=True,
        foreign_key="catalog_products.key",
        max_length=64,
        ondelete="CASCADE",
    )
    material_group: str = Field(default="pvc", max_length=16, index=True)


class CatalogField(SQLModel, table=True):
    __tablename__ = "catalog_fields"
    __table_args__ = (
        UniqueConstraint(
            "product_key",
            "key",
            name="uq_catalog_fields_product_key_key",
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    product_key: str = Field(
        foreign_key="catalog_products.key",
        index=True,
        max_length=64,
        ondelete="RESTRICT",
    )
    key: str = Field(max_length=64)
    label: str = Field(max_length=120)
    help_text: str = Field(default="", max_length=500)
    placeholder: str = Field(default="", max_length=160)
    field_type: str = Field(max_length=16)
    unit: str = Field(default="", max_length=16)
    min_value: float | None = Field(default=None)
    max_value: float | None = Field(default=None)
    step: float | None = Field(default=None)
    required: bool = Field(default=False)
    active: bool = Field(default=True, index=True)
    sort_order: int = Field(default=0, index=True)


class CatalogOption(SQLModel, table=True):
    __tablename__ = "catalog_options"
    __table_args__ = (
        UniqueConstraint(
            "field_id",
            "value",
            name="uq_catalog_options_field_id_value",
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    field_id: int = Field(
        foreign_key="catalog_fields.id",
        index=True,
        ondelete="RESTRICT",
    )
    value: str = Field(max_length=64)
    label: str = Field(max_length=120)
    active: bool = Field(default=True, index=True)
    sort_order: int = Field(default=0, index=True)


class CatalogOptionDetail(SQLModel, table=True):
    """Optional public presentation details for a catalog option."""

    __tablename__ = "catalog_option_details"

    option_id: int = Field(
        primary_key=True,
        foreign_key="catalog_options.id",
        ondelete="CASCADE",
    )
    description: str = Field(
        default="",
        sa_column=Column(Text, nullable=False),
    )
    features_text: str = Field(
        default="",
        sa_column=Column(Text, nullable=False),
    )
    section_images_text: str = Field(
        default="",
        sa_column=Column(Text, nullable=False),
    )


class CatalogOptionVisual(SQLModel, table=True):
    """Dedicated selection-card artwork, kept separate from technical sections."""

    __tablename__ = "catalog_option_visuals"

    option_id: int = Field(
        primary_key=True,
        foreign_key="catalog_options.id",
        ondelete="CASCADE",
    )
    icon_url: str = Field(sa_column=Column(Text, nullable=False))


class CatalogOptionProfileSpec(SQLModel, table=True):
    """Physical dimensions used by the public, non-commercial simulation."""

    __tablename__ = "catalog_option_profile_specs"

    option_id: int = Field(
        primary_key=True,
        foreign_key="catalog_options.id",
        ondelete="CASCADE",
    )
    edge_profile_mm: int
    mullion_profile_mm: int
    corner_profile_mm: int
    top_profile_mm: int
    bottom_profile_mm: int
    mounting_gap_mm: int
    min_glass_width_mm: int
    target_glass_width_mm: int
    max_glass_width_mm: int
    min_panel_count: int
    max_panel_count: int


class SiteBranding(SQLModel, table=True):
    """Singleton site identity shared by the public and administrator interfaces."""

    __tablename__ = "site_branding"

    id: int = Field(default=1, primary_key=True)
    brand_name: str = Field(default="Proje Çizim", max_length=120)
    tagline: str = Field(
        default="Ölçünü gir, talebini görselleştir",
        max_length=200,
    )
    logo_filename: str | None = Field(default=None, max_length=120)
    logo_content_type: str | None = Field(default=None, max_length=32)
    logo_alt: str = Field(default="Proje Çizim logosu", max_length=160)
    logo_revision: int = Field(default=0, ge=0)
    updated_at: datetime = Field(default_factory=utc_now)
