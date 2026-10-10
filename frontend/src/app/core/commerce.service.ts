import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { RUNTIME_CONFIG } from './runtime-config';

export type DocumentKey = 'privacy' | 'refund' | 'distance_sales';
export interface LegalDocument {
  title: string;
  body: string;
  published: boolean;
  reviewed: boolean;
}
export interface CommerceConfig {
  revision: number;
  seller_name: string;
  seller_address: string;
  tax_information: string;
  support_email: string | null;
  support_phone: string;
  service_description: string;
  total_amount: string | null;
  payment_link: string;
  payment_enabled: boolean;
  public_offer_enabled?: boolean;
  documents: Record<DocumentKey, LegalDocument>;
}
export type Billing = Pick<
  CommerceConfig,
  | 'revision'
  | 'seller_name'
  | 'seller_address'
  | 'support_email'
  | 'support_phone'
  | 'service_description'
  | 'total_amount'
  | 'payment_enabled'
>;

export type PublicOffer =
  | { available: false }
  | (Billing & {
      available: true;
      currency: 'TRY';
      term_months: number;
    });
export interface PurchaseApplicant {
  full_name: string;
  company_name: string;
  email: string;
  usage_mode: 'integrated' | 'standalone';
}
export interface PurchaseIntent extends PurchaseApplicant {
  reference: string;
  created_at: string;
  total_amount: string;
  settings_revision: number;
  payment_state: string;
}

@Injectable({ providedIn: 'root' })
export class CommerceService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(RUNTIME_CONFIG).apiUrl + '/api/v1';
  legal(key: DocumentKey) {
    return this.http.get<{ title: string; body: string; revision: number }>(
      `${this.base}/legal/${key}`,
    );
  }
  configuration() {
    return this.http.get<CommerceConfig>(`${this.base}/admin/commerce`);
  }
  save(data: CommerceConfig) {
    return this.http.put<CommerceConfig>(`${this.base}/admin/commerce`, data);
  }
  billing() {
    return this.http.get<Billing>(`${this.base}/admin/billing`);
  }
  checkout(revision: number) {
    return this.http.post<{ url: string; reference: string; payment_state: string }>(
      `${this.base}/admin/checkout-link`,
      { revision, accepted: true },
    );
  }
  publicOffer() {
    return this.http.get<PublicOffer>(`${this.base}/subscription-offer`);
  }
  purchase(revision: number, idempotencyKey: string, applicant: PurchaseApplicant) {
    return this.http.post<{ url: string; reference: string; payment_state: string }>(
      `${this.base}/subscription-checkout`,
      { revision, accepted: true, idempotency_key: idempotencyKey, ...applicant },
    );
  }
  purchases() {
    return this.http.get<PurchaseIntent[]>(`${this.base}/admin/subscription-purchases`);
  }
}
