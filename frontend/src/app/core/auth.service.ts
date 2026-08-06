import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { AdminTokenResponse } from './request.models';
import { RUNTIME_CONFIG } from './runtime-config';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RUNTIME_CONFIG);
  private readonly accessToken = signal<string | null>(null);

  readonly isAuthenticated = computed(() => this.accessToken() !== null);

  token(): string | null {
    return this.accessToken();
  }

  login(username: string, password: string): Observable<AdminTokenResponse> {
    return this.http
      .post<AdminTokenResponse>(`${this.config.apiUrl}/api/v1/admin/login`, { username, password })
      .pipe(tap((response) => this.accessToken.set(response.access_token)));
  }

  logout(): void {
    this.accessToken.set(null);
  }
}
