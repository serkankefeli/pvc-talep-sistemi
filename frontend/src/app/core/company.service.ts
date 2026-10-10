import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RUNTIME_CONFIG } from './runtime-config';

export interface CompanyAccount {
  readonly slug: string;
  readonly name: string;
  readonly plan: string;
  readonly status: string;
  readonly seat_limit: number | null;
  readonly monthly_request_limit: number | null;
  readonly trial_ends_at: string | null;
  readonly active_users: number;
  readonly requests_this_month: number;
  readonly usage_month: string;
  readonly saas_enabled: boolean;
  readonly subscription_starts_at: string | null;
  readonly subscription_ends_at: string | null;
  readonly subscription_email: string | null;
  readonly access_mode: 'active' | 'expired';
}

@Injectable({ providedIn: 'root' })
export class CompanyService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RUNTIME_CONFIG);

  current(): Observable<CompanyAccount> {
    return this.http.get<CompanyAccount>(`${this.config.apiUrl}/api/v1/admin/company`);
  }

  accessStatus(): Observable<Pick<CompanyAccount, 'access_mode'>> {
    return this.http.get<Pick<CompanyAccount, 'access_mode'>>(
      `${this.config.apiUrl}/api/v1/admin/session-status`,
    );
  }
}
