from datetime import datetime, timedelta, timezone

import pytest
from sqlmodel import Session, select

from app.models import CommerceSettings, PaymentLinkAcceptance
from app.saas import TenantManifest, initialize_tenant
from test_saas import setup_saas, login


def configured(client, headers):
    data = client.get('/api/v1/admin/commerce', headers=headers).json()
    data.update(seller_name='Test Seller', seller_address='Test Address', tax_information='Test Tax Office',
                support_email='support@example.com', support_phone='+90 555 000 0000',
                total_amount='1000.00', payment_link='https://iyzi.link/TEST', payment_enabled=True)
    for doc in data['documents'].values():
        doc.update(body='Test-only reviewed contract text. No real payment.', published=True, reviewed=True)
    return data


def test_defaults_are_unpublished_and_payment_disabled(setup_saas):
    _, _, _, client = setup_saas
    auth = login(client, 'alpha')
    data = client.get('/api/v1/admin/commerce', headers=auth).json()
    assert not data['payment_enabled'] and len(data['documents']) == 3
    assert client.get('/api/v1/legal/privacy', headers={'Host': 'alpha.example'}).status_code == 404
    assert client.post('/api/v1/admin/checkout-link', headers=auth, json={'revision': 1, 'accepted': True}).status_code == 409
    assert client.get('/api/v1/admin/commerce', headers={'Host': 'alpha.example'}).status_code == 401


@pytest.mark.parametrize('url', [
    'http://iyzi.link/TEST', 'https://iyzi.link.evil.com/TEST', 'https://evil.com/TEST',
    'https://iyzi.link@evil.com/TEST', 'https://iyzi.link/TEST?redirect=https://evil.com',
    'https://iyzi.link:443/TEST', 'javascript:alert(1)',
])
def test_untrusted_payment_links_rejected(setup_saas, url):
    _, _, _, client = setup_saas
    auth = login(client, 'alpha')
    data = configured(client, auth)
    data['payment_link'] = url
    assert client.put('/api/v1/admin/commerce', headers=auth, json=data).status_code == 422


def test_publication_requires_real_fields_review_and_no_placeholders(setup_saas):
    _, _, _, client = setup_saas
    auth = login(client, 'alpha')
    for field, bad in [('seller_name', ''), ('support_email', None), ('total_amount', None)]:
        data = configured(client, auth)
        data[field] = bad
        assert client.put('/api/v1/admin/commerce', headers=auth, json=data).status_code == 422
    for field, bad in [('reviewed', False), ('body', '{{Incomplete details}}')]:
        data = configured(client, auth)
        data['documents']['privacy'][field] = bad
        assert client.put('/api/v1/admin/commerce', headers=auth, json=data).status_code == 422


def test_checkout_is_isolated_revisioned_and_does_not_extend_subscription(setup_saas):
    settings, tenants, registry, client = setup_saas
    auth = login(client, 'alpha')
    config = configured(client, auth)
    saved = client.put('/api/v1/admin/commerce', headers=auth, json=config)
    assert saved.status_code == 200, saved.text
    revision = saved.json()['revision']
    public = client.get('/api/v1/legal/privacy', headers={'Host': 'alpha.example'})
    assert public.status_code == 200 and public.json()['revision'] == revision
    assert client.get('/api/v1/legal/privacy', headers={'Host': 'beta.example'}).status_code == 404
    for accepted in (False, None):
        assert client.post('/api/v1/admin/checkout-link', headers=auth,
                           json={'revision': revision, 'accepted': accepted}).status_code == 422
    assert client.post('/api/v1/admin/checkout-link', headers=auth,
                       json={'revision': 1, 'accepted': True}).status_code == 409
    before = client.get('/api/v1/admin/company', headers=auth).json()['subscription_ends_at']
    handoff = client.post('/api/v1/admin/checkout-link', headers=auth,
                          json={'revision': revision, 'accepted': True})
    assert handoff.status_code == 200 and handoff.json()['payment_state'] == 'pending_verification'
    assert client.get('/api/v1/admin/company', headers=auth).json()['subscription_ends_at'] == before
    # Revisions preserve the actual terms accepted; changing the settings doesn't rewrite them.
    config = saved.json()
    config['documents']['privacy']['body'] = 'Updated test-only contract text, not a real contract.'
    assert client.put('/api/v1/admin/commerce', headers=auth, json=config).status_code == 200
    target = initialize_tenant(settings, tenants[0])
    try:
        with Session(target.state.engine) as session:
            receipt = session.exec(select(PaymentLinkAcceptance)).one()
            assert receipt.snapshot['documents']['privacy']['body'].startswith('Test-only')
    finally:
        target.state.engine.dispose()
    # Expired members can still read notices and get the configured payment link.
    tenants[0] = tenants[0].model_copy(update={
        'subscription_starts_at': datetime.now(timezone.utc) - timedelta(days=366),
        'subscription_ends_at': datetime.now(timezone.utc) - timedelta(days=1)})
    registry.write_text(TenantManifest(tenants=tenants).model_dump_json(), encoding='utf-8')
    auth = login(client, 'alpha')
    billing = client.get('/api/v1/admin/billing', headers=auth)
    assert billing.status_code == 200
    assert client.get('/api/v1/legal/privacy', headers={'Host': 'alpha.example'}).status_code == 200
    assert client.post('/api/v1/admin/checkout-link', headers=auth,
                      json={'revision': billing.json()['revision'], 'accepted': True}).status_code == 200
    assert client.get('/api/v1/admin/requests', headers=auth).status_code == 403


def test_stale_settings_update_and_missing_documents_rejected(setup_saas):
    _, _, _, client = setup_saas
    auth = login(client, 'alpha')
    data = configured(client, auth)
    assert client.put('/api/v1/admin/commerce', headers=auth, json=data).status_code == 200
    assert client.put('/api/v1/admin/commerce', headers=auth, json=data).status_code == 409
    data['revision'] += 1
    del data['documents']['refund']
    assert client.put('/api/v1/admin/commerce', headers=auth, json=data).status_code == 422


def test_only_superuser_can_change_seller_payment_and_legal_settings(setup_saas):
    _, _, _, client = setup_saas
    auth = login(client, 'alpha')
    data = configured(client, auth)
    response = client.post('/api/v1/admin/users', headers=auth, json={
        'username': 'sales', 'display_name': 'Sales User',
        'password': 'test sales password 123', 'is_superuser': False,
        'permissions': ['billing.view']})
    assert response.status_code == 201
    response = client.post('/api/v1/admin/login', headers={'Host': 'alpha.example'},
                           json={'username': 'sales', 'password': 'test sales password 123'})
    headers = {'Host': 'alpha.example', 'Authorization': 'Bearer ' + response.json()['access_token']}
    assert client.get('/api/v1/admin/commerce', headers=headers).status_code == 403
    assert client.put('/api/v1/admin/commerce', headers=headers, json=data).status_code == 403
    assert client.get('/api/v1/admin/billing', headers=headers).status_code == 200
