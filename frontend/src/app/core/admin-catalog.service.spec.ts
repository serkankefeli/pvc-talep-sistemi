import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AdminCatalogService } from './admin-catalog.service';
import { RUNTIME_CONFIG } from './runtime-config';

describe('AdminCatalogService contract', () => {
  let service: AdminCatalogService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        AdminCatalogService,
        {
          provide: RUNTIME_CONFIG,
          useValue: { apiUrl: 'https://api.example.test' },
        },
      ],
    });
    service = TestBed.inject(AdminCatalogService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the flat product list endpoint', () => {
    service.loadProducts().subscribe();
    const request = http.expectOne('https://api.example.test/api/v1/admin/catalog/products');
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('soft-unpublishes a product with PATCH by key', () => {
    service.updateProduct('pvc_window', { active: false }).subscribe();
    const request = http.expectOne(
      'https://api.example.test/api/v1/admin/catalog/products/pvc_window',
    );
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ active: false });
    request.flush({});
  });

  it('creates options below the selected field', () => {
    service
      .createOption(42, {
        value: 'solar_control',
        label: 'Güneş kontrollü cam',
        active: true,
        sort_order: 50,
      })
      .subscribe();
    const request = http.expectOne(
      'https://api.example.test/api/v1/admin/catalog/fields/42/options',
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body.value).toBe('solar_control');
    request.flush({});
  });
});
