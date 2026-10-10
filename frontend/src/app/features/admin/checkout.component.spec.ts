import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { CommerceService } from '../../core/commerce.service';
import { AuthService } from '../../core/auth.service';
import { CheckoutComponent } from './checkout.component';

describe('CheckoutComponent', () => {
  function setup(enabled = true) {
    const api = {
      billing: vi.fn(() =>
        of({
          revision: 2,
          payment_enabled: enabled,
          seller_name: 'Test Seller',
          seller_address: 'Test Address',
          service_description: 'Test Annual Software',
          total_amount: '1000.00',
          support_email: 'test@example.com',
          support_phone: 'Test Phone',
        }),
      ),
      checkout: vi.fn(() =>
        of({
          url: 'https://iyzi.link/TEST',
          reference: 'test-reference',
          payment_state: 'pending_verification',
        }),
      ),
    };
    TestBed.configureTestingModule({
      imports: [CheckoutComponent],
      providers: [
        provideRouter([]),
        { provide: CommerceService, useValue: api },
        { provide: AuthService, useValue: { can: () => true } },
      ],
    });
    const fixture = TestBed.createComponent(CheckoutComponent);
    fixture.detectChanges();
    return { fixture, api, component: fixture.componentInstance };
  }
  it('requires explicit unchecked agreements and does not claim paid status', () => {
    const { fixture, api, component } = setup();
    expect(component.refund).toBe(false);
    expect(component.contract).toBe(false);
    component.prepare(2);
    expect(api.checkout).not.toHaveBeenCalled();
    component.refund = true;
    component.contract = true;
    component.prepare(2);
    fixture.detectChanges();
    expect(api.checkout).toHaveBeenCalledWith(2);
    const anchor = fixture.nativeElement.querySelector('.payment-action');
    expect(anchor.href).toBe('https://iyzi.link/TEST');
    expect(anchor.rel).toContain('noopener');
    expect(fixture.nativeElement.textContent).toContain('ödeme dekontu değildir');
  });
  it('does not offer payment while configuration is disabled', () => {
    const { fixture } = setup(false);
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Ödeme henüz aktif değil');
  });
  it('resets agreement acceptance when server terms change', () => {
    const { component, api } = setup();
    api.checkout.mockReturnValue(throwError(() => ({ status: 409 })));
    component.refund = true;
    component.contract = true;
    component.prepare(2);
    expect(component.refund).toBe(false);
    expect(component.contract).toBe(false);
    expect(component.link()).toBeNull();
    expect(component.message()).toContain('koşullar değişti');
  });
});
