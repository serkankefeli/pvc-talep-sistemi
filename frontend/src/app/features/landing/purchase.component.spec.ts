import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { CommerceService, PublicOffer } from '../../core/commerce.service';
import { PurchaseComponent } from './purchase.component';

const offer: PublicOffer = {
  available: true,
  revision: 4,
  total_amount: '12000.00',
  currency: 'TRY',
  term_months: 12,
  payment_enabled: true,
  service_description: 'Test annual software',
  seller_name: 'Test Seller',
  seller_address: 'Test Address',
  support_email: 'support@example.com',
  support_phone: '+90 555 000 0000',
};

describe('PurchaseComponent', () => {
  function setup(value: PublicOffer = offer) {
    const api = {
      publicOffer: vi.fn(() => of(value)),
      purchase: vi.fn((_revision: number, _key: string, _applicant: unknown) =>
        of({
          url: 'https://iyzi.link/TEST',
          reference: 'test-ref',
          payment_state: 'pending_verification',
        }),
      ),
    };
    TestBed.configureTestingModule({
      imports: [PurchaseComponent],
      providers: [provideRouter([]), { provide: CommerceService, useValue: api }],
    });
    const fixture = TestBed.createComponent(PurchaseComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, api };
  }
  function fill(component: PurchaseComponent) {
    component.fullName = 'Test Buyer';
    component.companyName = 'Test Company';
    component.email = 'buyer@example.com';
    component.usageMode = 'integrated';
    component.refund = true;
    component.contract = true;
  }
  it('requires explicit choices and consent without requiring an existing account', () => {
    const { component, api } = setup();
    expect(component.usageMode).toBe('');
    expect(component.refund).toBe(false);
    expect(component.contract).toBe(false);
    component.prepare();
    expect(api.purchase).not.toHaveBeenCalled();
    fill(component);
    component.contract = false;
    component.prepare();
    expect(api.purchase).not.toHaveBeenCalled();
    component.contract = true;
    component.prepare();
    expect(api.purchase).toHaveBeenCalledWith(
      4,
      expect.any(String),
      expect.objectContaining({ usage_mode: 'integrated', email: 'buyer@example.com' }),
    );
  });
  it('shows annual price but no payment form when payment is closed', () => {
    const { fixture, component, api } = setup({ ...offer, payment_enabled: false });
    expect(fixture.nativeElement.textContent).toContain('12000.00 TL');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    fill(component);
    component.prepare();
    expect(api.purchase).not.toHaveBeenCalled();
  });
  it('shows an honest fallback instead of inventing a price', () => {
    const { fixture } = setup({ available: false });
    expect(fixture.nativeElement.textContent).toContain('fiyatı henüz yayımlanmadı');
    expect(fixture.nativeElement.querySelector('.annual-offer')).toBeNull();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });
  it('does not claim paid or active and invalidates a prepared link after editing', () => {
    const { fixture, component, api } = setup();
    fill(component);
    component.prepare();
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('.payment-action');
    expect(link.href).toBe('https://iyzi.link/TEST');
    expect(link.rel).toContain('noopener');
    expect(fixture.nativeElement.textContent).toContain('ödeme dekontu değildir');
    component.prepare();
    expect(api.purchase).toHaveBeenCalledTimes(1);
    component.invalidate();
    expect(component.link()).toBeNull();
    component.prepare();
    expect(api.purchase.mock.calls[0][1]).not.toBe(api.purchase.mock.calls[1][1]);
  });
  it('reloads price and resets consents after a revision conflict', () => {
    const { component, api } = setup();
    fill(component);
    api.purchase.mockReturnValue(
      throwError(() => ({ status: 409, error: { detail: 'Fiyat veya sözleşmeler değişti' } })),
    );
    component.prepare();
    expect(api.publicOffer).toHaveBeenCalledTimes(2);
    expect(component.contract).toBe(false);
    expect(component.refund).toBe(false);
    expect(component.link()).toBeNull();
    expect(component.message()).toContain('değişti');
  });
});
