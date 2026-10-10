import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, Observable, tap, timeout } from 'rxjs';
import { AdminTokenResponse, AdminUser } from './request.models';
import { RUNTIME_CONFIG } from './runtime-config';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RUNTIME_CONFIG);
  private readonly accessToken = signal<string | null>(null);
  private expiresAt = 0;
  private readonly storageKey = `pvc.admin.session.v1:${this.config.apiUrl}`;
  private readonly identity = signal<Pick<
    AdminTokenResponse,
    'username' | 'display_name' | 'is_superuser' | 'permissions'
  > | null>(null);

  readonly isAuthenticated = computed(
    () => this.accessToken() !== null && this.identity() !== null,
  );
  readonly currentIdentity = this.identity.asReadonly();

  can(permission: string): boolean {
    const user = this.identity();
    return !!user && (user.is_superuser || !!user.permissions?.includes(permission));
  }

  homeUrl(): string {
    const screens = [
      ['requests.view', 'talepler'],
      ['catalog.view', 'katalog'],
      ['branding.view', 'marka'],
      ['landing.view', 'tanitim'],
      ['company.view', 'firma'],
      ['commerce.view', 'sozlesmeler'],
      ['billing.view', 'odeme'],
    ];
    return (
      '/admin/' + (screens.find(([permission]) => this.can(permission))?.[1] ?? 'kullanicilar')
    );
  }

  token(): string | null {
    if (this.accessToken() && this.expiresAt <= Date.now()) this.logout();
    return this.accessToken();
  }

  /** Restore only this tab's unexpired token, then ask the server for its identity. */
  async restoreSession(): Promise<void> {
    try {
      const raw = sessionStorage.getItem(this.storageKey);
      if (!raw) return;
      const saved: unknown = JSON.parse(raw);
      if (
        typeof saved !== 'object' ||
        saved === null ||
        !('token' in saved) ||
        typeof saved.token !== 'string' ||
        !saved.token ||
        saved.token.length > 8192 ||
        !('expiresAt' in saved) ||
        typeof saved.expiresAt !== 'number' ||
        !Number.isFinite(saved.expiresAt) ||
        saved.expiresAt <= Date.now() ||
        saved.expiresAt > Date.now() + 60 * 60 * 1000
      ) {
        this.logout();
        return;
      }
      this.expiresAt = saved.expiresAt;
      this.accessToken.set(saved.token);
      const user = await firstValueFrom(
        this.http.get<AdminUser>(`${this.config.apiUrl}/api/v1/admin/users/me`).pipe(timeout(5000)),
      );
      if (!user.is_active || !this.token()) {
        this.logout();
        return;
      }
      this.identity.set({
        username: user.username,
        display_name: user.display_name,
        is_superuser: user.is_superuser,
        permissions: user.permissions ?? [],
      });
    } catch {
      // Corrupt storage, denied browser storage, a revoked token or failed verification:
      // none may bypass authentication. Never keep an unverified identity.
      this.logout();
    }
  }

  login(username: string, password: string): Observable<AdminTokenResponse> {
    return this.http
      .post<AdminTokenResponse>(`${this.config.apiUrl}/api/v1/admin/login`, { username, password })
      .pipe(
        tap((response) => {
          this.expiresAt = Date.now() + Math.min(response.expires_in, 3600) * 1000;
          this.accessToken.set(response.access_token);
          this.identity.set({
            username: response.username,
            display_name: response.display_name,
            is_superuser: response.is_superuser,
            permissions: response.permissions ?? [],
          });
          try {
            sessionStorage.setItem(
              this.storageKey,
              JSON.stringify({
                token: response.access_token,
                expiresAt: this.expiresAt,
              }),
            );
          } catch {
            // Login still works in memory when the browser disallows tab storage.
          }
        }),
      );
  }

  logout(): void {
    this.expiresAt = 0;
    this.accessToken.set(null);
    this.identity.set(null);
    try {
      sessionStorage.removeItem(this.storageKey);
    } catch {
      /* Storage can be disabled. */
    }
  }
}
