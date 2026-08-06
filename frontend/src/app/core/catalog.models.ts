import { BalconyProfileSpec, ProductType } from './request.models';

export type CatalogFieldType = 'select' | 'boolean' | 'text';
export type CatalogAnswerValue = string | boolean;
export type CatalogAnswers = Readonly<Record<string, CatalogAnswerValue>>;

export interface CatalogMeasurement {
  readonly variant: 'opening' | 'facade' | 'balcony';
  readonly width_instruction: string;
  readonly height_instruction: string;
  readonly short_width_label: string;
  readonly short_height_label: string;
}

export interface CatalogOption {
  readonly id: number;
  readonly value: string;
  readonly label: string;
  readonly description?: string;
  readonly features?: readonly string[];
  readonly section_image_urls?: readonly string[];
  readonly profile_spec?: BalconyProfileSpec | null;
  readonly sort_order: number;
}

export interface CatalogField {
  readonly id: number;
  readonly key: string;
  readonly label: string;
  readonly help_text: string;
  readonly field_type: CatalogFieldType;
  readonly required: boolean;
  readonly sort_order: number;
  readonly options: readonly CatalogOption[];
}

export interface CatalogProduct {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly mark: string;
  readonly sort_order: number;
  readonly measurement: CatalogMeasurement;
  readonly fields: readonly CatalogField[];
}

export interface CatalogResponse {
  readonly products: readonly CatalogProduct[];
}

export interface AdminCatalogOption extends CatalogOption {
  readonly field_id: number;
  readonly active: boolean;
}

export interface AdminCatalogField extends Omit<CatalogField, 'options'> {
  readonly product_key: string;
  readonly active: boolean;
}

export interface AdminCatalogProduct {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly mark: string;
  readonly active: boolean;
  readonly sort_order: number;
  readonly measurement_variant: 'opening' | 'facade' | 'balcony';
  readonly width_instruction: string;
  readonly height_instruction: string;
  readonly short_width_label: string;
  readonly short_height_label: string;
}

export interface CatalogProductWrite {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly mark: string;
  readonly sort_order: number;
  readonly active: boolean;
  readonly measurement_variant: 'opening' | 'facade' | 'balcony';
  readonly width_instruction: string;
  readonly height_instruction: string;
  readonly short_width_label: string;
  readonly short_height_label: string;
}

export interface CatalogFieldWrite {
  readonly key: string;
  readonly label: string;
  readonly help_text: string;
  readonly field_type: CatalogFieldType;
  readonly required: boolean;
  readonly sort_order: number;
  readonly active: boolean;
}

export interface CatalogOptionWrite {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
  readonly features?: readonly string[];
  readonly section_image_urls?: readonly string[];
  readonly profile_spec?: BalconyProfileSpec | null;
  readonly sort_order: number;
  readonly active: boolean;
}

export const SUPPORTED_PRODUCT_TYPES: readonly ProductType[] = [
  'pvc_window',
  'pvc_door',
  'flyscreen',
  'guillotine_glass',
  'facade_cladding',
  'balcony_enclosure',
];

export const CORE_CATALOG_KEYS = new Set([
  'template',
  'layout',
  'color',
  'opening',
  'opening_direction',
  'opening_mechanism',
  'glazing',
  'threshold',
  'mesh_type',
  'screen_type',
  'system_type',
  'panel_count',
  'glass_type',
  'bottom_fixed',
  'cladding_type',
  'panel_orientation',
  'installation_system',
  'substructure_material',
  'enclosure_shape',
  'roof_required',
  'parapet_type',
  'profile_series',
]);

const SAFE_KEY = /^[a-z][a-z0-9_]{1,63}$/;
const FORBIDDEN_KEYS = new Set([
  '__proto__',
  'catalog_answers',
  'constructor',
  'divisions',
  'drawing_version',
  'height_mm',
  'href',
  'html',
  'notes',
  'panels',
  'onerror',
  'onload',
  'product_type',
  'profile_series',
  'proto',
  'prototype',
  'quantity',
  'script',
  'src',
  'style',
  'svg',
  'width_mm',
]);
const RESTRICTED_PUBLIC_TERMS =
  /price|cost|margin|markup|discount|amount|quote|currency|bom|formula|fiyat|maliyet|marj|iskonto|kâr|₺|€|\$|\b(?:tl|try|usd|eur)\b/i;

export function isSafeCatalogKey(value: string): boolean {
  return (
    SAFE_KEY.test(value) &&
    !FORBIDDEN_KEYS.has(value) &&
    !value.startsWith('on') &&
    !containsRestrictedPublicTerm(value)
  );
}

export function isSafeCatalogFieldKey(value: string): boolean {
  return value === 'profile_series' || isSafeCatalogKey(value);
}

export function containsRestrictedPublicTerm(value: string): boolean {
  return RESTRICTED_PUBLIC_TERMS.test(value);
}

export function isProductType(value: string): value is ProductType {
  return (SUPPORTED_PRODUCT_TYPES as readonly string[]).includes(value);
}
