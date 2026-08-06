import { FALLBACK_CATALOG_PRODUCTS } from './fallback-catalog';
import { sanitizePublicCatalog } from './catalog.service';

describe('sanitizePublicCatalog', () => {
  const balconyProfileSpec = {
    edge_profile_mm: 50,
    mullion_profile_mm: 45,
    corner_profile_mm: 70,
    top_profile_mm: 50,
    bottom_profile_mm: 50,
    mounting_gap_mm: 10,
    min_glass_width_mm: 300,
    target_glass_width_mm: 900,
    max_glass_width_mm: 1100,
    min_panel_count: 1,
    max_panel_count: 40,
  } as const;

  it('keeps a safe admin-created product outside the built-in journeys', () => {
    const base = FALLBACK_CATALOG_PRODUCTS[0]!;
    const response = sanitizePublicCatalog({
      products: [
        {
          ...base,
          key: 'pergola',
          name: 'Pergola',
          description: 'Açılır kapanır gölgelendirme sistemi',
          mark: 'PG',
        },
      ],
    });

    expect(response.products).toHaveLength(1);
    expect(response.products[0]?.key).toBe('pergola');
  });

  it('does not silently drop products after the twelfth catalog card', () => {
    const base = FALLBACK_CATALOG_PRODUCTS[0]!;
    const products = Array.from({ length: 13 }, (_value, index) => ({
      ...base,
      key: `custom_${index}`,
      name: `Özel ürün ${index}`,
      sort_order: index,
    }));

    const response = sanitizePublicCatalog({ products });

    expect(response.products).toHaveLength(13);
    expect(response.products.at(-1)?.key).toBe('custom_12');
  });

  it('keeps a safe admin-added glazing option', () => {
    const windowProduct = FALLBACK_CATALOG_PRODUCTS.find(
      (product) => product.key === 'pvc_window',
    )!;
    const response = sanitizePublicCatalog({
      products: [
        {
          ...windowProduct,
          fields: windowProduct.fields.map((field) =>
            field.key === 'glazing'
              ? {
                  ...field,
                  options: [
                    ...field.options,
                    {
                      id: 901,
                      value: 'solar_control',
                      label: 'Güneş kontrollü cam',
                      sort_order: 90,
                    },
                  ],
                }
              : field,
          ),
        },
      ],
    });

    const glazing = response.products[0]?.fields.find((field) => field.key === 'glazing');
    expect(glazing?.options.some((option) => option.value === 'solar_control')).toBe(true);
  });

  it('keeps safe series details and removes unsafe metadata', () => {
    const windowProduct = FALLBACK_CATALOG_PRODUCTS.find(
      (product) => product.key === 'pvc_window',
    )!;
    const response = sanitizePublicCatalog({
      products: [
        {
          ...windowProduct,
          fields: [
            ...windowProduct.fields,
            {
              id: 920,
              key: 'profile_series',
              label: 'Tercih edilen seri',
              help_text: 'Seri ayrıntıları seçimden sonra gösterilir.',
              field_type: 'select',
              required: false,
              sort_order: 90,
              options: [
                {
                  id: 921,
                  value: 'prestij_76',
                  label: 'Prestij 76',
                  description: 'Yalıtım ve dayanıklılık odaklı profil serisi.',
                  features: ['76 mm profil derinliği', 'Fiyat bilgisi', '<script>risk</script>'],
                  section_image_urls: [
                    'https://cdn.example.com/prestij-76.webp',
                    'javascript:alert(1)',
                  ],
                  sort_order: 10,
                },
              ],
            },
          ],
        },
      ],
    });

    const series = response.products[0]?.fields.find((field) => field.key === 'profile_series');
    expect(series).toBeTruthy();
    expect(series?.options[0]?.description).toContain('Yalıtım');
    expect(series?.options[0]?.features).toEqual(['76 mm profil derinliği']);
    expect(series?.options[0]?.section_image_urls).toEqual([
      'https://cdn.example.com/prestij-76.webp',
    ]);
  });

  it('keeps an exact, bounded balcony simulation profile specification', () => {
    const balcony = FALLBACK_CATALOG_PRODUCTS.find(
      (product) => product.key === 'balcony_enclosure',
    )!;
    const response = sanitizePublicCatalog({
      products: [
        {
          ...balcony,
          fields: balcony.fields.map((field) =>
            field.key === 'system_type'
              ? {
                  ...field,
                  options: field.options.map((option, index) => ({
                    ...option,
                    profile_spec: index === 0 ? balconyProfileSpec : null,
                  })),
                }
              : field,
          ),
        },
      ],
    });

    const option = response.products[0]?.fields
      .find((field) => field.key === 'system_type')
      ?.options.at(0);
    expect(option?.profile_spec).toEqual(balconyProfileSpec);
    expect(Object.keys(option?.profile_spec ?? {})).toHaveLength(11);
  });

  it('drops malformed, relationally invalid, or extended profile specifications', () => {
    const balcony = FALLBACK_CATALOG_PRODUCTS.find(
      (product) => product.key === 'balcony_enclosure',
    )!;
    const response = sanitizePublicCatalog({
      products: [
        {
          ...balcony,
          fields: balcony.fields.map((field) =>
            field.key === 'system_type'
              ? {
                  ...field,
                  options: field.options.map((option, index) => ({
                    ...option,
                    profile_spec:
                      index === 0
                        ? { ...balconyProfileSpec, internal_price: 1000 }
                        : index === 1
                          ? {
                              ...balconyProfileSpec,
                              min_glass_width_mm: 1000,
                              target_glass_width_mm: 900,
                            }
                          : index === 2
                            ? { ...balconyProfileSpec, edge_profile_mm: 50.5 }
                            : null,
                  })),
                }
              : field,
          ),
        },
      ],
    });

    const options = response.products[0]?.fields.find(
      (field) => field.key === 'system_type',
    )?.options;
    expect(options?.slice(0, 3).map((option) => option.profile_spec)).toEqual([null, null, null]);
  });

  it('rejects prototype keys, injection labels, and restricted public fields', () => {
    const product = FALLBACK_CATALOG_PRODUCTS[0]!;
    const response = sanitizePublicCatalog({
      products: [
        {
          ...product,
          fields: [
            ...product.fields,
            {
              id: 801,
              key: '__proto__',
              label: 'Riskli',
              help_text: '',
              field_type: 'text',
              required: false,
              sort_order: 200,
              options: [],
            },
            {
              id: 802,
              key: 'unsafe_markup',
              label: '<img src=x onerror=alert(1)>',
              help_text: '',
              field_type: 'select',
              required: false,
              sort_order: 201,
              options: [
                {
                  id: 803,
                  value: 'javascript:alert(1)',
                  label: '<svg/onload=alert(1)>',
                  sort_order: 1,
                },
              ],
            },
            {
              id: 804,
              key: 'internal_cost',
              label: 'Internal cost',
              help_text: '',
              field_type: 'text',
              required: false,
              sort_order: 202,
              options: [],
            },
          ],
        },
      ],
    });

    const keys = response.products[0]?.fields.map((field) => field.key) ?? [];
    expect(keys).not.toContain('__proto__');
    expect(keys).not.toContain('unsafe_markup');
    expect(keys).not.toContain('internal_cost');
  });

  it('rejects unsafe and commercial product keys', () => {
    const base = FALLBACK_CATALOG_PRODUCTS[0]!;
    const response = sanitizePublicCatalog({
      products: [
        { ...base, key: 'A' },
        { ...base, key: 'internal_cost' },
        { ...base, key: 'safe_product', name: '<script>alert(1)</script>' },
      ],
    });

    expect(response.products).toEqual([]);
  });

  it('keeps fallback keys aligned with backend catalog answers', () => {
    const window = FALLBACK_CATALOG_PRODUCTS.find((product) => product.key === 'pvc_window')!;
    const flyscreen = FALLBACK_CATALOG_PRODUCTS.find((product) => product.key === 'flyscreen')!;

    expect(window.fields.some((field) => field.key === 'layout')).toBe(true);
    expect(window.fields.some((field) => field.key === 'opening_direction')).toBe(true);
    expect(window.fields.some((field) => field.key === 'opening_mechanism')).toBe(true);
    expect(
      window.fields
        .find((field) => field.key === 'layout')
        ?.options.some((option) => option.value === 'window_door_window'),
    ).toBe(true);
    expect(flyscreen.fields.some((field) => field.key === 'screen_type')).toBe(true);
    for (const product of FALLBACK_CATALOG_PRODUCTS) {
      expect(
        product.fields.filter((field) => field.key.startsWith('usage_')).map((field) => field.key),
      ).toEqual(['usage_primary', 'usage_secondary', 'usage_tertiary']);
    }
  });
});
