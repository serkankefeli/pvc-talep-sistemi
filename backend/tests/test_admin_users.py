from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.db import create_db_engine
from app.main import create_app
from app.security import hash_password


@pytest.fixture
def client() -> TestClient:
    settings = Settings(
        environment="test",
        database_url="sqlite://",
        cors_origins="https://www.example.com",
        admin_username="administrator",
        admin_password_hash=hash_password("bootstrap password 123"),
        jwt_secret="admin-user-test-secret-longer-than-thirty-two-characters",
        auth_rate_limit_requests=100,
    )
    app = create_app(settings=settings, engine=create_db_engine("sqlite://"))
    with TestClient(app) as test_client:
        yield test_client


def _login(client: TestClient, username: str, password: str) -> tuple[str, dict]:
    response = client.post(
        "/api/v1/admin/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    payload = response.json()
    return payload["access_token"], payload


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_bootstrap_admin_can_manage_users(client: TestClient) -> None:
    admin_token, login = _login(client, "administrator", "bootstrap password 123")
    assert login["display_name"] == "Sistem Yöneticisi"
    assert login["is_superuser"] is True

    created = client.post(
        "/api/v1/admin/users",
        headers=_headers(admin_token),
        json={
            "username": "sales.user",
            "display_name": "Satış Kullanıcısı",
            "password": "initial password 123",
            "is_superuser": False,
        },
    )
    assert created.status_code == 201
    user = created.json()
    assert user["username"] == "sales.user"
    assert user["is_active"] is True
    assert "password_hash" not in user

    duplicate = client.post(
        "/api/v1/admin/users",
        headers=_headers(admin_token),
        json={
            "username": "SALES.USER",
            "display_name": "Tekrar",
            "password": "another password 123",
            "is_superuser": False,
        },
    )
    assert duplicate.status_code == 409

    listed = client.get("/api/v1/admin/users", headers=_headers(admin_token))
    assert listed.status_code == 200
    assert [item["username"] for item in listed.json()] == [
        "administrator",
        "sales.user",
    ]


def test_staff_can_change_own_password_and_sessions_are_revoked(client: TestClient) -> None:
    admin_token, _ = _login(client, "administrator", "bootstrap password 123")
    created = client.post(
        "/api/v1/admin/users",
        headers=_headers(admin_token),
        json={
            "username": "operator",
            "display_name": "Operatör",
            "password": "operator password 123",
            "is_superuser": False,
        },
    ).json()
    staff_token, _ = _login(client, "operator", "operator password 123")

    forbidden = client.get("/api/v1/admin/users", headers=_headers(staff_token))
    assert forbidden.status_code == 403

    wrong = client.post(
        "/api/v1/admin/users/me/password",
        headers=_headers(staff_token),
        json={
            "current_password": "wrong password",
            "new_password": "updated password 456",
        },
    )
    assert wrong.status_code == 401

    changed = client.post(
        "/api/v1/admin/users/me/password",
        headers=_headers(staff_token),
        json={
            "current_password": "operator password 123",
            "new_password": "updated password 456",
        },
    )
    assert changed.status_code == 204
    assert client.get("/api/v1/admin/users/me", headers=_headers(staff_token)).status_code == 401
    assert client.post(
        "/api/v1/admin/login",
        json={"username": "operator", "password": "operator password 123"},
    ).status_code == 401
    new_token, _ = _login(client, "operator", "updated password 456")
    assert client.get("/api/v1/admin/users/me", headers=_headers(new_token)).status_code == 200

    reset_self = client.post(
        f"/api/v1/admin/users/{created['id']}/password",
        headers=_headers(new_token),
        json={"new_password": "cannot reset this 789"},
    )
    assert reset_self.status_code == 403


def test_superuser_can_reset_and_disable_another_user(client: TestClient) -> None:
    admin_token, _ = _login(client, "administrator", "bootstrap password 123")
    user = client.post(
        "/api/v1/admin/users",
        headers=_headers(admin_token),
        json={
            "username": "designer",
            "display_name": "Tasarımcı",
            "password": "designer password 123",
            "is_superuser": False,
        },
    ).json()
    staff_token, _ = _login(client, "designer", "designer password 123")

    reset = client.post(
        f"/api/v1/admin/users/{user['id']}/password",
        headers=_headers(admin_token),
        json={"new_password": "designer password 456"},
    )
    assert reset.status_code == 204
    assert client.get("/api/v1/admin/users/me", headers=_headers(staff_token)).status_code == 401
    _login(client, "designer", "designer password 456")

    disabled = client.patch(
        f"/api/v1/admin/users/{user['id']}",
        headers=_headers(admin_token),
        json={"is_active": False},
    )
    assert disabled.status_code == 200
    assert disabled.json()["is_active"] is False
    assert client.post(
        "/api/v1/admin/login",
        json={"username": "designer", "password": "designer password 456"},
    ).status_code == 401


def test_superuser_cannot_remove_own_access(client: TestClient) -> None:
    admin_token, _ = _login(client, "administrator", "bootstrap password 123")
    me = client.get("/api/v1/admin/users/me", headers=_headers(admin_token)).json()

    deactivate = client.patch(
        f"/api/v1/admin/users/{me['id']}",
        headers=_headers(admin_token),
        json={"is_active": False},
    )
    assert deactivate.status_code == 409

    demote = client.patch(
        f"/api/v1/admin/users/{me['id']}",
        headers=_headers(admin_token),
        json={"is_superuser": False},
    )
    assert demote.status_code == 409
