import base64
from datetime import datetime, timedelta, timezone

import pytest
from sqlmodel import Session

from app.db import create_db_and_tables, create_db_engine
from app.models import LandingPage
from app.saas import TenantManifest, initialize_tenant
from test_saas import setup_saas, login

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')


def test_managed_content_order_visibility_and_tenant_isolation(setup_saas):
    _, _, _, client = setup_saas
    headers = login(client, 'alpha')
    page = client.get('/api/v1/admin/landing-page', headers=headers).json()
    page['hero_title'] = 'Alpha Landing'
    page['hero_description'] = 'Two lines\nSecond line'
    page['sections'].reverse()
    page['sections'][0]['enabled'] = False
    page['gallery'].append({'title': 'Custom model', 'description': 'Admin content', 'image_url': '', 'image_alt': ''})
    response = client.put('/api/v1/admin/landing-page', headers=headers, json=page)
    assert response.status_code == 200, response.text
    public = client.get('/api/v1/landing-page', headers={'Host': 'alpha.example'}).json()
    assert public['hero_title'] == 'Alpha Landing' and public['revision'] == 2
    assert public['sections'][0]['key'] == 'contact' and not public['sections'][0]['enabled']
    assert public['gallery'][-1]['title'] == 'Custom model'
    assert client.get('/api/v1/landing-page', headers={'Host': 'beta.example'}).json()['hero_title'] != 'Alpha Landing'
    assert client.put('/api/v1/admin/landing-page', headers=headers, json=page).status_code == 409


def test_unpublished_page_does_not_expose_hidden_content(setup_saas):
    _, _, _, client = setup_saas
    headers = login(client, 'alpha')
    page = client.get('/api/v1/admin/landing-page', headers=headers).json()
    page['published'] = False
    page['hero_title'] = 'Private draft'
    assert client.put('/api/v1/admin/landing-page', headers=headers, json=page).status_code == 200
    assert client.get('/api/v1/landing-page', headers={'Host': 'alpha.example'}).json() == {'published': False}
    assert client.get('/api/v1/admin/landing-page', headers=headers).json()['hero_title'] == 'Private draft'


@pytest.mark.parametrize('field,value', [('primary_target', 'javascript:alert(1)'),
    ('hero_image_url', 'javascript:alert(1)'), ('hero_image_url', 'http://external.example/image.png'),
    ('hero_image_url', 'https://user:password@example.com/image.png'), ('hero_title', '<script>Test</script>')])
def test_unsafe_urls_and_title_markup_rejected(setup_saas, field, value):
    _, _, _, client = setup_saas
    headers = login(client, 'alpha')
    page = client.get('/api/v1/admin/landing-page', headers=headers).json()
    page[field] = value
    assert client.put('/api/v1/admin/landing-page', headers=headers, json=page).status_code == 422


def test_media_upload_validation_persistence_and_isolation(setup_saas):
    settings, tenants, _, client = setup_saas
    headers = login(client, 'alpha')
    invalid = client.post('/api/v1/admin/landing-media', headers={**headers, 'Content-Type': 'image/svg+xml'}, content=b'<svg onload="alert(1)"></svg>')
    assert invalid.status_code == 415
    assert client.post('/api/v1/admin/landing-media', headers={**headers, 'Content-Type': 'image/png'}, content=b'').status_code == 400
    assert client.post('/api/v1/admin/landing-media', headers={'Host': 'alpha.example', 'Content-Type': 'image/png'}, content=PNG).status_code == 401
    response = client.post('/api/v1/admin/landing-media', headers={**headers, 'Content-Type': 'image/png'}, content=PNG)
    assert response.status_code == 200, response.text
    url = response.json()['url']
    assert client.get(url, headers={'Host': 'alpha.example'}).content == PNG
    assert client.get(url, headers={'Host': 'beta.example'}).status_code == 404
    page = client.get('/api/v1/admin/landing-page', headers=headers).json()
    page['hero_image_url'] = url
    assert client.put('/api/v1/admin/landing-page', headers=headers, json=page).status_code == 200
    beta = login(client, 'beta')
    page = client.get('/api/v1/admin/landing-page', headers=beta).json()
    page['hero_image_url'] = url
    assert client.put('/api/v1/admin/landing-page', headers=beta, json=page).status_code == 422
    engine = create_db_engine(tenants[0].database_url)
    target_settings = settings.model_copy(update={'saas_enabled': False, 'tenant_slug': 'alpha'})
    create_db_and_tables(engine, settings=target_settings)
    with Session(engine) as session:
        assert session.get(LandingPage, 1).data['hero_image_url'] == url
    engine.dispose()


def test_limits_and_duplicate_sections(setup_saas):
    _, _, _, client = setup_saas
    headers = login(client, 'alpha')
    page = client.get('/api/v1/admin/landing-page', headers=headers).json()
    page['sections'] = [page['sections'][0], page['sections'][0]]
    assert client.put('/api/v1/admin/landing-page', headers=headers, json=page).status_code == 422
    page = client.get('/api/v1/admin/landing-page', headers=headers).json()
    page['faq'] = [{'question': 'Test', 'answer': 'Test'}] * 21
    assert client.put('/api/v1/admin/landing-page', headers=headers, json=page).status_code == 422


def test_expired_members_public_marketing_remains_available(setup_saas):
    _, tenants, registry, client = setup_saas
    login(client, 'alpha')
    tenants[0] = tenants[0].model_copy(update={
        'subscription_starts_at': datetime.now(timezone.utc) - timedelta(days=367),
        'subscription_ends_at': datetime.now(timezone.utc) - timedelta(days=1)})
    registry.write_text(TenantManifest(tenants=tenants).model_dump_json(), encoding='utf-8')
    headers = login(client, 'alpha')
    assert client.get('/api/v1/landing-page', headers={'Host': 'alpha.example'}).status_code == 200
    assert client.get('/api/v1/admin/landing-page', headers=headers).status_code == 403


def test_only_superusers_can_edit_landing(setup_saas):
    _, _, _, client = setup_saas
    headers = login(client, 'alpha')
    page = client.get('/api/v1/admin/landing-page', headers=headers).json()
    assert client.post('/api/v1/admin/users', headers=headers, json={'username': 'editor',
        'display_name': 'Editor', 'password': 'Test editor password 123', 'is_superuser': False}).status_code == 201
    token = client.post('/api/v1/admin/login', headers={'Host': 'alpha.example'},
        json={'username': 'editor', 'password': 'Test editor password 123'}).json()['access_token']
    headers = {'Host': 'alpha.example', 'Authorization': 'Bearer ' + token}
    assert client.get('/api/v1/admin/landing-page', headers=headers).status_code == 403
    assert client.put('/api/v1/admin/landing-page', headers=headers, json=page).status_code == 403
