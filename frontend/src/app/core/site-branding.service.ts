import { HttpClient, HttpHeaders } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { map, Observable, tap } from 'rxjs';
import { DEFAULT_SITE_BRANDING, SiteBranding, SiteBrandingUpdate } from './site-branding.models';
import { RUNTIME_CONFIG } from './runtime-config';

@Injectable({ providedIn: 'root' })
export class SiteBrandingService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RUNTIME_CONFIG);
  private readonly publicUrl = `${this.config.apiUrl}/api/v1/site-branding`;
  private readonly adminUrl = `${this.config.apiUrl}/api/v1/admin/site-branding`;
  private readonly state = signal<SiteBranding>(DEFAULT_SITE_BRANDING);

  readonly branding = this.state.asReadonly();
  readonly brandMark = computed(() => {
    const firstCharacter = Array.from(this.state().brand_name.trim())[0];
    return firstCharacter?.toLocaleUpperCase('tr-TR') ?? 'P';
  });

  loadPublic(): Observable<SiteBranding> {
    return this.http.get<SiteBranding>(this.publicUrl).pipe(
      map((value) => this.normalize(value)),
      tap((value) => this.state.set(value)),
    );
  }

  loadAdmin(): Observable<SiteBranding> {
    return this.http.get<SiteBranding>(this.adminUrl).pipe(
      map((value) => this.normalize(value)),
      tap((value) => this.state.set(value)),
    );
  }

  update(payload: SiteBrandingUpdate): Observable<SiteBranding> {
    return this.http.patch<SiteBranding>(this.adminUrl, payload).pipe(
      map((value) => this.normalize(value)),
      tap((value) => this.state.set(value)),
    );
  }

  uploadLogo(file: File): Observable<SiteBranding> {
    return this.http
      .put<SiteBranding>(`${this.adminUrl}/logo`, file, {
        headers: new HttpHeaders({ 'Content-Type': file.type }),
      })
      .pipe(
        map((value) => this.normalize(value)),
        tap((value) => this.state.set(value)),
      );
  }

  deleteLogo(): Observable<void> {
    return this.http.delete<void>(`${this.adminUrl}/logo`).pipe(
      tap(() =>
        this.state.update((current) => ({
          ...current,
          logo_url: null,
          updated_at: new Date().toISOString(),
        })),
      ),
    );
  }

  private normalize(value: SiteBranding): SiteBranding {
    return {
      brand_name: this.safeText(value.brand_name, DEFAULT_SITE_BRANDING.brand_name, 120),
      tagline: this.safeText(value.tagline, '', 200),
      logo_url: this.safeLogoUrl(value.logo_url),
      logo_alt: this.safeText(value.logo_alt, DEFAULT_SITE_BRANDING.logo_alt, 160),
      updated_at: typeof value.updated_at === 'string' ? value.updated_at : '',
    };
  }

  private safeText(value: unknown, fallback: string, maxLength: number): string {
    if (typeof value !== 'string') {
      return fallback;
    }
    const normalized = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    return normalized.slice(0, maxLength) || fallback;
  }

  private safeLogoUrl(value: unknown): string | null {
    if (typeof value !== 'string' || !value) {
      return null;
    }
    try {
      const browserOrigin =
        typeof window !== 'undefined' && window.location.origin !== 'null'
          ? window.location.origin
          : 'http://localhost';
      const apiOrigin = new URL(this.config.apiUrl || browserOrigin, browserOrigin);
      const candidate = new URL(value, `${apiOrigin.origin}/`);
      if (
        !['http:', 'https:'].includes(candidate.protocol) ||
        candidate.username ||
        candidate.password ||
        candidate.origin !== apiOrigin.origin ||
        candidate.pathname !== '/api/v1/site-logo'
      ) {
        return null;
      }
      return candidate.toString();
    } catch {
      return null;
    }
  }
}
