import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';
import { RUNTIME_CONFIG } from './runtime-config';

describe('tab-scoped administrator sessions', () => {
  const base = 'https://api.example.test';
  const key = `pvc.admin.session.v1:${base}`;
  const otherKey = 'pvc.admin.session.v1:https://other.example.test';
  const identity = {
    username: 'admin',
    display_name: 'Test admin',
    is_superuser: true,
    is_active: true,
  };
  let auth: AuthService;
  let http: HttpTestingController;
  const router = { navigate: vi.fn(() => Promise.resolve(true)) };

  function saved(expiresAt = Date.now() + 900_000) {
    sessionStorage.setItem(key, JSON.stringify({ token: 'test-token', expiresAt }));
    return expiresAt;
  }
  beforeEach(() => {
    sessionStorage.removeItem(key);
    sessionStorage.removeItem(otherKey);
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
        { provide: RUNTIME_CONFIG, useValue: { apiUrl: base } },
      ],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
    sessionStorage.removeItem(key);
    sessionStorage.removeItem(otherKey);
  });

  it('stores only a time-limited token, not a password or role', () => {
    auth.login('admin', 'fixture-password').subscribe();
    http.expectOne(`${base}/api/v1/admin/login`).flush({
      ...identity,
      access_token: 'test-token',
      expires_in: 900,
      token_type: 'bearer',
    });
    const value = JSON.parse(sessionStorage.getItem(key)!);
    expect(Object.keys(value).sort()).toEqual(['expiresAt', 'token']);
    expect(value.token).toBe('test-token');
    expect(value.expiresAt).toBeGreaterThan(Date.now());
    expect(value.expiresAt).toBeLessThanOrEqual(Date.now() + 900_000);
    expect(auth.isAuthenticated()).toBe(true);
  });
  it('uses only explicitly granted business permissions for staff', () => {
    auth.login('employee', 'fixture-password').subscribe();
    http
      .expectOne(`${base}/api/v1/admin/login`)
      .flush({
        ...identity,
        is_superuser: false,
        access_token: 'test-token',
        expires_in: 900,
        permissions: ['catalog.view'],
      });
    expect(auth.can('catalog.view')).toBe(true);
    expect(auth.can('catalog.edit')).toBe(false);
    expect(auth.can('requests.view')).toBe(false);
    expect(auth.homeUrl()).toBe('/admin/katalog');
  });
  it('falls back to personal account when no business screen is granted', () => {
    auth.login('employee', 'fixture-password').subscribe();
    http
      .expectOne(`${base}/api/v1/admin/login`)
      .flush({
        ...identity,
        is_superuser: false,
        access_token: 'test-token',
        expires_in: 900,
        permissions: [],
      });
    expect(auth.homeUrl()).toBe('/admin/kullanicilar');
  });
  it('restores permissions from the server rather than browser storage', async () => {
    saved();
    const restored = auth.restoreSession();
    http
      .expectOne(`${base}/api/v1/admin/users/me`)
      .flush({ ...identity, is_superuser: false, permissions: ['branding.view'] });
    await restored;
    expect(auth.can('branding.view')).toBe(true);
    expect(auth.can('catalog.view')).toBe(false);
    expect(auth.currentIdentity()?.is_superuser).toBe(false);
  });
  it('revalidates a saved token on reload without extending its expiry', async () => {
    const deadline = saved();
    const restored = auth.restoreSession();
    expect(auth.isAuthenticated()).toBe(false);
    const request = http.expectOne(`${base}/api/v1/admin/users/me`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-token');
    request.flush(identity);
    await restored;
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.currentIdentity()?.username).toBe('admin');
    expect(JSON.parse(sessionStorage.getItem(key)!).expiresAt).toBe(deadline);
  });
  it('does not request restoration for an expired token', async () => {
    saved(Date.now() - 1);
    await auth.restoreSession();
    expect(auth.token()).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();
    http.expectNone(`${base}/api/v1/admin/users/me`);
  });
  it('rejects revoked sessions and clears tab storage', async () => {
    saved();
    const restored = auth.restoreSession();
    http
      .expectOne(`${base}/api/v1/admin/users/me`)
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    await restored;
    expect(auth.isAuthenticated()).toBe(false);
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/admin/giris']);
  });
  it('fails closed when server verification is unavailable', async () => {
    saved();
    const restored = auth.restoreSession();
    http
      .expectOne(`${base}/api/v1/admin/users/me`)
      .flush({}, { status: 503, statusText: 'Unavailable' });
    await restored;
    expect(auth.isAuthenticated()).toBe(false);
    expect(sessionStorage.getItem(key)).toBeNull();
  });
  it('ignores another API and tolerates corrupt storage', async () => {
    sessionStorage.setItem(
      otherKey,
      JSON.stringify({ token: 'other-token', expiresAt: Date.now() + 900_000 }),
    );
    await auth.restoreSession();
    http.expectNone(`${base}/api/v1/admin/users/me`);
    sessionStorage.setItem(key, '{broken');
    await auth.restoreSession();
    expect(auth.token()).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(sessionStorage.getItem(otherKey)).not.toBeNull();
  });
  it('removes the saved session on logout and later reload stays logged out', async () => {
    saved();
    auth.logout();
    await auth.restoreSession();
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(auth.currentIdentity()).toBeNull();
    http.expectNone(`${base}/api/v1/admin/users/me`);
  });
  it('continues in memory if browser tab storage is disabled', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage disabled');
    });
    auth.login('admin', 'fixture-password').subscribe();
    http
      .expectOne(`${base}/api/v1/admin/login`)
      .flush({ ...identity, access_token: 'test-token', expires_in: 900 });
    expect(auth.token()).toBe('test-token');
    expect(auth.isAuthenticated()).toBe(true);
  });
  it('clears the token after its original server-provided lifetime', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    auth.login('admin', 'fixture-password').subscribe();
    http
      .expectOne(`${base}/api/v1/admin/login`)
      .flush({ ...identity, access_token: 'test-token', expires_in: 900 });
    vi.mocked(Date.now).mockReturnValue(now + 900_001);
    expect(auth.token()).toBeNull();
    expect(auth.isAuthenticated()).toBe(false);
    expect(sessionStorage.getItem(key)).toBeNull();
  });
});
