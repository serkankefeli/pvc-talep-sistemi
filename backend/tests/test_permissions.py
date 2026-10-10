from __future__ import annotations

import json
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.config import Settings
from app.db import create_db_engine, _ensure_admin_permissions
from app.main import create_app
from app.permissions import LEGACY_PERMISSIONS, PERMISSIONS, required_permission
from app.security import hash_password


@pytest.fixture
def env():
    engine = create_db_engine('sqlite://')
    settings = Settings(environment='test', database_url='sqlite://',
        admin_username='owner', admin_password_hash=hash_password('owner password 123'),
        jwt_secret='permission-test-secret-longer-than-thirty-two-characters',
        auth_rate_limit_requests=100, _env_file=None)
    with TestClient(create_app(settings=settings, engine=engine)) as client:
        owner = login(client, 'owner', 'owner password 123')
        yield client, engine, owner


def login(client, username, password):
    response = client.post('/api/v1/admin/login', json={'username': username, 'password': password})
    assert response.status_code == 200
    return {'Authorization': 'Bearer ' + response.json()['access_token']}


def staff(client, owner, permissions=None):
    data = {'username': 'employee', 'display_name': 'Employee', 'password': 'employee password 123'}
    if permissions is not None:
        data['permissions'] = permissions
    response = client.post('/api/v1/admin/users', headers=owner, json=data)
    assert response.status_code == 201
    return response.json(), login(client, 'employee', 'employee password 123')


@pytest.mark.parametrize('permission,path,method,write_path', [
    ('requests.view', '/api/v1/admin/requests', 'PATCH', '/api/v1/admin/requests/999'),
    ('catalog.view', '/api/v1/admin/catalog/products', 'POST', '/api/v1/admin/catalog/products'),
    ('branding.view', '/api/v1/admin/site-branding', 'PATCH', '/api/v1/admin/site-branding'),
    ('landing.view', '/api/v1/admin/landing-page', 'PUT', '/api/v1/admin/landing-page'),
    ('company.view', '/api/v1/admin/company', 'POST', '/api/v1/admin/catalog/products'),
    ('commerce.view', '/api/v1/admin/commerce', 'PUT', '/api/v1/admin/commerce'),
    ('billing.view', '/api/v1/admin/billing', 'POST', '/api/v1/admin/checkout-link'),
])
def test_view_permission_does_not_grant_write_or_other_screens(env, permission, path, method, write_path):
    client, _, owner = env
    _, headers = staff(client, owner, [permission])
    assert client.get(path, headers=headers).status_code == 200
    denied = client.request(method, write_path, headers=headers, json={})
    assert denied.status_code == 403
    assert denied.json()['detail'] == 'PERMISSION_DENIED'
    assert client.get('/api/v1/admin/users', headers=headers).status_code == 403
    assert client.get('/api/v1/admin/users/permissions', headers=headers).status_code == 403


def test_new_staff_has_no_business_access_but_has_own_account_and_session_status(env):
    client, _, owner = env
    user, headers = staff(client, owner)
    assert user['permissions'] == []
    assert client.get('/api/v1/admin/users/me', headers=headers).json()['permissions'] == []
    assert client.get('/api/v1/admin/session-status', headers=headers).json() == {'access_mode': 'active'}
    for path in ['/api/v1/admin/requests', '/api/v1/admin/catalog/products',
                 '/api/v1/admin/company', '/api/v1/admin/commerce', '/api/v1/admin/billing']:
        assert client.get(path, headers=headers).status_code == 403


def test_edit_auto_grants_view_and_branding_write_is_effective(env):
    client, _, owner = env
    user, headers = staff(client, owner, ['branding.edit', 'branding.edit'])
    assert user['permissions'] == ['branding.edit', 'branding.view']
    changed = client.patch('/api/v1/admin/site-branding', headers=headers,
                           json={'brand_name': 'Authorized brand'})
    assert changed.status_code == 200
    assert client.get('/api/v1/admin/site-branding', headers=headers).json()['brand_name'] == 'Authorized brand'


def test_permission_changes_revoke_old_sessions_and_server_rechecks_database(env):
    client, _, owner = env
    user, old_headers = staff(client, owner, ['catalog.edit'])
    changed = client.patch(f"/api/v1/admin/users/{user['id']}", headers=owner,
                           json={'permissions': ['requests.view']})
    assert changed.status_code == 200
    assert client.get('/api/v1/admin/catalog/products', headers=old_headers).status_code == 401
    fresh = login(client, 'employee', 'employee password 123')
    assert client.get('/api/v1/admin/catalog/products', headers=fresh).status_code == 403
    assert client.get('/api/v1/admin/requests', headers=fresh).status_code == 200


def test_staff_cannot_escalate_even_with_all_screen_permissions(env):
    client, _, owner = env
    user, headers = staff(client, owner, sorted(PERMISSIONS))
    for payload in [{'permissions': sorted(PERMISSIONS)}, {'is_superuser': True}]:
        assert client.patch(f"/api/v1/admin/users/{user['id']}", headers=headers, json=payload).status_code == 403
    assert client.post('/api/v1/admin/users', headers=headers,
                       json={'username': 'intruder', 'display_name': 'Intruder', 'password': 'intruder password 123', 'is_superuser': True}).status_code == 403
    assert client.post('/api/v1/admin/users/1/password', headers=headers,
                       json={'new_password': 'intruder password 123'}).status_code == 403


@pytest.mark.parametrize('permissions', [['users.edit'], ['superuser'], [True], ['catalog.unknown']])
def test_unknown_permissions_rejected_on_create_and_update(env, permissions):
    client, _, owner = env
    user, _ = staff(client, owner)
    response = client.patch(f"/api/v1/admin/users/{user['id']}", headers=owner, json={'permissions': permissions})
    assert response.status_code == 422
    assert client.post('/api/v1/admin/users', headers=owner,
                       json={'username': 'invalid', 'display_name': 'Invalid', 'password': 'invalid password 123', 'permissions': permissions}).status_code == 422


def test_clear_all_permissions_does_not_restore_legacy_defaults(env):
    client, _, owner = env
    user, headers = staff(client, owner, ['catalog.view'])
    assert client.patch(f"/api/v1/admin/users/{user['id']}", headers=owner,
                        json={'permissions': []}).json()['permissions'] == []
    fresh = login(client, 'employee', 'employee password 123')
    assert client.get('/api/v1/admin/catalog/products', headers=fresh).status_code == 403


def test_superuser_has_all_permissions_and_demotion_revokes_tokens(env):
    client, _, owner = env
    assert set(client.get('/api/v1/admin/users/me', headers=owner).json()['permissions']) == PERMISSIONS
    assert client.get('/api/v1/admin/users/permissions', headers=owner).status_code == 200
    user, headers = staff(client, owner, [])
    assert client.patch(f"/api/v1/admin/users/{user['id']}", headers=owner, json={'is_superuser': True}).status_code == 200
    promoted = login(client, 'employee', 'employee password 123')
    assert client.get('/api/v1/admin/users', headers=promoted).status_code == 200
    assert client.patch(f"/api/v1/admin/users/{user['id']}", headers=owner, json={'is_superuser': False}).status_code == 200
    assert client.get('/api/v1/admin/users', headers=promoted).status_code == 401


def test_email_permission_is_separate_from_request_edit(env):
    client, _, owner = env
    _, headers = staff(client, owner, ['requests.edit'])
    assert client.post('/api/v1/admin/requests/999/send-email', headers=headers, json={}).status_code == 403
    assert required_permission('POST', '/api/v1/admin/requests/1/send-email') == 'requests.email'
    assert required_permission('POST', '/api/v1/admin/requests/1/revisions') == 'requests.edit'
    assert required_permission('PUT', '/api/v1/admin/requests/1/favorite') == 'requests.view'


def test_upgrade_preserves_existing_accounts_and_is_idempotent():
    engine = create_db_engine('sqlite://')
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE admin_users (id INTEGER PRIMARY KEY, password_hash TEXT)'))
        connection.execute(text("INSERT INTO admin_users (id, password_hash) VALUES (42, 'untouched')"))
    _ensure_admin_permissions(engine)
    _ensure_admin_permissions(engine)
    with engine.connect() as connection:
        row = connection.execute(text('SELECT id, password_hash, permissions FROM admin_users')).one()
    assert row.id == 42 and row.password_hash == 'untouched'
    assert set(json.loads(row.permissions)) == set(LEGACY_PERMISSIONS)


def test_unknown_private_endpoints_fail_closed():
    assert required_permission('GET', '/api/v1/admin/new-private-resource') == 'superuser'
