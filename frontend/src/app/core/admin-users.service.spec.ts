import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AdminUsersService } from './admin-users.service';
import { RUNTIME_CONFIG } from './runtime-config';

describe('AdminUsersService contract', () => {
  let service: AdminUsersService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        AdminUsersService,
        {
          provide: RUNTIME_CONFIG,
          useValue: { apiUrl: 'https://api.example.test' },
        },
      ],
    });
    service = TestBed.inject(AdminUsersService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the current administrator', () => {
    service.current().subscribe();
    const request = http.expectOne('https://api.example.test/api/v1/admin/users/me');
    expect(request.request.method).toBe('GET');
    request.flush({});
  });

  it('creates a separate administrator account', () => {
    service
      .create({
        username: 'operator',
        display_name: 'Operatör',
        password: 'long password 123',
        is_superuser: false,
      })
      .subscribe();
    const request = http.expectOne('https://api.example.test/api/v1/admin/users');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.username).toBe('operator');
    request.flush({});
  });

  it('uses the current-password endpoint for the signed-in user', () => {
    service.changeOwnPassword('old password', 'new password 123').subscribe();
    const request = http.expectOne(
      'https://api.example.test/api/v1/admin/users/me/password',
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      current_password: 'old password',
      new_password: 'new password 123',
    });
    request.flush(null);
  });
});
