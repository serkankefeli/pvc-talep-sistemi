import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { App } from './app';
import { DEFAULT_SITE_BRANDING } from './core/site-branding.models';
import { SiteBrandingService } from './core/site-branding.service';

describe('App', () => {
  const branding = signal(DEFAULT_SITE_BRANDING);
  const brandingService = {
    branding: branding.asReadonly(),
    brandMark: computed(() => branding().brand_name.charAt(0).toLocaleUpperCase('tr-TR')),
    loadPublic: vi.fn(() => of(branding())),
  };

  beforeEach(async () => {
    branding.set(DEFAULT_SITE_BRANDING);
    brandingService.loadPublic.mockClear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: SiteBrandingService, useValue: brandingService }],
    }).compileComponents();
  });

  it('creates the application shell', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.brand')?.textContent).toContain('Proje Çizim');
    expect(fixture.nativeElement.querySelector('.brand-mark')?.textContent).toContain('P');
  });

  it('renders a managed logo and brand text without reloading the shell', () => {
    branding.set({
      ...DEFAULT_SITE_BRANDING,
      brand_name: 'Anadolu PVC',
      logo_url: 'https://api.example.com/api/v1/site-logo?v=2',
      logo_alt: 'Anadolu PVC logosu',
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const image = fixture.nativeElement.querySelector('.brand-logo img') as HTMLImageElement | null;
    expect(image?.getAttribute('src')).toContain('/api/v1/site-logo?v=2');
    expect(image?.getAttribute('alt')).toBe('Anadolu PVC logosu');
    expect(fixture.nativeElement.querySelector('.brand')?.textContent).toContain('Anadolu PVC');
  });
});
