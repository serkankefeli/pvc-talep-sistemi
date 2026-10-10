import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { LandingService } from '../../core/landing.service';
import { CommerceService } from '../../core/commerce.service';
import { SiteBrandingService } from '../../core/site-branding.service';
import { LandingComponent } from './landing.component';
import { testPage } from './landing.test-data';

describe('LandingComponent', () => {
  function setup(response = of(testPage())) {
    TestBed.configureTestingModule({
      imports: [LandingComponent],
      providers: [
        { provide: CommerceService, useValue: { publicOffer: () => of({ available: false }) } },
        provideRouter([]),
        {
          provide: LandingService,
          useValue: { publicPage: () => response, mediaUrl: (url: string) => url },
        },
        {
          provide: SiteBrandingService,
          useValue: { branding: signal({ brand_name: 'Test Firma' }) },
        },
      ],
    });
    const fixture = TestBed.createComponent(LandingComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('loads published content and its page title', () => {
    const fixture = setup();
    expect(fixture.nativeElement.textContent).toContain('Test Hero');
    expect(TestBed.inject(Title).getTitle()).toBe(`${testPage().seo_title} | Test Firma`);
  });

  it('does not render an unpublished draft and preserves the drawing link', () => {
    const fixture = setup(of({ ...testPage(), published: false }));
    expect(fixture.nativeElement.textContent).toContain('henüz yayımlanmadı');
    expect(fixture.nativeElement.querySelector('app-landing-view')).toBeNull();
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/talep-olustur');
  });

  it('offers the drawing route when the marketing API fails', () => {
    const fixture = setup(throwError(() => new Error('Unavailable')));
    expect(fixture.nativeElement.textContent).toContain('yüklenemedi');
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/talep-olustur');
  });

  it('removes the marketing meta description when leaving the page', () => {
    const fixture = setup();
    const meta = TestBed.inject(Meta);
    expect(meta.getTag('name="description"')?.content).toBe(testPage().seo_description);
    fixture.destroy();
    expect(meta.getTag('name="description"')?.content).not.toBe(testPage().seo_description);
  });
});
