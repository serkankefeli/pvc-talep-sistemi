import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { RUNTIME_CONFIG } from './runtime-config';

export type SectionKey = 'features' | 'deployment' | 'process' | 'gallery' | 'faq' | 'contact';
export interface LandingCard {
  title: string;
  description: string;
  image_url: string;
  image_alt: string;
}
export interface LandingFAQ {
  question: string;
  answer: string;
}
export interface LandingSection {
  key: SectionKey;
  enabled: boolean;
  title: string;
  description: string;
}
export interface LandingContent {
  revision: number;
  published: boolean;
  seo_title: string;
  seo_description: string;
  eyebrow: string;
  hero_title: string;
  hero_description: string;
  hero_image_url: string;
  hero_image_alt: string;
  primary_label: string;
  primary_target: string;
  secondary_label: string;
  secondary_target: string;
  purchase_visible: boolean;
  purchase_label: string;
  badges: string[];
  features: LandingCard[];
  deployment: LandingCard[];
  process: LandingCard[];
  gallery: LandingCard[];
  faq: LandingFAQ[];
  sections: LandingSection[];
  contact_title: string;
  contact_description: string;
  contact_email: string | null;
  contact_phone: string;
  contact_address: string;
  closing_title: string;
  closing_description: string;
  closing_label: string;
  closing_target: string;
}

@Injectable({ providedIn: 'root' })
export class LandingService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(RUNTIME_CONFIG).apiUrl;
  publicPage() {
    return this.http.get<LandingContent | { published: false }>(`${this.base}/api/v1/landing-page`);
  }
  adminPage() {
    return this.http.get<LandingContent>(`${this.base}/api/v1/admin/landing-page`);
  }
  save(data: LandingContent) {
    return this.http.put<LandingContent>(`${this.base}/api/v1/admin/landing-page`, data);
  }
  upload(file: File) {
    return this.http.post<{ url: string }>(`${this.base}/api/v1/admin/landing-media`, file, {
      headers: new HttpHeaders({ 'Content-Type': file.type }),
    });
  }
  mediaUrl(url: string): string {
    return url.startsWith('/api/v1/landing-media/') ? this.base + url : url;
  }
}
