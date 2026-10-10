import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LandingService } from '../../core/landing.service';
import { LandingViewComponent } from './landing-view.component';
import { testPage } from './landing.test-data';

describe('LandingViewComponent', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [LandingViewComponent],
      providers: [
        provideRouter([]),
        { provide: LandingService, useValue: { mediaUrl: (url: string) => url } },
      ],
    });
    const fixture = TestBed.createComponent(LandingViewComponent);
    const page = testPage();
    fixture.componentRef.setInput('page', page);
    fixture.detectChanges();
    return { fixture, page };
  }
  it('renders configured content and preserves the drawing route', () => {
    const { fixture } = setup();
    expect(fixture.nativeElement.textContent).toContain('Test Hero');
    expect(
      fixture.nativeElement.querySelector('a.primary:not(.purchase-button)').getAttribute('href'),
    ).toBe('/talep-olustur');
    expect(fixture.nativeElement.querySelector('a.secondary').getAttribute('href')).toBe(
      '/#iletisim',
    );
  });
  it('links purchase to the public page and shows only the explicit public annual offer', () => {
    const { fixture, page } = setup();
    expect(fixture.nativeElement.querySelector('.purchase-button').getAttribute('href')).toBe(
      '/satin-al',
    );
    expect(fixture.nativeElement.querySelector('.annual-price')).toBeNull();
    fixture.componentRef.setInput('offer', { available: true, total_amount: '15000.00' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.annual-price').textContent).toContain(
      '15000.00 TL',
    );
    page.purchase_visible = false;
    fixture.componentRef.setInput('page', { ...page });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.purchase-button')).toBeNull();
    expect(fixture.nativeElement.querySelector('.annual-price')).toBeNull();
  });
  it('honors section order and visibility', () => {
    const { fixture, page } = setup();
    page.sections.reverse();
    page.sections[1].enabled = false;
    fixture.componentRef.setInput('page', { ...page });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.content-section').id).toBe('iletisim');
    expect(fixture.nativeElement.querySelector('#faq')).toBeNull();
  });
  it('shows uploaded hero media and safely renders text', () => {
    const { fixture, page } = setup();
    page.hero_image_url = 'https://example.com/test.png';
    page.hero_image_alt = 'Test image';
    page.hero_description = '<script>alert(1)</script>';
    fixture.componentRef.setInput('page', { ...page });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.hero-image').getAttribute('alt')).toBe(
      'Test image',
    );
    expect(fixture.nativeElement.querySelector('.drawing')).toBeNull();
    expect(fixture.nativeElement.querySelector('.lead script')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('<script>');
  });
});
