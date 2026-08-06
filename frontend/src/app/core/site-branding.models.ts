export interface SiteBranding {
  readonly brand_name: string;
  readonly tagline: string;
  readonly logo_url: string | null;
  readonly logo_alt: string;
  readonly updated_at: string;
}

export interface SiteBrandingUpdate {
  readonly brand_name: string;
  readonly tagline: string;
  readonly logo_alt: string;
}

export const DEFAULT_SITE_BRANDING: SiteBranding = {
  brand_name: 'Proje Çizim',
  tagline: 'Ölçünü gir, talebini görselleştir',
  logo_url: null,
  logo_alt: 'Proje Çizim logosu',
  updated_at: '',
};
