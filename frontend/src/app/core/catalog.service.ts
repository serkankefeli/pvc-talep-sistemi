import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import {
  CatalogField,
  CatalogFieldType,
  CatalogMeasurement,
  CatalogMaterialGroup,
  CatalogOption,
  CatalogProduct,
  CatalogResponse,
  containsRestrictedPublicTerm,
  isSafeCatalogFieldKey,
  isSafeCatalogKey,
} from './catalog.models';
import { BalconyProfileSpec } from './request.models';
import { FALLBACK_CATALOG_PRODUCTS } from './fallback-catalog';
import { RUNTIME_CONFIG } from './runtime-config';

const FIELD_TYPES = new Set<CatalogFieldType>(['select', 'boolean', 'text', 'number']);
const UNSAFE_PUBLIC_TEXT = /[<>]|javascript:|data:text\/html/i;
const PROFILE_SPEC_LIMITS = {
  edge_profile_mm: [0, 500],
  mullion_profile_mm: [0, 500],
  corner_profile_mm: [0, 500],
  top_profile_mm: [0, 500],
  bottom_profile_mm: [0, 500],
  mounting_gap_mm: [0, 100],
  min_glass_width_mm: [100, 3000],
  target_glass_width_mm: [100, 3000],
  max_glass_width_mm: [100, 3000],
  min_panel_count: [1, 64],
  max_panel_count: [1, 64],
} as const satisfies Readonly<Record<keyof BalconyProfileSpec, readonly [number, number]>>;
const PROFILE_SPEC_KEYS = Object.keys(PROFILE_SPEC_LIMITS) as readonly (keyof BalconyProfileSpec)[];

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function cleanNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function cleanFiniteNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function cleanPublicText(value: unknown, maxLength: number): string {
  const text = cleanText(value, maxLength);
  return containsRestrictedPublicTerm(text) || UNSAFE_PUBLIC_TEXT.test(text) ? '' : text;
}

function cleanFeatureList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(0, 12)
    .map((entry) => cleanPublicText(entry, 160))
    .filter((entry, index, entries) => Boolean(entry) && entries.indexOf(entry) === index);
}

function cleanSectionImageUrls(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(0, 4)
    .map((entry) => cleanText(entry, 2048))
    .filter((entry, index, entries) => {
      if (!entry || entries.indexOf(entry) !== index) {
        return false;
      }
      try {
        const parsed = new URL(entry);
        return (
          (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
          !parsed.username &&
          !parsed.password
        );
      } catch {
        return false;
      }
    });
}

function cleanVisualIconUrl(value: unknown): string | null {
  return cleanSectionImageUrls(typeof value === 'string' ? [value] : [])[0] ?? null;
}

function cleanProfileSpec(value: unknown): BalconyProfileSpec | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const source = value as Record<string, unknown>;
  const sourceKeys = Object.keys(source);
  if (
    sourceKeys.length !== PROFILE_SPEC_KEYS.length ||
    sourceKeys.some((key) => !Object.hasOwn(PROFILE_SPEC_LIMITS, key))
  ) {
    return null;
  }

  const result = {} as Record<keyof BalconyProfileSpec, number>;
  for (const key of PROFILE_SPEC_KEYS) {
    const candidate = source[key];
    const [minimum, maximum] = PROFILE_SPEC_LIMITS[key];
    if (
      typeof candidate !== 'number' ||
      !Number.isInteger(candidate) ||
      candidate < minimum ||
      candidate > maximum
    ) {
      return null;
    }
    result[key] = candidate;
  }

  const spec = result as BalconyProfileSpec;
  if (
    spec.min_glass_width_mm > spec.target_glass_width_mm ||
    spec.target_glass_width_mm > spec.max_glass_width_mm ||
    spec.min_panel_count > spec.max_panel_count
  ) {
    return null;
  }
  return spec;
}

function cleanMeasurement(value: unknown): CatalogMeasurement | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const source = value as Record<string, unknown>;
  const variant = source['variant'];
  if (variant !== 'opening' && variant !== 'facade' && variant !== 'balcony') {
    return null;
  }
  const measurement: CatalogMeasurement = {
    variant,
    width_instruction: cleanText(source['width_instruction'], 300),
    height_instruction: cleanText(source['height_instruction'], 300),
    short_width_label: cleanText(source['short_width_label'], 80),
    short_height_label: cleanText(source['short_height_label'], 80),
  };
  return Object.values(measurement).some(
    (part) =>
      typeof part === 'string' &&
      (containsRestrictedPublicTerm(part) || UNSAFE_PUBLIC_TEXT.test(part)),
  )
    ? null
    : measurement;
}

function cleanOptions(value: unknown): readonly CatalogOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(0, 50)
    .map((entry): CatalogOption | null => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const source = entry as Record<string, unknown>;
      const optionValue = cleanText(source['value'], 120);
      const label = cleanText(source['label'], 160);
      const description = cleanPublicText(source['description'], 1000);
      if (
        !optionValue ||
        !label ||
        containsRestrictedPublicTerm(optionValue) ||
        containsRestrictedPublicTerm(label) ||
        UNSAFE_PUBLIC_TEXT.test(optionValue) ||
        UNSAFE_PUBLIC_TEXT.test(label)
      ) {
        return null;
      }
      return {
        id: cleanNumber(source['id']),
        value: optionValue,
        label,
        description,
        features: cleanFeatureList(source['features']),
        visual_icon_url: cleanVisualIconUrl(source['visual_icon_url']),
        section_image_urls: cleanSectionImageUrls(source['section_image_urls']),
        profile_spec: cleanProfileSpec(source['profile_spec']),
        sort_order: cleanNumber(source['sort_order']),
      };
    })
    .filter((entry): entry is CatalogOption => entry !== null)
    .sort((left, right) => left.sort_order - right.sort_order);
}

function cleanFields(value: unknown): readonly CatalogField[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(0, 40)
    .map((entry): CatalogField | null => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const source = entry as Record<string, unknown>;
      const key = cleanText(source['key'], 64);
      const label = cleanText(source['label'], 160);
      const helpText = cleanText(source['help_text'], 300);
      const fieldType = source['field_type'];
      if (
        !isSafeCatalogFieldKey(key) ||
        !label ||
        typeof fieldType !== 'string' ||
        !FIELD_TYPES.has(fieldType as CatalogFieldType) ||
        containsRestrictedPublicTerm(`${key} ${label} ${helpText}`) ||
        UNSAFE_PUBLIC_TEXT.test(`${label} ${helpText}`)
      ) {
        return null;
      }
      const options = cleanOptions(source['options']);
      if (fieldType === 'select' && options.length === 0) {
        return null;
      }
      const unit = cleanText(source['unit'], 16);
      const minValue = cleanFiniteNumberOrNull(source['min_value']);
      const maxValue = cleanFiniteNumberOrNull(source['max_value']);
      const step = cleanFiniteNumberOrNull(source['step']);
      if (
        fieldType === 'number' &&
        (minValue === null || maxValue === null || step === null || minValue > maxValue || step <= 0)
      ) {
        return null;
      }
      return {
        id: cleanNumber(source['id']),
        key,
        label,
        help_text: helpText,
        field_type: fieldType as CatalogFieldType,
        unit: fieldType === 'number' ? unit : '',
        min_value: fieldType === 'number' ? minValue : null,
        max_value: fieldType === 'number' ? maxValue : null,
        step: fieldType === 'number' ? step : null,
        required: source['required'] === true,
        sort_order: cleanNumber(source['sort_order']),
        options,
      };
    })
    .filter((entry): entry is CatalogField => entry !== null)
    .sort((left, right) => left.sort_order - right.sort_order);
}

export function sanitizePublicCatalog(value: unknown): CatalogResponse {
  if (!value || typeof value !== 'object') {
    return { products: [] };
  }
  const source = value as Record<string, unknown>;
  if (!Array.isArray(source['products'])) {
    return { products: [] };
  }
  const products = source['products']
    .slice(0, 50)
    .map((entry): CatalogProduct | null => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const product = entry as Record<string, unknown>;
      const key = cleanText(product['key'], 64);
      const name = cleanText(product['name'], 120);
      const description = cleanText(product['description'], 1000);
      const mark = cleanText(product['mark'], 8);
      const rawMaterialGroup = product['material_group'];
      const materialGroup: CatalogMaterialGroup =
        rawMaterialGroup === 'aluminium' || rawMaterialGroup === 'pvc'
          ? rawMaterialGroup
          : key.startsWith('pvc_') || key === 'flyscreen'
            ? 'pvc'
            : 'aluminium';
      const measurement = cleanMeasurement(product['measurement']);
      if (
        !isSafeCatalogKey(key) ||
        !name ||
        !mark ||
        !measurement ||
        containsRestrictedPublicTerm(`${name} ${description}`) ||
        UNSAFE_PUBLIC_TEXT.test(`${name} ${description}`)
      ) {
        return null;
      }
      return {
        key,
        material_group: materialGroup,
        name,
        description,
        mark,
        sort_order: cleanNumber(product['sort_order']),
        measurement,
        fields: cleanFields(product['fields']),
      };
    })
    .filter((entry): entry is CatalogProduct => entry !== null)
    .sort((left, right) => left.sort_order - right.sort_order);
  return { products };
}

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RUNTIME_CONFIG);

  readonly fallbackProducts = FALLBACK_CATALOG_PRODUCTS;

  load(): Observable<CatalogResponse> {
    const params = new HttpParams().set('_', Date.now().toString());
    return this.http
      .get<unknown>(`${this.config.apiUrl}/api/v1/catalog`, {
        params,
      })
      .pipe(map((response) => sanitizePublicCatalog(response)));
  }
}
