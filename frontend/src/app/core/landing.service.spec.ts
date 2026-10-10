import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RUNTIME_CONFIG } from './runtime-config';
import { LandingService } from './landing.service';
import { testPage } from '../features/landing/landing.test-data';

describe('LandingService', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RUNTIME_CONFIG, useValue: { apiUrl: 'https://api.example.com' } },
      ],
    });
    return { api: TestBed.inject(LandingService), http: TestBed.inject(HttpTestingController) };
  }
  it('loads public content and sends revisioned changes only to protected endpoints', () => {
    const { api, http } = setup();
    api.publicPage().subscribe();
    http.expectOne('https://api.example.com/api/v1/landing-page').flush(testPage());
    api.save(testPage()).subscribe();
    const request = http.expectOne('https://api.example.com/api/v1/admin/landing-page');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body.revision).toBe(1);
    request.flush({ ...testPage(), revision: 2 });
    http.verify();
  });
  it('resolves uploaded media on the configured backend and preserves HTTPS media', () => {
    const { api } = setup();
    expect(api.mediaUrl('/api/v1/landing-media/example')).toBe(
      'https://api.example.com/api/v1/landing-media/example',
    );
    expect(api.mediaUrl('https://images.example.com/demo.png')).toBe(
      'https://images.example.com/demo.png',
    );
  });
});
