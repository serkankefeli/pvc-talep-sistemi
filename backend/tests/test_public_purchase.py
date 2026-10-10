from uuid import uuid4

from sqlmodel import Session, select

from app.models import SubscriptionPurchaseIntent, LandingPage
from app.saas import initialize_tenant
from test_saas import setup_saas, login
from test_commerce import configured


def publish(client):
    auth = login(client, 'alpha')
    config = configured(client, auth)
    config['public_offer_enabled'] = True
    response = client.put('/api/v1/admin/commerce', headers=auth, json=config)
    assert response.status_code == 200, response.text
    return auth, response.json()


def applicant(revision):
    return dict(revision=revision, accepted=True, idempotency_key=str(uuid4()),
        full_name='Test Buyer', company_name='Test Company', email='buyer@example.com',
        usage_mode='integrated')


def test_existing_private_prices_not_exposed_by_default(setup_saas):
    _, _, _, client = setup_saas
    auth = login(client, 'alpha')
    config = configured(client, auth)
    assert client.put('/api/v1/admin/commerce', headers=auth, json=config).status_code == 200
    assert client.get('/api/v1/subscription-offer', headers={'Host':'alpha.example'}).json() == {'available':False}
    assert client.post('/api/v1/subscription-checkout', headers={'Host':'alpha.example'},
        json=applicant(2)).status_code == 409


def test_price_changes_propagate_and_other_tenant_stays_private(setup_saas):
    _, _, _, client = setup_saas
    auth, config = publish(client)
    headers = {'Host':'alpha.example'}
    public = client.get('/api/v1/subscription-offer', headers=headers).json()
    assert public['total_amount'] == '1000.00' and public['term_months'] == 12
    assert 'payment_link' not in public and 'documents' not in public
    assert client.get('/api/v1/subscription-offer', headers={'Host':'beta.example'}).json() == {'available':False}
    config['total_amount'] = '2500.00'
    assert client.put('/api/v1/admin/commerce', headers=auth, json=config).status_code == 200
    assert client.get('/api/v1/subscription-offer', headers=headers).json()['total_amount'] == '2500.00'
    assert client.post('/api/v1/subscription-checkout', headers=headers, json=applicant(config['revision'])).status_code == 409


def test_anonymous_handoff_keeps_snapshot_idempotency_and_no_entitlement(setup_saas):
    settings, tenants, _, client = setup_saas
    auth, config = publish(client)
    before = client.get('/api/v1/admin/company', headers=auth).json()
    payload = applicant(config['revision'])
    headers = {'Host':'alpha.example'}
    for acceptance in (False, None):
        assert client.post('/api/v1/subscription-checkout', headers=headers,
            json={**payload, 'accepted':acceptance}).status_code == 422
    response = client.post('/api/v1/subscription-checkout', headers=headers, json=payload)
    assert response.status_code == 200, response.text
    assert response.json()['payment_state'] == 'pending_verification'
    assert client.post('/api/v1/subscription-checkout', headers=headers, json=payload).json() == response.json()
    assert client.post('/api/v1/subscription-checkout', headers=headers,
        json={**payload,'email':'different@example.com'}).status_code == 409
    assert client.get('/api/v1/admin/company', headers=auth).json()['subscription_ends_at'] == before['subscription_ends_at']
    assert client.get('/api/v1/admin/subscription-purchases', headers=headers).status_code == 401
    rows = client.get('/api/v1/admin/subscription-purchases', headers=auth).json()
    assert len(rows) == 1 and rows[0]['usage_mode'] == 'integrated'
    assert client.get('/api/v1/admin/subscription-purchases', headers=login(client,'beta')).json() == []
    config['total_amount'] = '2000.00'
    assert client.put('/api/v1/admin/commerce', headers=auth, json=config).status_code == 200
    target = initialize_tenant(settings, tenants[0])
    try:
        with Session(target.state.engine) as session:
            receipt = session.exec(select(SubscriptionPurchaseIntent)).one()
            assert receipt.snapshot['total_amount'] == '1000.00'
    finally:
        target.state.engine.dispose()


def test_public_price_can_show_without_opening_payment(setup_saas):
    _, _, _, client = setup_saas
    auth, config = publish(client)
    config['payment_enabled'] = False
    config['payment_link'] = ''
    assert client.put('/api/v1/admin/commerce', headers=auth, json=config).status_code == 200
    offer = client.get('/api/v1/subscription-offer', headers={'Host':'alpha.example'}).json()
    assert offer['available'] and not offer['payment_enabled']
    assert client.post('/api/v1/subscription-checkout', headers={'Host':'alpha.example'},
        json=applicant(config['revision']+1)).status_code == 409
    config['revision'] += 1; config['total_amount'] = None
    assert client.put('/api/v1/admin/commerce', headers=auth, json=config).status_code == 422


def test_public_purchase_validation_and_rate_limit(setup_saas):
    settings, _, _, client = setup_saas
    _, config = publish(client)
    headers = {'Host':'alpha.example'}
    for value in ('unknown', ''):
        assert client.post('/api/v1/subscription-checkout', headers=headers,
            json={**applicant(config['revision']), 'usage_mode':value}).status_code == 422
    for field in ('full_name', 'company_name'):
        assert client.post('/api/v1/subscription-checkout', headers=headers,
            json={**applicant(config['revision']), field:'   '}).status_code == 422
    payload = applicant(config['revision'])
    for _ in range(settings.public_rate_limit_requests):
        assert client.post('/api/v1/subscription-checkout', headers=headers,
            json=payload).status_code == 200
    response = client.post('/api/v1/subscription-checkout', headers=headers, json=applicant(config['revision']))
    assert response.status_code == 429 and 'retry-after' in response.headers


def test_landing_upgrade_preserves_copy_and_does_not_restore_removed_section(setup_saas):
    settings, tenants, _, _ = setup_saas
    target = initialize_tenant(settings, tenants[0])
    try:
        with Session(target.state.engine) as session:
            row = session.get(LandingPage,1)
            data = dict(row.data); data['hero_title'] = 'Custom existing title'
            for key in ('purchase_visible','purchase_label','deployment'): data.pop(key)
            data['sections'] = [s for s in data['sections'] if s['key'] != 'deployment']
            row.data = data; session.add(row); session.commit()
        from app.landing import seed_landing
        with Session(target.state.engine) as session:
            seed_landing(session); session.commit()
            row = session.get(LandingPage,1)
            assert row.data['hero_title'] == 'Custom existing title'
            assert len([s for s in row.data['sections'] if s['key']=='deployment']) == 1
            data = dict(row.data); data['sections'] = [s for s in data['sections'] if s['key']!='deployment']
            row.data = data; session.add(row); session.commit()
            revision = row.revision
            seed_landing(session); session.commit()
            assert session.get(LandingPage,1).revision == revision
            assert all(s['key']!='deployment' for s in session.get(LandingPage,1).data['sections'])
    finally:
        target.state.engine.dispose()
