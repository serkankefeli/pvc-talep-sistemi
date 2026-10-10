import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CompanyService } from './company.service';
import { RUNTIME_CONFIG } from './runtime-config';

describe('CompanyService', () => {
  it('checks entitlement separately without reading full company data', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RUNTIME_CONFIG, useValue: { apiUrl: '' } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(CompanyService).accessStatus().subscribe();
    http.expectOne('/api/v1/admin/session-status').flush({ access_mode: 'active' });
    http.verify();
  });
  it('loads only the current origin account without a client-supplied tenant ID', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RUNTIME_CONFIG, useValue: { apiUrl: '' } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(CompanyService).current().subscribe();
    const request = http.expectOne('/api/v1/admin/company');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual([]);
    request.flush({});
    http.verify();
  });
});
