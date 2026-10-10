import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { firstValueFrom, Observable, of } from 'rxjs';
import { vi } from 'vitest';
import { CompanyService } from './company.service';
import { subscriptionGuard } from './subscription.guard';

describe('subscriptionGuard', () => {
  function setup(mode: string) {
    const api = { accessStatus: vi.fn(() => of({ access_mode: mode })) };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: CompanyService, useValue: api }],
    });
    return api;
  }

  async function run(url: string) {
    const result = TestBed.runInInjectionContext(() =>
      subscriptionGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );
    return typeof result === 'boolean'
      ? result
      : firstValueFrom(result as Observable<boolean | UrlTree>);
  }

  it('redirects an expired member to the account screen', async () => {
    setup('expired');
    expect((await run('/admin/talepler')).toString()).toBe('/admin/abonelik-bitti');
  });
  it('allows an active member to use the system', async () => {
    setup('active');
    expect(await run('/admin/talepler')).toBe(true);
  });
  it('allows the account screen without a redirect loop', async () => {
    const api = setup('expired');
    expect(await run('/admin/firma')).toBe(true);
    expect(api.accessStatus).not.toHaveBeenCalled();
  });
  it('allows expired members to reach renewal payment', async () => {
    const api = setup('expired');
    expect(await run('/admin/odeme')).toBe(true);
    expect(api.accessStatus).not.toHaveBeenCalled();
  });
});
