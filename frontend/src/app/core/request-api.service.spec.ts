import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RequestApiService } from './request-api.service';
import { RUNTIME_CONFIG } from './runtime-config';

describe('RequestApiService admin workspace contract', () => {
  let service: RequestApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        RequestApiService,
        {
          provide: RUNTIME_CONFIG,
          useValue: { apiUrl: 'https://api.example.test' },
        },
      ],
    });
    service = TestBed.inject(RequestApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('passes search, favorite, sorting, and pagination through the protected list call', () => {
    service
      .listRequests({
        status: 'reviewing',
        search: '  PVC-123  ',
        favorite: true,
        sort_by: 'updated_at',
        sort_dir: 'asc',
        limit: 20,
        offset: 40,
      })
      .subscribe();

    const request = http.expectOne(
      (candidate) => candidate.url === 'https://api.example.test/api/v1/admin/requests',
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('status')).toBe('reviewing');
    expect(request.request.params.get('search')).toBe('PVC-123');
    expect(request.request.params.get('favorite')).toBe('true');
    expect(request.request.params.get('sort_by')).toBe('updated_at');
    expect(request.request.params.get('sort_dir')).toBe('asc');
    expect(request.request.params.get('limit')).toBe('20');
    expect(request.request.params.get('offset')).toBe('40');
    request.flush({ items: [], total: 0, limit: 20, offset: 40 });
  });

  it('does not send a one-character search term to the API', () => {
    service.listRequests({ search: 'a' }).subscribe();

    const request = http.expectOne(
      (candidate) => candidate.url === 'https://api.example.test/api/v1/admin/requests',
    );
    expect(request.request.params.has('search')).toBe(false);
    request.flush({ items: [], total: 0, limit: 25, offset: 0 });
  });

  it('uses idempotent PUT and DELETE calls for favorites', () => {
    service.setFavorite(7, true).subscribe();
    const add = http.expectOne('https://api.example.test/api/v1/admin/requests/7/favorite');
    expect(add.request.method).toBe('PUT');
    expect(add.request.body).toBeNull();
    add.flush({ request_id: 7, favorite: true });

    service.setFavorite(7, false).subscribe();
    const remove = http.expectOne('https://api.example.test/api/v1/admin/requests/7/favorite');
    expect(remove.request.method).toBe('DELETE');
    remove.flush({ request_id: 7, favorite: false });
  });
});
