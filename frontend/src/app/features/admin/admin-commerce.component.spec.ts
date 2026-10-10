import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { CommerceService } from '../../core/commerce.service';
import { AuthService } from '../../core/auth.service';
import { AdminCommerceComponent } from './admin-commerce.component';

describe('AdminCommerceComponent annual public price', () => {
  it('saves the annual price and publication flag in the existing commerce settings', () => {
    const doc = {
      title: 'Test Legal',
      body: 'Test document body',
      published: false,
      reviewed: false,
    };
    const config = {
      revision: 1,
      seller_name: 'Test',
      seller_address: '',
      tax_information: '',
      support_email: null,
      support_phone: '',
      service_description: 'Test software',
      total_amount: null,
      payment_link: '',
      payment_enabled: false,
      public_offer_enabled: false,
      documents: { privacy: doc, refund: { ...doc }, distance_sales: { ...doc } },
    };
    const api = {
      configuration: vi.fn(() => of(config)),
      purchases: vi.fn(() => of([])),
      save: vi.fn((data) => of({ ...data, revision: 2 })),
    };
    TestBed.configureTestingModule({
      imports: [AdminCommerceComponent],
      providers: [
        { provide: CommerceService, useValue: api },
        { provide: AuthService, useValue: { can: () => true } },
      ],
    });
    const fixture = TestBed.createComponent(AdminCommerceComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(fixture.nativeElement.textContent).toContain('yıllık yazılım aboneliği fiyatı');
    component.config()!.total_amount = '18000.00';
    component.config()!.public_offer_enabled = true;
    component.save();
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({ total_amount: '18000.00', public_offer_enabled: true }),
    );
    expect(component.config()!.revision).toBe(2);
  });
});
