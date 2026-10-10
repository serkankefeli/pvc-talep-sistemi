import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { CompanyAccount, CompanyService } from '../../core/company.service';
import { AdminCompanyComponent } from './admin-company.component';

describe('AdminCompanyComponent', () => {
  const account: CompanyAccount = {
    slug: 'alpha',
    name: 'Alpha Firma',
    plan: 'starter',
    status: 'active',
    seat_limit: 3,
    monthly_request_limit: 250,
    trial_ends_at: null,
    active_users: 3,
    requests_this_month: 250,
    usage_month: '2026-10',
    saas_enabled: true,
    subscription_starts_at: null,
    subscription_ends_at: null,
    subscription_email: null,
    access_mode: 'active',
  };
  const setup = (failure = false) => {
    const api = {
      current: vi.fn(() => (failure ? throwError(() => new Error('offline')) : of(account))),
    };
    TestBed.configureTestingModule({
      imports: [AdminCompanyComponent],
      providers: [provideRouter([]), { provide: CompanyService, useValue: api }],
    });
    const fixture = TestBed.createComponent(AdminCompanyComponent);
    fixture.detectChanges();
    return { fixture, api };
  };

  it('renders the company and quota warnings', () => {
    const { fixture } = setup();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Alpha Firma');
    expect(text).toContain('Başlangıç');
    expect(text).toContain('Kullanıcı sınırına ulaşıldı');
    expect(text).toContain('Aylık talep sınırına ulaşıldı');
    expect(text).toContain('Ödeme doğrulandıktan sonra');
    expect(fixture.nativeElement.querySelector('a[href="/admin/odeme"]')).not.toBeNull();
  });

  it('shows a load error and allows a retry', () => {
    const { fixture, api } = setup(true);
    expect(fixture.nativeElement.textContent).toContain('Firma bilgileri yüklenemedi');
    api.current.mockReturnValue(of(account));
    fixture.componentInstance.reload();
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Alpha Firma');
  });

  it('clamps the progress and handles unlimited plans', () => {
    const { fixture } = setup();
    expect(fixture.componentInstance.percent(4, 3)).toBe(100);
    expect(fixture.componentInstance.percent(4, null)).toBe(0);
  });

  it('shows the expiry message and hides business action links', () => {
    const { fixture } = setup();
    fixture.componentInstance.account.set({
      ...account,
      access_mode: 'expired',
      subscription_ends_at: '2026-10-01T12:00:00Z',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Aboneliğiniz sona erdi');
    expect(fixture.nativeElement.textContent).toContain('Verileriniz silinmez');
    expect(fixture.nativeElement.querySelector('a[href="/admin/talepler"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[href="/admin/kullanicilar"]')).toBeNull();
  });
});
