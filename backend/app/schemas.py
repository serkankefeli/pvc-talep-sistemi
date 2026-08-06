from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Annotated, Literal
from urllib.parse import urlparse

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StrictBool,
    StrictStr,
    field_validator,
    model_validator,
)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


_CATALOG_KEY_RE = re.compile(r"^[a-z][a-z0-9_]{1,63}$")
_CATALOG_VALUE_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
_FORBIDDEN_COMMERCIAL_TERMS = (
    "price",
    "cost",
    "margin",
    "markup",
    "discount",
    "amount",
    "quote",
    "currency",
    "bom",
    "formula",
    "fiyat",
    "maliyet",
    "marj",
    "iskonto",
)
_RESERVED_KEYS = {
    "catalog_answers",
    "constructor",
    "divisions",
    "drawing_version",
    "height_mm",
    "panels",
    "prototype",
    "product_type",
    "proto",
    "quantity",
    "script",
    "style",
    "html",
    "svg",
    "href",
    "src",
    "width_mm",
    "onerror",
    "onload",
}


def validate_plain_text(value: str) -> str:
    if any(ord(character) < 32 or ord(character) == 127 for character in value):
        raise ValueError("Control characters are not permitted")
    lowered = value.lower()
    if (
        "<" in value
        or ">" in value
        or "{{" in value
        or "}}" in value
        or "javascript:" in lowered
    ):
        raise ValueError("HTML, templates and executable content are not permitted")
    return value


_CURRENCY_MARKER_RE = re.compile(
    r"(?:₺|€|\$|\b(?:tl|try|usd|eur)\b)",
    flags=re.IGNORECASE,
)


def validate_public_catalog_text(value: str) -> str:
    """Keep commercial data outside every administrator-managed public text."""

    validate_plain_text(value)
    lowered = value.lower()
    if any(term in lowered for term in _FORBIDDEN_COMMERCIAL_TERMS):
        raise ValueError("Commercial or internal calculation text is not permitted")
    if _CURRENCY_MARKER_RE.search(value):
        raise ValueError("Currency values are not permitted in public catalog text")
    return value


def validate_catalog_key(value: str) -> str:
    if not _CATALOG_KEY_RE.fullmatch(value):
        raise ValueError("Key must be a lowercase ASCII slug")
    if value in _RESERVED_KEYS or value.startswith("on"):
        raise ValueError("Reserved key is not permitted")
    if any(term in value for term in _FORBIDDEN_COMMERCIAL_TERMS):
        raise ValueError("Commercial or internal calculation keys are not permitted")
    return value


def validate_catalog_value(value: str) -> str:
    if not _CATALOG_VALUE_RE.fullmatch(value):
        raise ValueError("Option value must be a lowercase ASCII slug")
    if value in {"constructor", "prototype", "proto"}:
        raise ValueError("Reserved option value is not permitted")
    if any(term in value for term in _FORBIDDEN_COMMERCIAL_TERMS):
        raise ValueError("Commercial or internal calculation values are not permitted")
    return value


def validate_section_image_url(value: str) -> str:
    if len(value) > 2048:
        raise ValueError("Section image URLs cannot exceed 2048 characters")
    parsed = urlparse(value)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or parsed.username
        or parsed.password
    ):
        raise ValueError("Section images must use an absolute HTTP(S) URL")
    return value


CatalogKey = Annotated[str, AfterValidator(validate_catalog_key)]
CatalogValue = Annotated[str, AfterValidator(validate_catalog_value)]
PlainText = Annotated[str, AfterValidator(validate_plain_text)]
PublicCatalogText = Annotated[str, AfterValidator(validate_public_catalog_text)]
SectionImageUrl = Annotated[str, AfterValidator(validate_section_image_url)]
CatalogAnswerValue = StrictStr | StrictBool


class PreferredContact(str, Enum):
    PHONE = "phone"
    EMAIL = "email"


class ProductType(str, Enum):
    PVC_WINDOW = "pvc_window"
    PVC_DOOR = "pvc_door"
    FLYSCREEN = "flyscreen"
    FACADE_CLADDING = "facade_cladding"
    GUILLOTINE_GLASS = "guillotine_glass"
    BALCONY_ENCLOSURE = "balcony_enclosure"


BUILT_IN_PRODUCT_KEYS = frozenset(product.value for product in ProductType)


class RequestStatus(str, Enum):
    NEW = "new"
    REVIEWING = "reviewing"
    CONTACTED = "contacted"
    QUOTED = "quoted"
    WON = "won"
    LOST = "lost"
    CANCELLED = "cancelled"


class CustomerContactCreate(StrictModel):
    full_name: str = Field(min_length=2, max_length=120)
    company_name: str | None = Field(default=None, max_length=160)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, min_length=7, max_length=32)
    preferred_contact: PreferredContact
    city: str | None = Field(default=None, max_length=80)
    district: str | None = Field(default=None, max_length=80)

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if not re.fullmatch(r"[+0-9()\-\s.]+", value):
            raise ValueError("Phone number contains unsupported characters")
        digits = re.sub(r"\D", "", value)
        if not 7 <= len(digits) <= 15:
            raise ValueError("Phone number must contain 7 to 15 digits")
        return value

    @model_validator(mode="after")
    def validate_contact_channel(self) -> "CustomerContactCreate":
        if not self.email and not self.phone:
            raise ValueError("At least one e-mail address or phone number is required")
        if self.preferred_contact == PreferredContact.EMAIL and not self.email:
            raise ValueError("E-mail is required when preferred contact is e-mail")
        if self.preferred_contact == PreferredContact.PHONE and not self.phone:
            raise ValueError("Phone is required when preferred contact is phone")
        return self


class DivisionLine(StrictModel):
    axis: Literal["horizontal", "vertical"]
    position_percent: float = Field(gt=0, lt=100)


class JoineryPanel(StrictModel):
    slot: CatalogValue = Field(max_length=32)
    label: PlainText = Field(min_length=1, max_length=40)
    role: Literal["window", "door"]
    x_percent: float = Field(ge=0, lt=100)
    y_percent: float = Field(ge=0, lt=100)
    width_percent: float = Field(gt=0, le=100)
    height_percent: float = Field(gt=0, le=100)
    opening: Literal["fixed", "turn", "tilt", "tilt_turn", "sliding"]
    hinge: Literal["none", "left", "right"]

    @model_validator(mode="after")
    def validate_geometry_and_opening(self) -> "JoineryPanel":
        epsilon = 1e-6
        if self.x_percent + self.width_percent > 100 + epsilon:
            raise ValueError("Panel width must stay inside the joinery bounds")
        if self.y_percent + self.height_percent > 100 + epsilon:
            raise ValueError("Panel height must stay inside the joinery bounds")

        if self.opening in {"fixed", "tilt", "sliding"} and self.hinge != "none":
            raise ValueError(f"{self.opening} panels cannot have a hinge side")
        if self.opening in {"turn", "tilt_turn"} and self.hinge == "none":
            raise ValueError(f"{self.opening} panels require a left or right hinge")
        return self


class ProfileSpec(StrictModel):
    edge_profile_mm: int = Field(ge=0, le=500)
    mullion_profile_mm: int = Field(ge=0, le=500)
    corner_profile_mm: int = Field(ge=0, le=500)
    top_profile_mm: int = Field(ge=0, le=500)
    bottom_profile_mm: int = Field(ge=0, le=500)
    mounting_gap_mm: int = Field(ge=0, le=100)
    min_glass_width_mm: int = Field(ge=100, le=3000)
    target_glass_width_mm: int = Field(ge=100, le=3000)
    max_glass_width_mm: int = Field(ge=100, le=3000)
    min_panel_count: int = Field(ge=1, le=64)
    max_panel_count: int = Field(ge=1, le=64)

    @model_validator(mode="after")
    def validate_ranges(self) -> "ProfileSpec":
        if not (
            self.min_glass_width_mm
            <= self.target_glass_width_mm
            <= self.max_glass_width_mm
        ):
            raise ValueError(
                "Glass widths must satisfy min_glass_width_mm <= "
                "target_glass_width_mm <= max_glass_width_mm"
            )
        if self.min_panel_count > self.max_panel_count:
            raise ValueError("min_panel_count cannot exceed max_panel_count")
        return self


class ProductItemBase(StrictModel):
    width_mm: int
    height_mm: int
    quantity: int = Field(default=1, ge=1, le=100)
    color: str = Field(default="white", min_length=1, max_length=80)
    profile_series: str | None = Field(default=None, max_length=120)
    profile_spec: ProfileSpec | None = None
    notes: str | None = Field(default=None, max_length=1000)
    drawing_version: Literal["1", "2"] = "1"
    catalog_answers: dict[CatalogKey, CatalogAnswerValue] = Field(
        default_factory=dict,
        max_length=30,
    )

    @field_validator("catalog_answers")
    @classmethod
    def validate_catalog_answers(
        cls,
        value: dict[str, CatalogAnswerValue],
    ) -> dict[str, CatalogAnswerValue]:
        for answer in value.values():
            if isinstance(answer, str):
                if len(answer) > 500:
                    raise ValueError("Catalog text answers cannot exceed 500 characters")
                validate_plain_text(answer)
        return value


class WindowItemCreate(ProductItemBase):
    product_type: Literal[ProductType.PVC_WINDOW] = ProductType.PVC_WINDOW
    width_mm: int = Field(ge=300, le=6000)
    height_mm: int = Field(ge=300, le=4000)
    layout: Literal[
        "fixed",
        "single_sash",
        "double_sash",
        "tilt_turn",
        "transom",
        "custom_grid",
        "window_door",
        "door_window",
        "window_door_window",
    ]
    opening_direction: Literal["none", "left", "right", "inward", "outward"]
    glazing: str = Field(default="double_glazing", min_length=1, max_length=100)
    divisions: list[DivisionLine] = Field(default_factory=list, max_length=12)
    panels: list[JoineryPanel] = Field(default_factory=list, max_length=16)


class DoorItemCreate(ProductItemBase):
    product_type: Literal[ProductType.PVC_DOOR] = ProductType.PVC_DOOR
    width_mm: int = Field(ge=500, le=6000)
    height_mm: int = Field(ge=1500, le=4000)
    layout: Literal[
        "single",
        "double",
        "balcony",
        "sliding",
        "window_door",
        "door_window",
        "window_door_window",
    ]
    opening_direction: Literal["left", "right", "inward", "outward", "sliding"]
    glazing: str | None = Field(default=None, max_length=100)
    threshold: CatalogValue = "standard"
    divisions: list[DivisionLine] = Field(default_factory=list, max_length=12)
    panels: list[JoineryPanel] = Field(default_factory=list, max_length=16)


class FlyscreenItemCreate(ProductItemBase):
    product_type: Literal[ProductType.FLYSCREEN] = ProductType.FLYSCREEN
    width_mm: int = Field(ge=200, le=4000)
    height_mm: int = Field(ge=200, le=4000)
    screen_type: Literal["fixed", "hinged", "sliding", "roller", "pleated"]
    mesh_type: CatalogValue = "standard"


class FacadeCladdingItemCreate(ProductItemBase):
    product_type: Literal[ProductType.FACADE_CLADDING] = ProductType.FACADE_CLADDING
    width_mm: int = Field(ge=500, le=50_000)
    height_mm: int = Field(ge=500, le=50_000)
    cladding_type: CatalogValue
    panel_orientation: Literal["horizontal", "vertical", "mixed"]
    installation_system: CatalogValue
    insulation_required: bool = False
    substructure_material: CatalogValue = "unspecified"


class GuillotineGlassItemCreate(ProductItemBase):
    product_type: Literal[ProductType.GUILLOTINE_GLASS] = (
        ProductType.GUILLOTINE_GLASS
    )
    width_mm: int = Field(ge=600, le=6000)
    height_mm: int = Field(ge=1000, le=5000)
    system_type: CatalogValue
    panel_count: Literal[2, 3, 4]
    glass_type: CatalogValue
    bottom_fixed: bool


class BalconySegment(StrictModel):
    label: PlainText = Field(min_length=1, max_length=40)
    width_mm: int = Field(ge=300, le=30_000)
    turn_degrees: Literal[-90, 0, 90] = 0


class BalconyEnclosureItemCreate(ProductItemBase):
    product_type: Literal[ProductType.BALCONY_ENCLOSURE] = (
        ProductType.BALCONY_ENCLOSURE
    )
    width_mm: int = Field(ge=1000, le=30_000)
    height_mm: int = Field(ge=1000, le=4000)
    system_type: Literal["sliding", "folding", "guillotine", "pvc_joinery"]
    enclosure_shape: CatalogValue
    roof_required: bool
    parapet_type: CatalogValue
    segments: list[BalconySegment] = Field(default_factory=list, max_length=8)
    @model_validator(mode="after")
    def validate_balcony_segments(self) -> "BalconyEnclosureItemCreate":
        # Empty segments remain valid for requests created by the earlier client.
        if not self.segments:
            return self

        if self.segments[0].width_mm != self.width_mm:
            raise ValueError("The first balcony segment must match width_mm")
        if self.segments[0].turn_degrees != 0:
            raise ValueError("The first balcony segment cannot have a turn")
        if sum(segment.width_mm for segment in self.segments) > 60_000:
            raise ValueError("The total balcony segment length cannot exceed 60000 mm")

        expected_counts = {
            "straight": 1,
            "l_shape": 2,
            "u_shape": 3,
        }
        expected_count = expected_counts.get(self.enclosure_shape)
        if expected_count is not None and len(self.segments) != expected_count:
            raise ValueError(
                f"{self.enclosure_shape} requires exactly {expected_count} balcony segments"
            )
        if expected_count is None and not 2 <= len(self.segments) <= 8:
            raise ValueError("A custom balcony plan requires 2 to 8 segments")

        turns = [segment.turn_degrees for segment in self.segments[1:]]
        if self.enclosure_shape == "l_shape" and turns[0] == 0:
            raise ValueError("An L-shaped balcony requires a left or right turn")
        if self.enclosure_shape == "u_shape":
            if 0 in turns or turns[0] != turns[1]:
                raise ValueError("A U-shaped balcony requires two matching corner turns")
        return self


class CustomProductItemCreate(ProductItemBase):
    """Safe, catalog-driven payload for products created by an administrator."""

    product_type: CatalogKey = Field(max_length=64)
    width_mm: int = Field(ge=100, le=50_000)
    height_mm: int = Field(ge=100, le=50_000)
    color: PlainText = Field(default="white", min_length=1, max_length=80)
    profile_series: PlainText | None = Field(default=None, max_length=120)
    notes: PlainText | None = Field(default=None, max_length=1000)

    @field_validator("product_type")
    @classmethod
    def reject_built_in_product_fallback(cls, value: str) -> str:
        if value in BUILT_IN_PRODUCT_KEYS:
            raise ValueError(
                "Built-in products must use their product-specific configuration."
            )
        return value


BuiltInProductItemCreate = Annotated[
    WindowItemCreate
    | DoorItemCreate
    | FlyscreenItemCreate
    | FacadeCladdingItemCreate
    | GuillotineGlassItemCreate
    | BalconyEnclosureItemCreate,
    Field(discriminator="product_type"),
]

ProductItemCreate = BuiltInProductItemCreate | CustomProductItemCreate


class PublicRequestCreate(StrictModel):
    contact: CustomerContactCreate
    items: list[ProductItemCreate] = Field(min_length=1, max_length=50)
    project_note: str | None = Field(default=None, max_length=3000)
    privacy_consent: Literal[True]


class PublicRequestCreated(StrictModel):
    request_number: str
    status: Literal["received"] = "received"
    message: str


class AdminLoginRequest(StrictModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=512)


class AdminTokenResponse(StrictModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int


class AdminRequestSummary(StrictModel):
    id: int
    request_number: str
    status: RequestStatus
    customer_name: str
    company_name: str | None
    customer_email: EmailStr | None
    customer_phone: str | None
    preferred_contact: PreferredContact
    product_count: int
    favorite: bool
    quoted_amount: Decimal | None
    quote_currency: Literal["TRY"]
    created_at: datetime
    updated_at: datetime


class AdminRequestList(StrictModel):
    items: list[AdminRequestSummary]
    total: int
    limit: int
    offset: int


class AdminRequestDetail(StrictModel):
    id: int
    request_number: str
    status: RequestStatus
    contact: CustomerContactCreate
    project_note: str | None
    privacy_consent: bool
    items: list[ProductItemCreate]
    favorite: bool
    internal_notes: str | None
    quoted_amount: Decimal | None
    quote_currency: Literal["TRY"]
    admin_notification_state: str
    admin_notified_at: datetime | None
    customer_email_sent_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AdminRequestUpdate(StrictModel):
    status: RequestStatus | None = None
    internal_notes: str | None = Field(default=None, max_length=10_000)
    quoted_amount: Decimal | None = Field(
        default=None,
        ge=0,
        max_digits=14,
        decimal_places=2,
    )

    @model_validator(mode="after")
    def reject_empty_patch(self) -> "AdminRequestUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one field must be supplied")
        return self


class AdminRequestFavoriteState(StrictModel):
    request_id: int
    favorite: bool


class CustomerEmailSend(StrictModel):
    subject: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=10_000)
    include_quote: bool = False

    @field_validator("subject")
    @classmethod
    def reject_header_injection(cls, value: str) -> str:
        if "\r" in value or "\n" in value:
            raise ValueError("Subject cannot contain line breaks")
        return value


class CustomerEmailSent(StrictModel):
    status: Literal["sent"] = "sent"
    sent_at: datetime


class HealthResponse(StrictModel):
    status: Literal["ok"] = "ok"


CatalogFieldType = Literal["select", "boolean", "text"]
MeasurementVariant = Literal["opening", "facade", "balcony"]


class CatalogMeasurementPublic(StrictModel):
    variant: MeasurementVariant
    width_instruction: str
    height_instruction: str
    short_width_label: str
    short_height_label: str


class CatalogOptionDetails(StrictModel):
    description: PublicCatalogText = Field(default="", max_length=1000)
    features: list[PublicCatalogText] = Field(default_factory=list, max_length=12)
    section_image_urls: list[SectionImageUrl] = Field(default_factory=list, max_length=4)
    profile_spec: ProfileSpec | None = None

    @field_validator("features")
    @classmethod
    def validate_features(cls, value: list[str]) -> list[str]:
        if any(not feature or len(feature) > 160 for feature in value):
            raise ValueError("Each feature must contain 1 to 160 characters")
        if len(set(value)) != len(value):
            raise ValueError("Features cannot be repeated")
        return value

    @field_validator("section_image_urls")
    @classmethod
    def validate_section_images(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("Section image URLs cannot be repeated")
        return value


class CatalogOptionPublic(CatalogOptionDetails):
    id: int
    value: str
    label: str
    sort_order: int


class CatalogFieldPublic(StrictModel):
    id: int
    key: str
    label: str
    help_text: str
    field_type: CatalogFieldType
    required: bool
    sort_order: int
    options: list[CatalogOptionPublic]


class CatalogProductPublic(StrictModel):
    key: str
    name: str
    description: str
    mark: str
    sort_order: int
    measurement: CatalogMeasurementPublic
    fields: list[CatalogFieldPublic]


class PublicCatalogResponse(StrictModel):
    products: list[CatalogProductPublic]


class CatalogProductCreate(StrictModel):
    key: CatalogKey = Field(max_length=64)
    name: PublicCatalogText = Field(min_length=1, max_length=120)
    description: PublicCatalogText = Field(min_length=1, max_length=1000)
    mark: PublicCatalogText = Field(min_length=1, max_length=8)
    active: bool = False
    sort_order: int = Field(default=0, ge=-10_000, le=10_000)
    measurement_variant: MeasurementVariant
    width_instruction: PublicCatalogText = Field(min_length=1, max_length=300)
    height_instruction: PublicCatalogText = Field(min_length=1, max_length=300)
    short_width_label: PublicCatalogText = Field(min_length=1, max_length=80)
    short_height_label: PublicCatalogText = Field(min_length=1, max_length=80)


class CatalogProductUpdate(StrictModel):
    name: PublicCatalogText | None = Field(default=None, min_length=1, max_length=120)
    description: PublicCatalogText | None = Field(
        default=None,
        min_length=1,
        max_length=1000,
    )
    mark: PublicCatalogText | None = Field(default=None, min_length=1, max_length=8)
    active: bool | None = None
    sort_order: int | None = Field(default=None, ge=-10_000, le=10_000)
    measurement_variant: MeasurementVariant | None = None
    width_instruction: PublicCatalogText | None = Field(
        default=None,
        min_length=1,
        max_length=300,
    )
    height_instruction: PublicCatalogText | None = Field(
        default=None,
        min_length=1,
        max_length=300,
    )
    short_width_label: PublicCatalogText | None = Field(
        default=None,
        min_length=1,
        max_length=80,
    )
    short_height_label: PublicCatalogText | None = Field(
        default=None,
        min_length=1,
        max_length=80,
    )

    @model_validator(mode="after")
    def reject_empty_patch(self) -> "CatalogProductUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one field must be supplied")
        if any(getattr(self,field) is None for field in self.model_fields_set):
            raise ValueError("Catalog product fields cannot be null")
        return self


class CatalogProductAdmin(CatalogProductCreate):
    pass


class CatalogFieldCreate(StrictModel):
    key: CatalogKey = Field(max_length=64)
    label: PublicCatalogText = Field(min_length=1, max_length=120)
    help_text: PublicCatalogText = Field(default="", max_length=500)
    field_type: CatalogFieldType
    required: bool = False
    active: bool = True
    sort_order: int = Field(default=0, ge=-10_000, le=10_000)


class CatalogFieldUpdate(StrictModel):
    label: PublicCatalogText | None = Field(default=None, min_length=1, max_length=120)
    help_text: PublicCatalogText | None = Field(default=None, max_length=500)
    field_type: CatalogFieldType | None = None
    required: bool | None = None
    active: bool | None = None
    sort_order: int | None = Field(default=None, ge=-10_000, le=10_000)

    @model_validator(mode="after")
    def reject_empty_patch(self) -> "CatalogFieldUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one field must be supplied")
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Catalog field values cannot be null")
        return self


class CatalogFieldAdmin(CatalogFieldCreate):
    id: int
    product_key: str


class CatalogOptionCreate(CatalogOptionDetails):
    value: CatalogValue = Field(max_length=64)
    label: PublicCatalogText = Field(min_length=1, max_length=120)
    active: bool = True
    sort_order: int = Field(default=0, ge=-10_000, le=10_000)


class CatalogOptionUpdate(StrictModel):
    label: PublicCatalogText | None = Field(default=None, min_length=1, max_length=120)
    description: PublicCatalogText | None = Field(default=None, max_length=1000)
    features: list[PublicCatalogText] | None = Field(default=None, max_length=12)
    section_image_urls: list[SectionImageUrl] | None = Field(default=None, max_length=4)
    profile_spec: ProfileSpec | None = None
    active: bool | None = None
    sort_order: int | None = Field(default=None, ge=-10_000, le=10_000)

    @field_validator("features")
    @classmethod
    def validate_features(cls, value: list[str] | None) -> list[str] | None:
        if value is not None:
            if any(not feature or len(feature) > 160 for feature in value):
                raise ValueError("Each feature must contain 1 to 160 characters")
            if len(set(value)) != len(value):
                raise ValueError("Features cannot be repeated")
        return value

    @field_validator("section_image_urls")
    @classmethod
    def validate_section_images(cls, value: list[str] | None) -> list[str] | None:
        if value is not None and len(set(value)) != len(value):
            raise ValueError("Section image URLs cannot be repeated")
        return value

    @model_validator(mode="after")
    def reject_empty_patch(self) -> "CatalogOptionUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one field must be supplied")
        if any(
            getattr(self, field) is None
            for field in self.model_fields_set
            if field != "profile_spec"
        ):
            raise ValueError("Catalog option values cannot be null")
        return self


class CatalogOptionAdmin(CatalogOptionCreate):
    id: int
    field_id: int
