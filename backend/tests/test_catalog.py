from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func
from sqlmodel import Session, select

from app.catalog import seed_catalog
from app.config import Settings
from app.db import create_db_engine
from app.main import create_app
from app.models import (
    CatalogField,
    CatalogOption,
    CatalogOptionProfileSpec,
    CatalogProduct,
    CatalogProductMaterial,
)
from app.security import hash_password


@pytest.fixture
def catalog_context():
    settings = Settings(
        environment="test",
        database_url="sqlite://",
        cors_origins="https://quote.example.com",
        admin_username="administrator",
        admin_password_hash=hash_password("catalog test password"),
        jwt_secret="catalog-test-secret-longer-than-thirty-two-characters",
        public_rate_limit_requests=100,
        auth_rate_limit_requests=100,
    )
    engine = create_db_engine(settings.database_url)
    app = create_app(settings=settings, engine=engine)
    with TestClient(app) as client:
        yield client, engine


def _login(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/v1/admin/login",
        json={"username": "administrator", "password": "catalog test password"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _window_payload(
    *,
    color: str = "white",
    catalog_answers: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "contact": {
            "full_name": "Catalog Customer",
            "email": "catalog-customer@example.com",
            "preferred_contact": "email",
        },
        "items": [
            {
                "product_type": "pvc_window",
                "width_mm": 1200,
                "height_mm": 1300,
                "quantity": 1,
                "color": color,
                "layout": "single_sash",
                "opening_direction": "left",
                "glazing": "double_glazing",
                "divisions": [],
                "catalog_answers": catalog_answers or {},
            }
        ],
        "privacy_consent": True,
    }


def _mixed_joinery_panels() -> list[dict[str, Any]]:
    return [
        {
            "slot": "left_window",
            "label": "Sol pencere",
            "role": "window",
            "x_percent": 0,
            "y_percent": 20,
            "width_percent": 35,
            "height_percent": 80,
            "opening": "tilt_turn",
            "hinge": "left",
        },
        {
            "slot": "center_door",
            "label": "Balkon kapısı",
            "role": "door",
            "x_percent": 35,
            "y_percent": 0,
            "width_percent": 30,
            "height_percent": 100,
            "opening": "turn",
            "hinge": "right",
        },
        {
            "slot": "right_window",
            "label": "Sağ pencere",
            "role": "window",
            "x_percent": 65,
            "y_percent": 20,
            "width_percent": 35,
            "height_percent": 80,
            "opening": "fixed",
            "hinge": "none",
        },
    ]


def _joinery_payload(product_type: str = "pvc_window") -> dict[str, Any]:
    payload = _window_payload()
    item = payload["items"][0]
    item.update(
        {
            "drawing_version": "2",
            "layout": "window_door_window",
            "panels": _mixed_joinery_panels(),
        }
    )
    if product_type == "pvc_door":
        item.update(
            {
                "product_type": "pvc_door",
                "height_mm": 2200,
                "opening_direction": "left",
                "threshold": "standard",
            }
        )
    return payload


def _custom_product_payload(
    *,
    key: str,
    name: str,
    active: bool = False,
    material_group: str = "pvc",
) -> dict[str, Any]:
    return {
        "key": key,
        "material_group": material_group,
        "name": name,
        "description": f"{name} için yönlendirmeli ölçü talebi",
        "mark": name[:2].upper(),
        "active": active,
        "sort_order": 70,
        "measurement_variant": "opening",
        "width_instruction": "Açıklığın içten içe genişliğini ölçün.",
        "height_instruction": "Açıklığın içten içe yüksekliğini ölçün.",
        "short_width_label": "Açıklık genişliği",
        "short_height_label": "Açıklık yüksekliği",
    }


def _generic_request_payload(
    *,
    product_type: str = "pergola",
    catalog_answers: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "contact": {
            "full_name": "Custom Product Customer",
            "email": "custom-product@example.com",
            "preferred_contact": "email",
        },
        "items": [
            {
                "product_type": product_type,
                "width_mm": 4200,
                "height_mm": 2600,
                "quantity": 2,
                "color": "anthracite",
                "profile_series": None,
                "notes": "Motor seçeneği görüşülsün.",
                "drawing_version": "1",
                "catalog_answers": catalog_answers or {},
            }
        ],
        "privacy_consent": True,
    }


def _find_public_field(
    client: TestClient,
    product_key: str,
    field_key: str,
) -> dict[str, Any]:
    catalog = client.get("/api/v1/catalog")
    assert catalog.status_code == 200
    product = next(
        item for item in catalog.json()["products"] if item["key"] == product_key
    )
    return next(item for item in product["fields"] if item["key"] == field_key)


def _create_select_field(
    client: TestClient,
    headers: dict[str, str],
    *,
    key: str = "installation_area",
    required: bool = False,
) -> int:
    response = client.post(
        "/api/v1/admin/catalog/products/pvc_window/fields",
        headers=headers,
        json={
            "key": key,
            "label": "Montaj bölgesi",
            "help_text": "Uygulama alanını seçin.",
            "field_type": "select",
            "required": required,
            "active": True,
            "sort_order": 200,
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


def _create_option(
    client: TestClient,
    headers: dict[str, str],
    field_id: int,
    *,
    value: str = "coastal",
    label: str = "Sahil bölgesi",
) -> dict[str, Any]:
    response = client.post(
        f"/api/v1/admin/catalog/fields/{field_id}/options",
        headers=headers,
        json={
            "value": value,
            "label": label,
            "active": True,
            "sort_order": 10,
        },
    )
    assert response.status_code == 201
    return response.json()


def _resolve_refs(node: Any, document: dict[str, Any], seen: set[str] | None = None):
    seen = seen or set()
    if isinstance(node, list):
        return [_resolve_refs(item, document, seen.copy()) for item in node]
    if not isinstance(node, dict):
        return node
    if "$ref" in node:
        ref = node["$ref"]
        if ref in seen:
            return {}
        target: Any = document
        for part in ref.removeprefix("#/").split("/"):
            target = target[part]
        return _resolve_refs(target, document, seen | {ref})
    return {
        key: _resolve_refs(value, document, seen.copy())
        for key, value in node.items()
    }


def test_seed_is_idempotent_and_contains_all_products_and_guides(
    catalog_context,
) -> None:
    _, engine = catalog_context

    def counts() -> tuple[int, int, int]:
        with Session(engine) as session:
            return (
                int(
                    session.exec(
                        select(func.count()).select_from(CatalogProduct)
                    ).one()
                ),
                int(
                    session.exec(
                        select(func.count()).select_from(CatalogField)
                    ).one()
                ),
                int(
                    session.exec(
                        select(func.count()).select_from(CatalogOption)
                    ).one()
                ),
            )

    before = counts()
    seed_catalog(engine)
    seed_catalog(engine)
    after = counts()

    assert before == after
    assert before[0] == 10
    with Session(engine) as session:
        guided_count = session.exec(
            select(func.count())
            .select_from(CatalogField)
            .where(CatalogField.key.in_(["usage_primary", "usage_secondary", "usage_tertiary"]))
        ).one()
        material_count = session.exec(
            select(func.count()).select_from(CatalogProductMaterial)
        ).one()
    assert guided_count == 30
    assert material_count == 10


def test_seed_reconciles_new_pivot_fields_without_overwriting_admin_edits(
    catalog_context,
) -> None:
    _, engine = catalog_context
    new_field_keys = {
        "pivot_opening_direction",
        "pivot_vertical_mullion_count",
        "pivot_horizontal_mullion_count",
    }

    # Reproduce a database created before the pivot direction and decorative
    # glazing-bar fields were introduced. An unrelated admin edit must survive
    # the reconciliation unchanged.
    with Session(engine) as session:
        pivot_fields = session.exec(
            select(CatalogField).where(CatalogField.product_key == "pivot_system")
        ).all()
        lock_field = next(field for field in pivot_fields if field.key == "lock_type")
        lock_field.label = "Yöneticiye özel kilit etiketi"
        session.add(lock_field)

        fields_to_remove = [
            field for field in pivot_fields if field.key in new_field_keys
        ]
        field_ids = [field.id for field in fields_to_remove if field.id is not None]
        if field_ids:
            for option in session.exec(
                select(CatalogOption).where(CatalogOption.field_id.in_(field_ids))
            ).all():
                session.delete(option)
        for field in fields_to_remove:
            session.delete(field)
        session.commit()

    seed_catalog(engine)
    seed_catalog(engine)

    with Session(engine) as session:
        reconciled_fields = session.exec(
            select(CatalogField).where(CatalogField.product_key == "pivot_system")
        ).all()
        fields_by_key = {field.key: field for field in reconciled_fields}

        assert new_field_keys <= fields_by_key.keys()
        assert fields_by_key["lock_type"].label == "Yöneticiye özel kilit etiketi"
        assert fields_by_key["pivot_opening_direction"].required is True
        assert fields_by_key["pivot_vertical_mullion_count"].required is False
        assert fields_by_key["pivot_horizontal_mullion_count"].required is False

        opening_field = fields_by_key["pivot_opening_direction"]
        opening_options = session.exec(
            select(CatalogOption)
            .where(CatalogOption.field_id == opening_field.id)
            .order_by(CatalogOption.sort_order, CatalogOption.id)
        ).all()
        assert [option.value for option in opening_options] == ["side", "up"]

        field_counts = {
            key: sum(field.key == key for field in reconciled_fields)
            for key in new_field_keys
        }
        assert field_counts == {key: 1 for key in new_field_keys}


@pytest.mark.parametrize("product_type", ["pvc_window", "pvc_door"])
def test_joinery_panels_round_trip_for_window_and_door(
    catalog_context,
    product_type: str,
) -> None:
    client, _ = catalog_context
    headers = _login(client)
    payload = _joinery_payload(product_type)

    created = client.post("/api/v1/requests", json=payload)
    assert created.status_code == 202

    listed = client.get("/api/v1/admin/requests", headers=headers)
    assert listed.status_code == 200
    request_id = listed.json()["items"][0]["id"]
    detail = client.get(f"/api/v1/admin/requests/{request_id}", headers=headers)
    assert detail.status_code == 200
    stored_item = detail.json()["items"][0]
    assert stored_item["product_type"] == product_type
    assert stored_item["drawing_version"] == "2"
    assert stored_item["layout"] == "window_door_window"
    assert stored_item["panels"] == payload["items"][0]["panels"]


def test_legacy_joinery_without_panels_remains_accepted(catalog_context) -> None:
    client, _ = catalog_context
    headers = _login(client)

    created = client.post("/api/v1/requests", json=_window_payload())
    assert created.status_code == 202

    listed = client.get("/api/v1/admin/requests", headers=headers).json()
    request_id = listed["items"][0]["id"]
    detail = client.get(f"/api/v1/admin/requests/{request_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["items"][0]["drawing_version"] == "1"
    assert detail.json()["items"][0]["panels"] == []


@pytest.mark.parametrize(
    ("coordinate", "value"),
    [("x_percent", 80), ("y_percent", 80)],
)
def test_joinery_panel_must_stay_inside_normalized_bounds(
    catalog_context,
    coordinate: str,
    value: int,
) -> None:
    client, _ = catalog_context
    payload = _joinery_payload()
    panel = payload["items"][0]["panels"][0]
    panel[coordinate] = value

    response = client.post("/api/v1/requests", json=payload)
    assert response.status_code == 422


@pytest.mark.parametrize(
    ("opening", "hinge"),
    [
        ("fixed", "left"),
        ("tilt", "right"),
        ("sliding", "left"),
        ("turn", "none"),
        ("tilt_turn", "none"),
    ],
)
def test_joinery_panel_opening_and_hinge_rules_are_enforced(
    catalog_context,
    opening: str,
    hinge: str,
) -> None:
    client, _ = catalog_context
    payload = _joinery_payload()
    panel = payload["items"][0]["panels"][0]
    panel.update({"opening": opening, "hinge": hinge})

    response = client.post("/api/v1/requests", json=payload)
    assert response.status_code == 422


def test_joinery_panels_are_bounded_and_reserved(catalog_context) -> None:
    client, _ = catalog_context
    payload = _joinery_payload()
    base_panel = {
        "label": "Sabit bölüm",
        "role": "window",
        "x_percent": 0,
        "y_percent": 0,
        "width_percent": 1,
        "height_percent": 1,
        "opening": "fixed",
        "hinge": "none",
    }
    payload["items"][0]["panels"] = [
        {**base_panel, "slot": f"panel_{index}"} for index in range(17)
    ]
    assert client.post("/api/v1/requests", json=payload).status_code == 422

    headers = _login(client)
    reserved = client.post(
        "/api/v1/admin/catalog/products/pvc_window/fields",
        headers=headers,
        json={
            "key": "panels",
            "label": "Paneller",
            "field_type": "text",
        },
    )
    assert reserved.status_code == 422


@pytest.mark.parametrize("product_type", ["pvc_window", "pvc_door"])
def test_joinery_catalog_seeds_mixed_layouts_and_opening_mechanisms(
    catalog_context,
    product_type: str,
) -> None:
    client, _ = catalog_context
    layout = _find_public_field(client, product_type, "layout")
    assert {"window_door", "door_window", "window_door_window"}.issubset(
        {option["value"] for option in layout["options"]}
    )

    mechanism = _find_public_field(client, product_type, "opening_mechanism")
    assert mechanism["required"] is False
    assert [option["value"] for option in mechanism["options"]] == [
        "fixed",
        "turn",
        "tilt",
        "tilt_turn",
        "sliding",
    ]


def test_public_catalog_has_exact_active_only_noncommercial_contract(
    catalog_context,
) -> None:
    client, _ = catalog_context
    response = client.get("/api/v1/catalog")

    assert response.status_code == 200
    products = response.json()["products"]
    assert {product["key"] for product in products} == {
        "pvc_window",
        "pvc_door",
        "flyscreen",
        "facade_cladding",
        "guillotine_glass",
        "balcony_enclosure",
        "volkswagen_sliding_door",
        "hebeschiebe_system",
        "pivot_system",
        "folding_system",
    }
    for product in products:
        assert set(product) == {
            "key",
            "material_group",
            "name",
            "description",
            "mark",
            "sort_order",
            "measurement",
            "fields",
        }
        assert set(product["measurement"]) == {
            "variant",
            "width_instruction",
            "height_instruction",
            "short_width_label",
            "short_height_label",
        }
        assert {"usage_primary", "usage_secondary", "usage_tertiary", "color"} <= {
            field["key"] for field in product["fields"]
        }
        for field in product["fields"]:
            assert set(field) == {
                "id",
                "key",
                "label",
                    "help_text",
                    "field_type",
                    "unit",
                    "min_value",
                    "max_value",
                    "step",
                    "required",
                "sort_order",
                "options",
            }
            for option in field["options"]:
                assert set(option) == {
                    "id",
                    "value",
                    "label",
                    "description",
                    "features",
                    "visual_icon_url",
                    "section_image_urls",
                    "profile_spec",
                    "sort_order",
                }

    groups = {product["key"]: product["material_group"] for product in products}
    assert groups["pvc_window"] == "pvc"

    pivot = next(product for product in products if product["key"] == "pivot_system")
    opening_direction = next(
        field for field in pivot["fields"] if field["key"] == "pivot_opening_direction"
    )
    assert [option["value"] for option in opening_direction["options"]] == ["side", "up"]
    vertical_mullions = next(
        field for field in pivot["fields"] if field["key"] == "pivot_vertical_mullion_count"
    )
    horizontal_mullions = next(
        field for field in pivot["fields"] if field["key"] == "pivot_horizontal_mullion_count"
    )
    assert vertical_mullions["required"] is False
    assert horizontal_mullions["required"] is False
    assert [option["value"] for option in vertical_mullions["options"]] == ["0", "1", "2", "3"]
    assert groups["pvc_door"] == "pvc"
    assert groups["guillotine_glass"] == "aluminium"
    assert groups["balcony_enclosure"] == "aluminium"
    assert groups["volkswagen_sliding_door"] == "pvc"
    assert groups["hebeschiebe_system"] == "aluminium"

    serialized = str(response.json()).lower()
    for forbidden in (
        "price",
        "cost",
        "margin",
        "markup",
        "discount",
        "quoted_amount",
        "bom",
        "formula",
        "internal_",
    ):
        assert forbidden not in serialized

    document = client.get("/openapi.json").json()
    operation = document["paths"]["/api/v1/catalog"]["get"]
    contract = _resolve_refs(operation["responses"], document)
    serialized_contract = str(contract).lower()
    assert "quoted_amount" not in serialized_contract
    assert "internal_notes" not in serialized_contract


def test_every_admin_catalog_crud_method_requires_jwt(catalog_context) -> None:
    client, _ = catalog_context
    requests = [
        ("GET", "/api/v1/admin/catalog/products", None),
        ("POST", "/api/v1/admin/catalog/products", {}),
        ("PATCH", "/api/v1/admin/catalog/products/pvc_window", {"active": False}),
        ("DELETE", "/api/v1/admin/catalog/products/pvc_window", None),
        ("GET", "/api/v1/admin/catalog/products/pvc_window/fields", None),
        ("POST", "/api/v1/admin/catalog/products/pvc_window/fields", {}),
        ("PATCH", "/api/v1/admin/catalog/fields/1", {"active": False}),
        ("DELETE", "/api/v1/admin/catalog/fields/1", None),
        ("GET", "/api/v1/admin/catalog/fields/1/options", None),
        ("POST", "/api/v1/admin/catalog/fields/1/options", {}),
        ("PATCH", "/api/v1/admin/catalog/options/1", {"active": False}),
        ("DELETE", "/api/v1/admin/catalog/options/1", None),
    ]

    for method, path, body in requests:
        response = client.request(method, path, json=body)
        assert response.status_code == 401, (method, path, response.text)


def test_option_add_patch_and_soft_deactivate_round_trip(catalog_context) -> None:
    client, _ = catalog_context
    headers = _login(client)
    field_id = _create_select_field(client, headers)
    option = _create_option(client, headers, field_id)

    public_field = _find_public_field(client, "pvc_window", "installation_area")
    assert public_field["options"] == [
        {
            "id": option["id"],
            "value": "coastal",
            "label": "Sahil bölgesi",
            "description": "",
            "features": [],
            "visual_icon_url": None,
            "section_image_urls": [],
            "profile_spec": None,
            "sort_order": 10,
        }
    ]

    patched = client.patch(
        f"/api/v1/admin/catalog/options/{option['id']}",
        headers=headers,
        json={"label": "Kıyı bölgesi", "sort_order": 5},
    )
    assert patched.status_code == 200
    assert _find_public_field(
        client,
        "pvc_window",
        "installation_area",
    )["options"][0]["label"] == "Kıyı bölgesi"

    deleted = client.delete(
        f"/api/v1/admin/catalog/options/{option['id']}",
        headers=headers,
    )
    assert deleted.status_code == 204
    assert client.delete(
        f"/api/v1/admin/catalog/options/{option['id']}",
        headers=headers,
    ).status_code == 204
    assert _find_public_field(
        client,
        "pvc_window",
        "installation_area",
    )["options"] == []

    duplicate = client.post(
        f"/api/v1/admin/catalog/fields/{field_id}/options",
        headers=headers,
        json={"value": "coastal", "label": "Yeni anlam", "sort_order": 10},
    )
    assert duplicate.status_code == 409


def test_option_presentation_details_round_trip_and_reject_unsafe_content(
    catalog_context,
) -> None:
    client, _ = catalog_context
    headers = _login(client)
    field_id = _create_select_field(
        client,
        headers,
        key="series_detail_demo",
    )
    created = client.post(
        f"/api/v1/admin/catalog/fields/{field_id}/options",
        headers=headers,
        json={
            "value": "prestige_76",
            "label": "Prestij 76",
            "description": "Yalıtım ve dayanıklılık odaklı profil serisi.",
            "features": ["76 mm profil derinliği", "Çok odacıklı gövde"],
            "visual_icon_url": "https://cdn.example.com/icons/prestige-76.svg",
            "section_image_urls": [
                "https://cdn.example.com/sections/prestige-76.webp"
            ],
            "active": True,
            "sort_order": 10,
        },
    )
    assert created.status_code == 201
    option = created.json()
    assert option["features"] == [
        "76 mm profil derinliği",
        "Çok odacıklı gövde",
    ]

    public_option = _find_public_field(
        client,
        "pvc_window",
        "series_detail_demo",
    )["options"][0]
    assert public_option["description"].startswith("Yalıtım")
    assert public_option["visual_icon_url"] == (
        "https://cdn.example.com/icons/prestige-76.svg"
    )
    assert public_option["section_image_urls"] == [
        "https://cdn.example.com/sections/prestige-76.webp"
    ]

    patched = client.patch(
        f"/api/v1/admin/catalog/options/{option['id']}",
        headers=headers,
        json={
            "description": "Geniş cam uygulamaları için dengeli seri.",
            "features": ["76 mm profil derinliği"],
            "visual_icon_url": None,
            "section_image_urls": [],
        },
    )
    assert patched.status_code == 200
    assert patched.json()["section_image_urls"] == []
    assert patched.json()["visual_icon_url"] is None
    assert _find_public_field(
        client,
        "pvc_window",
        "series_detail_demo",
    )["options"][0]["features"] == ["76 mm profil derinliği"]

    unsafe_text = client.patch(
        f"/api/v1/admin/catalog/options/{option['id']}",
        headers=headers,
        json={"description": "Fiyat 10.000 TL"},
    )
    unsafe_url = client.patch(
        f"/api/v1/admin/catalog/options/{option['id']}",
        headers=headers,
        json={"section_image_urls": ["javascript:alert(1)"]},
    )
    unsafe_icon = client.patch(
        f"/api/v1/admin/catalog/options/{option['id']}",
        headers=headers,
        json={"visual_icon_url": "data:image/svg+xml,<svg/>"},
    )
    assert unsafe_text.status_code == 422
    assert unsafe_url.status_code == 422
    assert unsafe_icon.status_code == 422


def test_option_profile_spec_create_update_public_round_trip_and_delete(
    catalog_context,
) -> None:
    client, engine = catalog_context
    headers = _login(client)
    field_id = _create_select_field(
        client,
        headers,
        key="profile_geometry_demo",
    )
    profile_spec = {
        "edge_profile_mm": 50,
        "mullion_profile_mm": 42,
        "corner_profile_mm": 70,
        "top_profile_mm": 48,
        "bottom_profile_mm": 52,
        "mounting_gap_mm": 10,
        "min_glass_width_mm": 400,
        "target_glass_width_mm": 800,
        "max_glass_width_mm": 1100,
        "min_panel_count": 2,
        "max_panel_count": 16,
    }
    created = client.post(
        f"/api/v1/admin/catalog/fields/{field_id}/options",
        headers=headers,
        json={
            "value": "profile_50",
            "label": "Profil 50",
            "profile_spec": profile_spec,
            "active": True,
            "sort_order": 10,
        },
    )

    assert created.status_code == 201
    option = created.json()
    assert option["profile_spec"] == profile_spec
    assert _find_public_field(
        client,
        "pvc_window",
        "profile_geometry_demo",
    )["options"][0]["profile_spec"] == profile_spec

    updated_spec = {**profile_spec, "target_glass_width_mm": 850}
    patched = client.patch(
        f"/api/v1/admin/catalog/options/{option['id']}",
        headers=headers,
        json={"profile_spec": updated_spec},
    )
    assert patched.status_code == 200
    assert patched.json()["profile_spec"] == updated_spec

    removed = client.patch(
        f"/api/v1/admin/catalog/options/{option['id']}",
        headers=headers,
        json={"profile_spec": None},
    )
    assert removed.status_code == 200
    assert removed.json()["profile_spec"] is None
    with Session(engine) as session:
        assert session.get(CatalogOptionProfileSpec, option["id"]) is None


@pytest.mark.parametrize(
    "invalid_update",
    [
        {"edge_profile_mm": 501},
        {
            "min_glass_width_mm": 900,
            "target_glass_width_mm": 800,
            "max_glass_width_mm": 1100,
        },
        {"min_panel_count": 20, "max_panel_count": 10},
    ],
)
def test_option_profile_spec_rejects_invalid_bounds(
    catalog_context,
    invalid_update: dict[str, int],
) -> None:
    client, _ = catalog_context
    headers = _login(client)
    field_id = _create_select_field(client, headers, key="profile_bounds_demo")
    option = _create_option(client, headers, field_id)
    profile_spec = {
        "edge_profile_mm": 50,
        "mullion_profile_mm": 42,
        "corner_profile_mm": 70,
        "top_profile_mm": 48,
        "bottom_profile_mm": 52,
        "mounting_gap_mm": 10,
        "min_glass_width_mm": 400,
        "target_glass_width_mm": 800,
        "max_glass_width_mm": 1100,
        "min_panel_count": 2,
        "max_panel_count": 16,
    }
    profile_spec.update(invalid_update)

    response = client.patch(
        f"/api/v1/admin/catalog/options/{option['id']}",
        headers=headers,
        json={"profile_spec": profile_spec},
    )

    assert response.status_code == 422


def test_balcony_system_profile_specs_are_seeded_without_overwriting_admin_edits(
    catalog_context,
) -> None:
    client, engine = catalog_context
    headers = _login(client)
    fields = client.get(
        "/api/v1/admin/catalog/products/balcony_enclosure/fields",
        headers=headers,
    ).json()
    system_field = next(field for field in fields if field["key"] == "system_type")
    options = client.get(
        f"/api/v1/admin/catalog/fields/{system_field['id']}/options",
        headers=headers,
    ).json()
    sliding = next(option for option in options if option["value"] == "sliding")
    assert sliding["profile_spec"]["target_glass_width_mm"] == 850
    assert sliding["profile_spec"]["max_panel_count"] == 40

    edited_spec = {**sliding["profile_spec"], "edge_profile_mm": 57}
    updated = client.patch(
        f"/api/v1/admin/catalog/options/{sliding['id']}",
        headers=headers,
        json={"profile_spec": edited_spec},
    )
    assert updated.status_code == 200

    seed_catalog(engine)
    options_after_seed = client.get(
        f"/api/v1/admin/catalog/fields/{system_field['id']}/options",
        headers=headers,
    ).json()
    sliding_after_seed = next(
        option for option in options_after_seed if option["value"] == "sliding"
    )
    assert sliding_after_seed["profile_spec"]["edge_profile_mm"] == 57


def test_profile_series_is_admin_managed_and_validated_by_visible_label(
    catalog_context,
) -> None:
    client, _ = catalog_context
    headers = _login(client)
    fields = client.get(
        "/api/v1/admin/catalog/products/pvc_window/fields",
        headers=headers,
    ).json()
    series_field = next(field for field in fields if field["key"] == "profile_series")
    assert series_field["field_type"] == "select"

    option = client.post(
        f"/api/v1/admin/catalog/fields/{series_field['id']}/options",
        headers=headers,
        json={
            "value": "prestige_76",
            "label": "Prestij 76",
            "description": "Pencere uygulamaları için profil serisi.",
            "features": ["76 mm profil derinliği"],
            "section_image_urls": [],
            "active": True,
            "sort_order": 10,
        },
    )
    assert option.status_code == 201

    valid_payload = _window_payload()
    valid_payload["items"][0]["profile_series"] = "Prestij 76"
    assert client.post("/api/v1/requests", json=valid_payload).status_code == 202

    slug_payload = _window_payload()
    slug_payload["items"][0]["profile_series"] = "prestige_76"
    assert client.post("/api/v1/requests", json=slug_payload).status_code == 422

    invalid_type_update = client.patch(
        f"/api/v1/admin/catalog/fields/{series_field['id']}",
        headers=headers,
        json={"field_type": "text"},
    )
    assert invalid_type_update.status_code == 422

    assert client.patch(
        f"/api/v1/admin/catalog/options/{option.json()['id']}",
        headers=headers,
        json={"active": False},
    ).status_code == 200
    assert client.post("/api/v1/requests", json=valid_payload).status_code == 422


def test_product_soft_deactivation_is_immediate_and_blocks_new_requests(
    catalog_context,
) -> None:
    client, _ = catalog_context
    headers = _login(client)

    deactivated = client.patch(
        "/api/v1/admin/catalog/products/pvc_window",
        headers=headers,
        json={"active": False},
    )
    assert deactivated.status_code == 200
    assert deactivated.json()["active"] is False
    assert "pvc_window" not in {
        product["key"] for product in client.get("/api/v1/catalog").json()["products"]
    }
    assert client.post("/api/v1/requests", json=_window_payload()).status_code == 422


def test_catalog_answers_use_only_active_known_options_and_round_trip(
    catalog_context,
) -> None:
    client, _ = catalog_context
    headers = _login(client)
    field_id = _create_select_field(client, headers)
    option = _create_option(client, headers, field_id)

    accepted = client.post(
        "/api/v1/requests",
        json=_window_payload(catalog_answers={"installation_area": "coastal"}),
    )
    assert accepted.status_code == 202

    listed = client.get("/api/v1/admin/requests", headers=headers).json()
    request_id = listed["items"][0]["id"]
    detail = client.get(
        f"/api/v1/admin/requests/{request_id}",
        headers=headers,
    )
    assert detail.status_code == 200
    assert detail.json()["items"][0]["catalog_answers"] == {
        "installation_area": "coastal"
    }

    assert client.delete(
        f"/api/v1/admin/catalog/options/{option['id']}",
        headers=headers,
    ).status_code == 204
    historical = client.get(
        f"/api/v1/admin/requests/{request_id}",
        headers=headers,
    )
    assert historical.status_code == 200
    assert historical.json()["items"][0]["catalog_answers"] == {
        "installation_area": "coastal"
    }
    rejected = client.post(
        "/api/v1/requests",
        json=_window_payload(catalog_answers={"installation_area": "coastal"}),
    )
    assert rejected.status_code == 422

    unknown = client.post(
        "/api/v1/requests",
        json=_window_payload(catalog_answers={"unknown_field": "anything"}),
    )
    assert unknown.status_code == 422


def test_catalog_answer_and_admin_text_security(catalog_context) -> None:
    client, _ = catalog_context
    headers = _login(client)

    forbidden_key = client.post(
        "/api/v1/requests",
        json=_window_payload(catalog_answers={"unit_price": "100"}),
    )
    nested_value = client.post(
        "/api/v1/requests",
        json=_window_payload(catalog_answers={"usage_primary": {"value": "living"}}),
    )
    assert forbidden_key.status_code == 422
    assert nested_value.status_code == 422

    commercial_field = client.post(
        "/api/v1/admin/catalog/products/pvc_window/fields",
        headers=headers,
        json={
            "key": "cost_hint",
            "label": "Dahili alan",
            "field_type": "text",
            "sort_order": 200,
        },
    )
    stored_xss = client.post(
        "/api/v1/admin/catalog/products/pvc_window/fields",
        headers=headers,
        json={
            "key": "safe_field",
            "label": "<svg/onload=alert(1)>",
            "field_type": "text",
            "sort_order": 200,
        },
    )
    commercial_option_value = client.post(
        "/api/v1/admin/catalog/fields/1/options",
        headers=headers,
        json={"value": "unit_price", "label": "Uygunsuz", "sort_order": 200},
    )
    assert commercial_field.status_code == 422
    assert stored_xss.status_code == 422
    assert commercial_option_value.status_code == 422


def test_deactivated_core_color_option_is_rejected_for_new_request(
    catalog_context,
) -> None:
    client, _ = catalog_context
    headers = _login(client)
    fields = client.get(
        "/api/v1/admin/catalog/products/pvc_window/fields",
        headers=headers,
    ).json()
    color_field = next(field for field in fields if field["key"] == "color")
    options = client.get(
        f"/api/v1/admin/catalog/fields/{color_field['id']}/options",
        headers=headers,
    ).json()
    white = next(option for option in options if option["value"] == "white")

    assert client.patch(
        f"/api/v1/admin/catalog/options/{white['id']}",
        headers=headers,
        json={"active": False},
    ).status_code == 200
    assert client.post(
        "/api/v1/requests",
        json=_window_payload(color="white"),
    ).status_code == 422


def test_admin_added_glazing_option_is_public_and_accepted_until_deactivated(
    catalog_context,
) -> None:
    client, _ = catalog_context
    headers = _login(client)
    fields = client.get(
        "/api/v1/admin/catalog/products/pvc_window/fields",
        headers=headers,
    ).json()
    glazing_field = next(field for field in fields if field["key"] == "glazing")

    created = client.post(
        f"/api/v1/admin/catalog/fields/{glazing_field['id']}/options",
        headers=headers,
        json={
            "value": "solar_control",
            "label": "Güneş kontrollü cam",
            "active": True,
            "sort_order": 60,
        },
    )
    assert created.status_code == 201
    option = created.json()

    public_values = {
        item["value"]
        for item in _find_public_field(
            client,
            "pvc_window",
            "glazing",
        )["options"]
    }
    assert "solar_control" in public_values

    payload = _window_payload()
    payload["items"][0]["glazing"] = "solar_control"
    assert client.post("/api/v1/requests", json=payload).status_code == 202

    deactivated = client.patch(
        f"/api/v1/admin/catalog/options/{option['id']}",
        headers=headers,
        json={"active": False},
    )
    assert deactivated.status_code == 200
    assert "solar_control" not in {
        item["value"]
        for item in _find_public_field(
            client,
            "pvc_window",
            "glazing",
        )["options"]
    }
    assert client.post("/api/v1/requests", json=payload).status_code == 422


def test_admin_created_product_draft_publish_submit_and_history_round_trip(
    catalog_context,
) -> None:
    client, _ = catalog_context
    headers = _login(client)

    created = client.post(
        "/api/v1/admin/catalog/products",
        headers=headers,
        json=_custom_product_payload(
            key="pergola",
            name="Pergola",
            material_group="aluminium",
        ),
    )
    assert created.status_code == 201
    assert created.json()["active"] is False
    assert created.json()["material_group"] == "aluminium"
    assert "pergola" not in {
        product["key"] for product in client.get("/api/v1/catalog").json()["products"]
    }

    field = client.post(
        "/api/v1/admin/catalog/products/pergola/fields",
        headers=headers,
        json={
            "key": "roof_material",
            "label": "Tavan malzemesi",
            "help_text": "Emin değilseniz uzmanımız belirleyebilir.",
            "field_type": "select",
            "required": True,
            "active": True,
            "sort_order": 10,
        },
    )
    assert field.status_code == 201

    blocked_publish = client.patch(
        "/api/v1/admin/catalog/products/pergola",
        headers=headers,
        json={"active": True},
    )
    assert blocked_publish.status_code == 409
    product = next(
        item
        for item in client.get(
            "/api/v1/admin/catalog/products",
            headers=headers,
        ).json()
        if item["key"] == "pergola"
    )
    assert product["active"] is False

    option = client.post(
        f"/api/v1/admin/catalog/fields/{field.json()['id']}/options",
        headers=headers,
        json={
            "value": "polycarbonate",
            "label": "Polikarbon",
            "active": True,
            "sort_order": 10,
        },
    )
    assert option.status_code == 201
    published = client.patch(
        "/api/v1/admin/catalog/products/pergola",
        headers=headers,
        json={"active": True},
    )
    assert published.status_code == 200
    assert published.json()["active"] is True

    public_product = next(
        item
        for item in client.get("/api/v1/catalog").json()["products"]
        if item["key"] == "pergola"
    )
    assert public_product["name"] == "Pergola"
    assert public_product["material_group"] == "aluminium"
    assert public_product["fields"][0]["options"][0]["value"] == "polycarbonate"

    accepted = client.post(
        "/api/v1/requests",
        json=_generic_request_payload(
            catalog_answers={"roof_material": "polycarbonate"},
        ),
    )
    assert accepted.status_code == 202
    listed = client.get("/api/v1/admin/requests", headers=headers).json()
    request_id = listed["items"][0]["id"]
    detail = client.get(
        f"/api/v1/admin/requests/{request_id}",
        headers=headers,
    )
    assert detail.status_code == 200
    stored_item = detail.json()["items"][0]
    assert set(stored_item) == {
        "product_type",
        "width_mm",
        "height_mm",
        "quantity",
        "color",
        "profile_series",
        "profile_spec",
        "notes",
        "drawing_version",
        "catalog_answers",
    }
    assert stored_item["profile_spec"] is None
    assert stored_item["product_type"] == "pergola"
    assert stored_item["catalog_answers"] == {"roof_material": "polycarbonate"}

    last_option = client.patch(
        f"/api/v1/admin/catalog/options/{option.json()['id']}",
        headers=headers,
        json={"active": False},
    )
    assert last_option.status_code == 409
    assert "pergola" in {
        product["key"] for product in client.get("/api/v1/catalog").json()["products"]
    }

    deactivated = client.patch(
        "/api/v1/admin/catalog/products/pergola",
        headers=headers,
        json={"active": False},
    )
    assert deactivated.status_code == 200
    assert "pergola" not in {
        product["key"] for product in client.get("/api/v1/catalog").json()["products"]
    }
    assert client.post(
        "/api/v1/requests",
        json=_generic_request_payload(
            catalog_answers={"roof_material": "polycarbonate"},
        ),
    ).status_code == 422
    historical = client.get(
        f"/api/v1/admin/requests/{request_id}",
        headers=headers,
    )
    assert historical.status_code == 200
    assert historical.json()["items"][0]["catalog_answers"] == {
        "roof_material": "polycarbonate"
    }


def test_custom_product_security_and_strict_payload_boundaries(catalog_context) -> None:
    client, _ = catalog_context
    headers = _login(client)

    active_create = client.post(
        "/api/v1/admin/catalog/products",
        headers=headers,
        json=_custom_product_payload(
            key="cam_tavan",
            name="Cam tavan",
            active=True,
        ),
    )
    assert active_create.status_code == 409

    commercial_product = client.post(
        "/api/v1/admin/catalog/products",
        headers=headers,
        json={
            **_custom_product_payload(key="priced_pergola", name="Pergola"),
            "name": "Fiyat 1.000 TL Pergola",
            "description": "Maliyet bilgisi açık",
        },
    )
    commercial_field = client.post(
        "/api/v1/admin/catalog/products/pvc_window/fields",
        headers=headers,
        json={
            "key": "safe_public_field",
            "label": "1.000 TL seçeneği",
            "field_type": "text",
        },
    )
    reserved_field = client.post(
        "/api/v1/admin/catalog/products/pvc_window/fields",
        headers=headers,
        json={
            "key": "profile_series",
            "label": "Seri",
            "field_type": "text",
        },
    )
    assert commercial_product.status_code == 422
    assert commercial_field.status_code == 422
    assert reserved_field.status_code == 422
    serialized_catalog = str(client.get("/api/v1/catalog").json()).lower()
    assert "1.000 tl" not in serialized_catalog
    assert "maliyet bilgisi" not in serialized_catalog

    malformed_builtin = _window_payload()
    del malformed_builtin["items"][0]["layout"]
    malformed_builtin["items"][0]["unexpected_generic_field"] = "value"
    assert client.post(
        "/api/v1/requests",
        json=malformed_builtin,
    ).status_code == 422

    generic_with_specialized_field = _generic_request_payload(
        product_type="not_in_catalog",
    )
    generic_with_specialized_field["items"][0]["layout"] = "single_sash"
    assert client.post(
        "/api/v1/requests",
        json=generic_with_specialized_field,
    ).status_code == 422


def test_numeric_catalog_field_round_trip_and_submission_bounds(catalog_context) -> None:
    client, _ = catalog_context
    headers = _login(client)

    public_window = next(
        product
        for product in client.get("/api/v1/catalog").json()["products"]
        if product["key"] == "pvc_window"
    )
    frame_field = next(
        field
        for field in public_window["fields"]
        if field["key"] == "frame_profile_width_mm"
    )
    assert frame_field == {
        **frame_field,
        "field_type": "number",
        "unit": "mm",
        "min_value": 30.0,
        "max_value": 200.0,
        "step": 1.0,
    }

    accepted = _window_payload(catalog_answers={"frame_profile_width_mm": 76})
    assert client.post("/api/v1/requests", json=accepted).status_code == 202

    for invalid_value in (29, 201, 76.5, "76", True):
        rejected = _window_payload(
            catalog_answers={"frame_profile_width_mm": invalid_value},
        )
        assert client.post("/api/v1/requests", json=rejected).status_code == 422

    created = client.post(
        "/api/v1/admin/catalog/products/pvc_window/fields",
        headers=headers,
        json={
            "key": "custom_hardware_offset_mm",
            "label": "Özel donanım mesafesi",
            "help_text": "Teknik ölçü",
            "field_type": "number",
            "unit": "mm",
            "min_value": 10,
            "max_value": 250,
            "step": 5,
            "required": False,
            "active": True,
            "sort_order": 58,
        },
    )
    assert created.status_code == 201
    assert created.json()["unit"] == "mm"

    invalid_definition = client.post(
        "/api/v1/admin/catalog/products/pvc_window/fields",
        headers=headers,
        json={
            "key": "invalid_numeric_range",
            "label": "Geçersiz ölçü",
            "field_type": "number",
            "unit": "mm",
            "min_value": 300,
            "max_value": 100,
            "step": 1,
        },
    )
    assert invalid_definition.status_code == 422
