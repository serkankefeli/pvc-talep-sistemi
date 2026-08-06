from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.db import create_db_engine
from app.mailer import AdminNotification
from app.main import create_app
from app.security import hash_password


class FakeMailer:
    def __init__(self) -> None:
        self.admin_notifications: list[AdminNotification] = []
        self.customer_messages: list[dict[str, Any]] = []

    def notify_admin(self, notification: AdminNotification) -> bool:
        self.admin_notifications.append(notification)
        return True

    def send_customer_message(
        self,
        *,
        recipient: str,
        subject: str,
        message: str,
        quoted_amount: Decimal | None,
        quote_currency: str,
    ) -> bool:
        self.customer_messages.append(
            {
                "recipient": recipient,
                "subject": subject,
                "message": message,
                "quoted_amount": quoted_amount,
                "quote_currency": quote_currency,
            }
        )
        return True


@pytest.fixture
def settings() -> Settings:
    return Settings(
        environment="test",
        database_url="sqlite://",
        cors_origins="https://www.example.com,https://quote.example.com",
        admin_username="administrator",
        admin_password_hash=hash_password("correct horse battery staple"),
        jwt_secret="test-secret-that-is-longer-than-thirty-two-characters",
        public_rate_limit_requests=100,
        auth_rate_limit_requests=100,
    )


@pytest.fixture
def fake_mailer() -> FakeMailer:
    return FakeMailer()


@pytest.fixture
def client(settings: Settings, fake_mailer: FakeMailer):
    engine = create_db_engine(settings.database_url)
    app = create_app(settings=settings, engine=engine, mailer=fake_mailer)
    with TestClient(app) as test_client:
        yield test_client


def window_payload() -> dict[str, Any]:
    return {
        "contact": {
            "full_name": "Example Customer",
            "email": "customer@example.com",
            "phone": "+90 555 000 00 00",
            "preferred_contact": "email",
            "city": "Istanbul",
            "district": "Kadikoy",
        },
        "items": [
            {
                "product_type": "pvc_window",
                "width_mm": 1400,
                "height_mm": 1300,
                "quantity": 2,
                "color": "white",
                "layout": "double_sash",
                "opening_direction": "inward",
                "glazing": "double_glazing",
                "divisions": [],
            }
        ],
        "project_note": "Please contact me.",
        "privacy_consent": True,
    }


def facade_payload() -> dict[str, Any]:
    payload = window_payload()
    payload["items"] = [
        {
            "product_type": "facade_cladding",
            "width_mm": 12000,
            "height_mm": 8500,
            "quantity": 1,
            "color": "anthracite",
            "cladding_type": "composite_panel",
            "panel_orientation": "vertical",
            "installation_system": "concealed_fixing",
            "insulation_required": True,
            "substructure_material": "aluminium",
        }
    ]
    return payload


def guillotine_glass_payload() -> dict[str, Any]:
    payload = window_payload()
    payload["items"] = [
        {
            "product_type": "guillotine_glass",
            "width_mm": 3200,
            "height_mm": 2800,
            "quantity": 1,
            "color": "anthracite",
            "system_type": "motorized",
            "panel_count": 3,
            "glass_type": "tempered",
            "bottom_fixed": True,
        }
    ]
    return payload


def balcony_enclosure_payload() -> dict[str, Any]:
    payload = window_payload()
    payload["items"] = [
        {
            "product_type": "balcony_enclosure",
            "width_mm": 7600,
            "height_mm": 2600,
            "quantity": 1,
            "color": "black",
            "system_type": "folding",
            "enclosure_shape": "l_shape",
            "roof_required": False,
            "parapet_type": "glass",
            "segments": [
                {
                    "label": "A · Ana cephe",
                    "width_mm": 7600,
                    "turn_degrees": 0,
                },
                {
                    "label": "B · Yan cephe",
                    "width_mm": 2100,
                    "turn_degrees": 90,
                },
            ],
        }
    ]
    return payload


FOLDING_PROFILE_SPEC = {
    "edge_profile_mm": 45,
    "mullion_profile_mm": 35,
    "corner_profile_mm": 65,
    "top_profile_mm": 45,
    "bottom_profile_mm": 45,
    "mounting_gap_mm": 10,
    "min_glass_width_mm": 400,
    "target_glass_width_mm": 700,
    "max_glass_width_mm": 900,
    "min_panel_count": 2,
    "max_panel_count": 40,
}


FORGED_PROFILE_SPEC = {
    "edge_profile_mm": 111,
    "mullion_profile_mm": 112,
    "corner_profile_mm": 113,
    "top_profile_mm": 114,
    "bottom_profile_mm": 115,
    "mounting_gap_mm": 12,
    "min_glass_width_mm": 300,
    "target_glass_width_mm": 600,
    "max_glass_width_mm": 1200,
    "min_panel_count": 1,
    "max_panel_count": 12,
}


def login(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/v1/admin/login",
        json={
            "username": "administrator",
            "password": "correct horse battery staple",
        },
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def admin_request_item(
    client: TestClient,
    headers: dict[str, str],
    request_number: str,
) -> dict[str, Any]:
    listed = client.get("/api/v1/admin/requests", headers=headers)
    assert listed.status_code == 200
    summary = next(
        item
        for item in listed.json()["items"]
        if item["request_number"] == request_number
    )
    detail = client.get(
        f"/api/v1/admin/requests/{summary['id']}",
        headers=headers,
    )
    assert detail.status_code == 200
    return detail.json()["items"][0]


def admin_catalog_field(
    client: TestClient,
    headers: dict[str, str],
    product_key: str,
    field_key: str,
) -> dict[str, Any]:
    response = client.get(
        f"/api/v1/admin/catalog/products/{product_key}/fields",
        headers=headers,
    )
    assert response.status_code == 200
    return next(field for field in response.json() if field["key"] == field_key)


def _openapi_refs(node: Any, document: dict[str, Any], seen: set[str] | None = None) -> Any:
    seen = seen or set()
    if isinstance(node, list):
        return [_openapi_refs(item, document, seen) for item in node]
    if not isinstance(node, dict):
        return node
    if "$ref" in node:
        ref = node["$ref"]
        if ref in seen:
            return {}
        seen.add(ref)
        target: Any = document
        for part in ref.removeprefix("#/").split("/"):
            target = target[part]
        return _openapi_refs(target, document, seen)
    return {
        key: _openapi_refs(value, document, seen.copy())
        for key, value in node.items()
    }


def test_public_create_returns_only_opaque_reference(
    client: TestClient,
    fake_mailer: FakeMailer,
) -> None:
    response = client.post("/api/v1/requests", json=window_payload())

    assert response.status_code == 202
    assert set(response.json()) == {"request_number", "status", "message"}
    assert response.json()["request_number"].startswith("PVC-")
    assert len(response.json()["request_number"]) == 20
    assert response.json()["status"] == "received"
    assert all(
        forbidden not in response.text.lower()
        for forbidden in ("price", "cost", "margin", "bom", "quoted_amount")
    )
    assert len(fake_mailer.admin_notifications) == 1
    notification = fake_mailer.admin_notifications[0]
    assert notification.request_number == response.json()["request_number"]
    assert "customer" not in notification.panel_url

    # There is intentionally no public lookup, even when the opaque reference is known.
    lookup = client.get(f"/api/v1/requests/{response.json()['request_number']}")
    assert lookup.status_code == 404


def test_public_openapi_contract_contains_no_pricing_fields(
    client: TestClient,
) -> None:
    document = client.get("/openapi.json").json()
    operation = document["paths"]["/api/v1/requests"]["post"]
    public_contract = _openapi_refs(
        {
            "request": operation["requestBody"],
            "responses": operation["responses"],
        },
        document,
    )
    serialized = str(public_contract).lower()

    for forbidden in (
        "price",
        "cost",
        "margin",
        "markup",
        "discount",
        "bom",
        "quoted_amount",
    ):
        assert forbidden not in serialized

    response_schema = _openapi_refs(
        operation["responses"]["202"]["content"]["application/json"]["schema"],
        document,
    )
    assert set(response_schema["properties"]) == {
        "request_number",
        "status",
        "message",
    }


def test_public_rejects_injected_pricing_without_reflecting_value(
    client: TestClient,
) -> None:
    payload = window_payload()
    payload["quoted_amount"] = "987654.32"
    payload["items"][0]["cost"] = "123456.78"

    response = client.post("/api/v1/requests", json=payload)

    assert response.status_code == 422
    assert "987654.32" not in response.text
    assert "123456.78" not in response.text


def test_admin_endpoints_require_authentication(client: TestClient) -> None:
    paths_and_methods = [
        ("get", "/api/v1/admin/requests", None),
        ("get", "/api/v1/admin/requests/1", None),
        ("put", "/api/v1/admin/requests/1/favorite", None),
        ("delete", "/api/v1/admin/requests/1/favorite", None),
        ("patch", "/api/v1/admin/requests/1", {"status": "reviewing"}),
        (
            "post",
            "/api/v1/admin/requests/1/send-email",
            {"subject": "Quote", "message": "Hello"},
        ),
    ]

    for method, path, payload in paths_and_methods:
        response = client.request(method.upper(), path, json=payload)
        assert response.status_code == 401
        assert response.headers["www-authenticate"] == "Bearer"


def test_admin_favorites_are_idempotent_and_filterable(client: TestClient) -> None:
    first_payload = window_payload()
    first_payload["contact"]["full_name"] = "Favorite Customer"
    second_payload = window_payload()
    second_payload["contact"]["full_name"] = "Regular Customer"

    assert client.post("/api/v1/requests", json=first_payload).status_code == 202
    assert client.post("/api/v1/requests", json=second_payload).status_code == 202

    headers = login(client)
    initial = client.get(
        "/api/v1/admin/requests",
        headers=headers,
        params={"sort_by": "customer_name", "sort_dir": "asc"},
    )
    assert initial.status_code == 200
    by_name = {item["customer_name"]: item for item in initial.json()["items"]}
    favorite_id = by_name["Favorite Customer"]["id"]
    regular_id = by_name["Regular Customer"]["id"]
    assert by_name["Favorite Customer"]["favorite"] is False
    assert by_name["Regular Customer"]["favorite"] is False

    for _ in range(2):
        added = client.put(
            f"/api/v1/admin/requests/{favorite_id}/favorite",
            headers=headers,
        )
        assert added.status_code == 200
        assert added.json() == {"request_id": favorite_id, "favorite": True}

    detail = client.get(
        f"/api/v1/admin/requests/{favorite_id}",
        headers=headers,
    )
    assert detail.status_code == 200
    assert detail.json()["favorite"] is True

    favorites = client.get(
        "/api/v1/admin/requests",
        headers=headers,
        params={"favorite": "true"},
    )
    assert favorites.status_code == 200
    assert favorites.json()["total"] == 1
    assert [item["id"] for item in favorites.json()["items"]] == [favorite_id]
    assert favorites.json()["items"][0]["favorite"] is True

    non_favorites = client.get(
        "/api/v1/admin/requests",
        headers=headers,
        params={"favorite": "false"},
    )
    assert non_favorites.status_code == 200
    assert non_favorites.json()["total"] == 1
    assert [item["id"] for item in non_favorites.json()["items"]] == [regular_id]
    assert non_favorites.json()["items"][0]["favorite"] is False

    for _ in range(2):
        removed = client.delete(
            f"/api/v1/admin/requests/{favorite_id}/favorite",
            headers=headers,
        )
        assert removed.status_code == 200
        assert removed.json() == {"request_id": favorite_id, "favorite": False}

    detail = client.get(
        f"/api/v1/admin/requests/{favorite_id}",
        headers=headers,
    )
    assert detail.status_code == 200
    assert detail.json()["favorite"] is False


def test_admin_list_combines_search_status_pagination_and_stable_sorting(
    client: TestClient,
) -> None:
    for name, company in (
        ("Alpha Target", "Target Joinery"),
        ("Beta Target", "Target Glass"),
        ("Outside Person", "Unrelated Company"),
    ):
        payload = window_payload()
        payload["contact"]["full_name"] = name
        payload["contact"]["company_name"] = company
        assert client.post("/api/v1/requests", json=payload).status_code == 202

    headers = login(client)
    listed = client.get(
        "/api/v1/admin/requests",
        headers=headers,
        params={"sort_by": "customer_name", "sort_dir": "asc", "limit": 100},
    )
    assert listed.status_code == 200
    by_name = {item["customer_name"]: item for item in listed.json()["items"]}
    for name in ("Alpha Target", "Beta Target"):
        updated = client.patch(
            f"/api/v1/admin/requests/{by_name[name]['id']}",
            headers=headers,
            json={"status": "reviewing"},
        )
        assert updated.status_code == 200

    first_page = client.get(
        "/api/v1/admin/requests",
        headers=headers,
        params={
            "status": "reviewing",
            "search": "Target",
            "sort_by": "customer_name",
            "sort_dir": "asc",
            "limit": 1,
            "offset": 0,
        },
    )
    second_page = client.get(
        "/api/v1/admin/requests",
        headers=headers,
        params={
            "status": "reviewing",
            "search": "Target",
            "sort_by": "customer_name",
            "sort_dir": "asc",
            "limit": 1,
            "offset": 1,
        },
    )
    assert first_page.status_code == 200
    assert second_page.status_code == 200
    assert first_page.json()["total"] == second_page.json()["total"] == 2
    assert first_page.json()["limit"] == second_page.json()["limit"] == 1
    assert first_page.json()["offset"] == 0
    assert second_page.json()["offset"] == 1
    assert [item["customer_name"] for item in first_page.json()["items"]] == [
        "Alpha Target"
    ]
    assert [item["customer_name"] for item in second_page.json()["items"]] == [
        "Beta Target"
    ]

    stable = client.get(
        "/api/v1/admin/requests",
        headers=headers,
        params={
            "status": "reviewing",
            "sort_by": "status",
            "sort_dir": "asc",
            "limit": 100,
        },
    )
    assert stable.status_code == 200
    stable_ids = [item["id"] for item in stable.json()["items"]]
    assert stable_ids == sorted(stable_ids)


def test_admin_sorting_is_whitelisted_and_rejects_injection(client: TestClient) -> None:
    assert client.post("/api/v1/requests", json=window_payload()).status_code == 202
    headers = login(client)

    for sort_by in (
        "created_at",
        "updated_at",
        "request_number",
        "customer_name",
        "status",
        "quoted_amount",
    ):
        response = client.get(
            "/api/v1/admin/requests",
            headers=headers,
            params={"sort_by": sort_by, "sort_dir": "asc"},
        )
        assert response.status_code == 200

    unsafe = client.get(
        "/api/v1/admin/requests",
        headers=headers,
        params={"sort_by": "created_at; DROP TABLE quote_requests"},
    )
    invalid_direction = client.get(
        "/api/v1/admin/requests",
        headers=headers,
        params={"sort_dir": "sideways"},
    )
    assert unsafe.status_code == 422
    assert invalid_direction.status_code == 422

    still_available = client.get("/api/v1/admin/requests", headers=headers)
    assert still_available.status_code == 200
    assert still_available.json()["total"] == 1


def test_quote_is_manual_and_customer_email_requires_explicit_admin_action(
    client: TestClient,
    fake_mailer: FakeMailer,
) -> None:
    created = client.post("/api/v1/requests", json=window_payload())
    assert created.status_code == 202
    assert fake_mailer.customer_messages == []

    headers = login(client)
    listed = client.get("/api/v1/admin/requests", headers=headers)
    assert listed.status_code == 200
    request_id = listed.json()["items"][0]["id"]
    assert listed.json()["items"][0]["quoted_amount"] is None

    updated = client.patch(
        f"/api/v1/admin/requests/{request_id}",
        headers=headers,
        json={
            "status": "quoted",
            "internal_notes": "Manual review completed.",
            "quoted_amount": "24500.00",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["quoted_amount"] == "24500.00"
    assert fake_mailer.customer_messages == []

    sent = client.post(
        f"/api/v1/admin/requests/{request_id}/send-email",
        headers=headers,
        json={
            "subject": "Your visual quote",
            "message": "We reviewed your request.",
            "include_quote": True,
        },
    )
    assert sent.status_code == 200
    assert len(fake_mailer.customer_messages) == 1
    assert fake_mailer.customer_messages[0]["quoted_amount"] == Decimal("24500.00")


def test_facade_configuration_is_accepted_without_public_price(
    client: TestClient,
) -> None:
    response = client.post("/api/v1/requests", json=facade_payload())
    assert response.status_code == 202
    assert set(response.json()) == {"request_number", "status", "message"}


@pytest.mark.parametrize(
    ("product_key", "field_key", "new_value", "new_label", "payload_factory"),
    [
        (
            "guillotine_glass",
            "glass_type",
            "solar_control",
            "Güneş kontrollü cam",
            guillotine_glass_payload,
        ),
        (
            "facade_cladding",
            "cladding_type",
            "natural_stone",
            "Doğal taş",
            facade_payload,
        ),
    ],
)
def test_admin_added_nonvisual_catalog_value_is_accepted_in_public_submission(
    client: TestClient,
    product_key: str,
    field_key: str,
    new_value: str,
    new_label: str,
    payload_factory,
) -> None:
    headers = login(client)
    field = admin_catalog_field(client, headers, product_key, field_key)
    created_option = client.post(
        f"/api/v1/admin/catalog/fields/{field['id']}/options",
        headers=headers,
        json={
            "value": new_value,
            "label": new_label,
            "active": True,
            "sort_order": 90,
        },
    )
    assert created_option.status_code == 201

    payload = payload_factory()
    payload["items"][0][field_key] = new_value
    response = client.post("/api/v1/requests", json=payload)

    assert response.status_code == 202


@pytest.mark.parametrize(
    ("product_key", "field_key"),
    [
        ("pvc_window", "layout"),
        ("pvc_window", "opening_direction"),
        ("pvc_window", "opening_mechanism"),
        ("pvc_door", "layout"),
        ("pvc_door", "opening_direction"),
        ("pvc_door", "opening_mechanism"),
        ("flyscreen", "screen_type"),
        ("guillotine_glass", "panel_count"),
        ("facade_cladding", "panel_orientation"),
        ("balcony_enclosure", "system_type"),
    ],
)
def test_admin_cannot_add_an_option_unsupported_by_the_visual_renderer(
    client: TestClient,
    product_key: str,
    field_key: str,
) -> None:
    headers = login(client)
    field = admin_catalog_field(client, headers, product_key, field_key)

    response = client.post(
        f"/api/v1/admin/catalog/fields/{field['id']}/options",
        headers=headers,
        json={
            "value": "unsupported_renderer_value",
            "label": "Desteklenmeyen çizim değeri",
            "active": True,
            "sort_order": 90,
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "This option value is not supported by the current visual renderer."
    )


def test_glass_product_configurations_round_trip_only_through_admin(
    client: TestClient,
) -> None:
    guillotine = client.post(
        "/api/v1/requests",
        json=guillotine_glass_payload(),
    )
    balcony = client.post(
        "/api/v1/requests",
        json=balcony_enclosure_payload(),
    )

    assert guillotine.status_code == 202
    assert balcony.status_code == 202
    assert set(guillotine.json()) == {"request_number", "status", "message"}
    assert set(balcony.json()) == {"request_number", "status", "message"}

    headers = login(client)
    listed = client.get("/api/v1/admin/requests", headers=headers)
    assert listed.status_code == 200

    product_types = set()
    for item in listed.json()["items"]:
        detail = client.get(
            f"/api/v1/admin/requests/{item['id']}",
            headers=headers,
        )
        assert detail.status_code == 200
        product_types.add(detail.json()["items"][0]["product_type"])

    assert {"guillotine_glass", "balcony_enclosure"} <= product_types


def test_segmented_balcony_round_trips_and_legacy_payload_remains_valid(
    client: TestClient,
) -> None:
    segmented_payload = balcony_enclosure_payload()
    segmented_payload["items"][0]["profile_spec"] = {
        "edge_profile_mm": 45,
        "mullion_profile_mm": 35,
        "corner_profile_mm": 65,
        "top_profile_mm": 45,
        "bottom_profile_mm": 45,
        "mounting_gap_mm": 10,
        "min_glass_width_mm": 400,
        "target_glass_width_mm": 700,
        "max_glass_width_mm": 900,
        "min_panel_count": 2,
        "max_panel_count": 40,
    }
    created = client.post("/api/v1/requests", json=segmented_payload)
    assert created.status_code == 202

    legacy_payload = balcony_enclosure_payload()
    legacy_payload["items"][0].pop("segments")
    legacy = client.post("/api/v1/requests", json=legacy_payload)
    assert legacy.status_code == 202

    headers = login(client)
    listed = client.get("/api/v1/admin/requests", headers=headers).json()["items"]
    segmented_detail = None
    for summary in listed:
        detail = client.get(
            f"/api/v1/admin/requests/{summary['id']}",
            headers=headers,
        ).json()
        if detail["request_number"] == created.json()["request_number"]:
            segmented_detail = detail
            break

    assert segmented_detail is not None
    assert segmented_detail["items"][0]["segments"] == segmented_payload["items"][0]["segments"]
    assert (
        segmented_detail["items"][0]["profile_spec"]
        == segmented_payload["items"][0]["profile_spec"]
    )


def test_balcony_profile_snapshot_ignores_forged_client_dimensions(
    client: TestClient,
) -> None:
    headers = login(client)
    series_field = admin_catalog_field(
        client,
        headers,
        "balcony_enclosure",
        "profile_series",
    )
    option = client.post(
        f"/api/v1/admin/catalog/fields/{series_field['id']}/options",
        headers=headers,
        json={
            "value": "balcony_series_without_dimensions",
            "label": "Ölçüsüz Balkon Serisi",
            "active": True,
            "sort_order": 10,
        },
    )
    assert option.status_code == 201

    payload = balcony_enclosure_payload()
    payload["items"][0]["profile_series"] = "Ölçüsüz Balkon Serisi"
    payload["items"][0]["profile_spec"] = FORGED_PROFILE_SPEC

    created = client.post("/api/v1/requests", json=payload)

    assert created.status_code == 202
    stored = admin_request_item(
        client,
        headers,
        created.json()["request_number"],
    )
    assert stored["profile_spec"] == FOLDING_PROFILE_SPEC
    assert stored["profile_spec"] != FORGED_PROFILE_SPEC


def test_balcony_profile_series_spec_overrides_system_spec(
    client: TestClient,
) -> None:
    headers = login(client)
    series_field = admin_catalog_field(
        client,
        headers,
        "balcony_enclosure",
        "profile_series",
    )
    series_spec = {
        **FOLDING_PROFILE_SPEC,
        "edge_profile_mm": 52,
        "mullion_profile_mm": 38,
        "corner_profile_mm": 74,
        "target_glass_width_mm": 780,
    }
    option = client.post(
        f"/api/v1/admin/catalog/fields/{series_field['id']}/options",
        headers=headers,
        json={
            "value": "balcony_series_52",
            "label": "Balkon Seri 52",
            "profile_spec": series_spec,
            "active": True,
            "sort_order": 10,
        },
    )
    assert option.status_code == 201

    payload = balcony_enclosure_payload()
    payload["items"][0]["profile_series"] = "Balkon Seri 52"
    payload["items"][0]["profile_spec"] = FORGED_PROFILE_SPEC
    created = client.post("/api/v1/requests", json=payload)

    assert created.status_code == 202
    stored = admin_request_item(
        client,
        headers,
        created.json()["request_number"],
    )
    assert stored["profile_spec"] == series_spec


def test_balcony_without_series_or_system_profile_spec_is_rejected(
    client: TestClient,
) -> None:
    headers = login(client)
    system_field = admin_catalog_field(
        client,
        headers,
        "balcony_enclosure",
        "system_type",
    )
    options = client.get(
        f"/api/v1/admin/catalog/fields/{system_field['id']}/options",
        headers=headers,
    )
    assert options.status_code == 200
    folding = next(
        option for option in options.json() if option["value"] == "folding"
    )
    removed = client.patch(
        f"/api/v1/admin/catalog/options/{folding['id']}",
        headers=headers,
        json={"profile_spec": None},
    )
    assert removed.status_code == 200

    payload = balcony_enclosure_payload()
    payload["items"][0]["profile_spec"] = FORGED_PROFILE_SPEC
    response = client.post("/api/v1/requests", json=payload)

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "The selected balcony profile dimensions are not configured."
    )


def test_non_balcony_client_profile_spec_is_cleared_without_a_series_spec(
    client: TestClient,
) -> None:
    headers = login(client)
    series_field = admin_catalog_field(
        client,
        headers,
        "pvc_window",
        "profile_series",
    )
    option = client.post(
        f"/api/v1/admin/catalog/fields/{series_field['id']}/options",
        headers=headers,
        json={
            "value": "series_without_dimensions",
            "label": "Ölçüsüz Seri",
            "active": True,
            "sort_order": 10,
        },
    )
    assert option.status_code == 201

    payload = window_payload()
    payload["items"][0]["profile_series"] = "Ölçüsüz Seri"
    payload["items"][0]["profile_spec"] = FORGED_PROFILE_SPEC

    created = client.post("/api/v1/requests", json=payload)

    assert created.status_code == 202
    stored = admin_request_item(
        client,
        headers,
        created.json()["request_number"],
    )
    assert stored["profile_spec"] is None


def test_non_balcony_profile_series_uses_server_owned_spec(
    client: TestClient,
) -> None:
    headers = login(client)
    series_field = admin_catalog_field(
        client,
        headers,
        "pvc_window",
        "profile_series",
    )
    series_spec = {
        **FOLDING_PROFILE_SPEC,
        "edge_profile_mm": 76,
        "mullion_profile_mm": 82,
        "corner_profile_mm": 96,
        "target_glass_width_mm": 820,
    }
    option = client.post(
        f"/api/v1/admin/catalog/fields/{series_field['id']}/options",
        headers=headers,
        json={
            "value": "prestige_76",
            "label": "Prestij 76",
            "profile_spec": series_spec,
            "active": True,
            "sort_order": 10,
        },
    )
    assert option.status_code == 201

    payload = window_payload()
    payload["items"][0]["profile_series"] = "Prestij 76"
    payload["items"][0]["profile_spec"] = FORGED_PROFILE_SPEC
    created = client.post("/api/v1/requests", json=payload)

    assert created.status_code == 202
    stored = admin_request_item(
        client,
        headers,
        created.json()["request_number"],
    )
    assert stored["profile_spec"] == series_spec


@pytest.mark.parametrize(
    "invalid_update",
    [
        {"mounting_gap_mm": 101},
        {
            "min_glass_width_mm": 800,
            "target_glass_width_mm": 700,
            "max_glass_width_mm": 900,
        },
        {"min_panel_count": 41, "max_panel_count": 40},
    ],
)
def test_balcony_profile_spec_snapshot_rejects_invalid_geometry(
    client: TestClient,
    invalid_update: dict[str, int],
) -> None:
    payload = balcony_enclosure_payload()
    profile_spec = {
        "edge_profile_mm": 45,
        "mullion_profile_mm": 35,
        "corner_profile_mm": 65,
        "top_profile_mm": 45,
        "bottom_profile_mm": 45,
        "mounting_gap_mm": 10,
        "min_glass_width_mm": 400,
        "target_glass_width_mm": 700,
        "max_glass_width_mm": 900,
        "min_panel_count": 2,
        "max_panel_count": 40,
    }
    profile_spec.update(invalid_update)
    payload["items"][0]["profile_spec"] = profile_spec

    response = client.post("/api/v1/requests", json=payload)

    assert response.status_code == 422


@pytest.mark.parametrize(
    "segments",
    [
        [
            {
                "label": "A · Ana cephe",
                "width_mm": 7600,
                "turn_degrees": 0,
            }
        ],
        [
            {
                "label": "A · Ana cephe",
                "width_mm": 7500,
                "turn_degrees": 0,
            },
            {
                "label": "B · Yan cephe",
                "width_mm": 2100,
                "turn_degrees": 90,
            },
        ],
        [
            {
                "label": "A · Ana cephe",
                "width_mm": 7600,
                "turn_degrees": 0,
            },
            {
                "label": "B · Yan cephe",
                "width_mm": 2100,
                "turn_degrees": 0,
            },
        ],
    ],
)
def test_l_balcony_segment_rules_are_strict(
    client: TestClient,
    segments: list[dict[str, Any]],
) -> None:
    payload = balcony_enclosure_payload()
    payload["items"][0]["segments"] = segments

    response = client.post("/api/v1/requests", json=payload)

    assert response.status_code == 422


def test_custom_balcony_accepts_bounded_dynamic_segments(
    client: TestClient,
) -> None:
    payload = balcony_enclosure_payload()
    payload["items"][0]["enclosure_shape"] = "custom"
    payload["items"][0]["segments"] = [
        {
            "label": "A · Özel cephe 1",
            "width_mm": 7600,
            "turn_degrees": 0,
        },
        {
            "label": "B · Özel cephe 2",
            "width_mm": 1500,
            "turn_degrees": -90,
        },
        {
            "label": "C · Özel cephe 3",
            "width_mm": 2200,
            "turn_degrees": 0,
        },
    ]

    response = client.post("/api/v1/requests", json=payload)

    assert response.status_code == 202


@pytest.mark.parametrize(
    ("payload_factory", "field", "invalid_value"),
    [
        (guillotine_glass_payload, "width_mm", 599),
        (guillotine_glass_payload, "panel_count", 5),
        (balcony_enclosure_payload, "height_mm", 4001),
        (balcony_enclosure_payload, "system_type", "unsupported"),
    ],
)
def test_glass_product_limits_are_strict(
    client: TestClient,
    payload_factory,
    field: str,
    invalid_value: Any,
) -> None:
    payload = payload_factory()
    payload["items"][0][field] = invalid_value

    response = client.post("/api/v1/requests", json=payload)

    assert response.status_code == 422


def test_exact_cors_and_security_headers(client: TestClient) -> None:
    allowed = client.options(
        "/api/v1/requests",
        headers={
            "Origin": "https://quote.example.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "https://quote.example.com"

    denied = client.options(
        "/api/v1/requests",
        headers={
            "Origin": "https://attacker.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert denied.status_code == 400
    assert "access-control-allow-origin" not in denied.headers
    assert allowed.headers["x-content-type-options"] == "nosniff"
    assert allowed.headers["cache-control"] == "no-store"
