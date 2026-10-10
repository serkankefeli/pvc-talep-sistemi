import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, RouterStateSnapshot } from '@angular/router';
import { AuthService } from './auth.service';
import { permissionGuard } from './permission.guard';

describe('permissionGuard', () => {
  function run(permission?: string, granted = false, authenticated = true) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            token: () => (authenticated ? 'fixture' : null),
            isAuthenticated: () => authenticated,
            can: () => granted,
          },
        },
      ],
    });
    return TestBed.runInInjectionContext(() =>
      permissionGuard(
        { data: { permission } } as unknown as ActivatedRouteSnapshot,
        { url: '/admin/katalog' } as RouterStateSnapshot,
      ),
    );
  }
  it('blocks direct URL access to a screen without view permission', () => {
    expect(run('catalog.view').toString()).toBe('/admin/yetkisiz');
  });
  it('allows the permitted screen', () => {
    expect(run('catalog.view', true)).toBe(true);
  });
  it('keeps personal account and permission-denied pages reachable without business grants', () => {
    expect(run()).toBe(true);
  });
  it('rechecks authentication on child navigation', () => {
    expect(run('catalog.view', true, false).toString()).toContain('/admin/giris');
  });
});
