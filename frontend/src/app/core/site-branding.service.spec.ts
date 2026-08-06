import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RUNTIME_CONFIG } from './runtime-config';
import { SiteBrandingService } from './site-branding.service';

describe('SiteBrandingService', () => {
  let service: SiteBrandingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SiteBrandingService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: RUNTIME_CONFIG,
          useValue: { apiUrl: 'https://api.example.com' },
        },
      ],
    });
    service = TestBed.inject(SiteBrandingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads public branding and resolves only the API logo endpoint', () => {
    service.loadPublic().subscribe();

    const request = http.expectOne('https://api.example.com/api/v1/site-branding');
    request.flush({
      brand_name: 'Anadolu PVC',
      tagline: 'Yeni yaşam alanları',
      logo_url: '/api/v1/site-logo?v=4',
      logo_alt: 'Anadolu PVC logosu',
      updated_at: '2026-07-30T12:00:00Z',
    });

    expect(service.branding().brand_name).toBe('Anadolu PVC');
    expect(service.branding().logo_url).toBe('https://api.example.com/api/v1/site-logo?v=4');
    expect(service.brandMark()).toBe('A');
  });

  it('drops an external logo URL returned by the API', () => {
    service.loadPublic().subscribe();

    http.expectOne('https://api.example.com/api/v1/site-branding').flush({
      brand_name: 'Güvenli Marka',
      tagline: '',
      logo_url: 'https://attacker.example/logo.svg',
      logo_alt: 'Güvenli Marka logosu',
      updated_at: '2026-07-30T12:00:00Z',
    });

    expect(service.branding().logo_url).toBeNull();
  });

  it('uploads the file as a raw image body and updates shared state', () => {
    const file = new File(['png-data'], 'logo.png', { type: 'image/png' });
    service.uploadLogo(file).subscribe();

    const request = http.expectOne('https://api.example.com/api/v1/admin/site-branding/logo');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toBe(file);
    expect(request.request.headers.get('Content-Type')).toBe('image/png');
    request.flush({
      brand_name: 'Proje Çizim',
      tagline: 'Ölçünü gir',
      logo_url: '/api/v1/site-logo?v=1',
      logo_alt: 'Proje Çizim logosu',
      updated_at: '2026-07-30T12:00:00Z',
    });

    expect(service.branding().logo_url).toContain('/api/v1/site-logo?v=1');
  });

  it('removes the logo from shared state after deletion', () => {
    service.deleteLogo().subscribe();

    const request = http.expectOne('https://api.example.com/api/v1/admin/site-branding/logo');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);

    expect(service.branding().logo_url).toBeNull();
  });
});

describe('SiteBrandingService with same-origin API', () => {
  let service: SiteBrandingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SiteBrandingService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RUNTIME_CONFIG, useValue: { apiUrl: '' } },
      ],
    });
    service = TestBed.inject(SiteBrandingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('keeps API calls and logo assets on the browser origin', () => {
    service.loadPublic().subscribe();

    http.expectOne('/api/v1/site-branding').flush({
      brand_name: 'Anadolu PVC',
      tagline: '',
      logo_url: '/api/v1/site-logo?v=7',
      logo_alt: 'Anadolu PVC logosu',
      updated_at: '2026-08-01T00:00:00Z',
    });

    const logoUrl = new URL(service.branding().logo_url ?? '');
    expect(logoUrl.pathname).toBe('/api/v1/site-logo');
    expect(logoUrl.search).toBe('?v=7');
  });
});
