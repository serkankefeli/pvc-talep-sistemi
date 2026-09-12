import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CatalogProduct } from '../../core/catalog.models';
import { CatalogService } from '../../core/catalog.service';
import { FALLBACK_CATALOG_PRODUCTS } from '../../core/fallback-catalog';
import { RUNTIME_CONFIG } from '../../core/runtime-config';
import { PUBLIC_REVIEW_MESSAGE, ConfiguratorComponent } from './configurator.component';

const restrictedTerms = /\b(price|cost|margin|quoted_amount|quotedAmount)\b|fiyat|maliyet|kâr/i;

describe('ConfiguratorComponent public boundary', () => {
  let liveProducts: readonly CatalogProduct[];

  beforeEach(async () => {
    liveProducts = FALLBACK_CATALOG_PRODUCTS;
    await TestBed.configureTestingModule({
      imports: [ConfiguratorComponent],
      providers: [
        provideHttpClient(),
        {
          provide: CatalogService,
          useValue: {
            fallbackProducts: FALLBACK_CATALOG_PRODUCTS,
            load: () => of({ products: liveProducts }),
          },
        },
        {
          provide: RUNTIME_CONFIG,
          useValue: { apiUrl: 'http://localhost:8000' },
        },
      ],
    }).compileComponents();
  });

  it('contains no commercial calculation language in public UI or model', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    fixture.componentInstance.step.set(2);
    fixture.detectChanges();

    const publicText = (fixture.nativeElement as HTMLElement).textContent ?? '';
    const publicModel = JSON.stringify({
      products: fixture.componentInstance.productChoices(),
      notice: PUBLIC_REVIEW_MESSAGE,
      item: fixture.componentInstance.currentItem(),
    });

    expect(publicText).not.toMatch(restrictedTerms);
    expect(publicModel).not.toMatch(restrictedTerms);
  }, 30_000);

  it('offers all six supported product journeys', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    expect(fixture.componentInstance.productChoices().map((product) => product.key)).toEqual([
      'pvc_window',
      'pvc_door',
      'flyscreen',
      'guillotine_glass',
      'facade_cladding',
      'balcony_enclosure',
    ]);
  });

  it('branches product selection into PVC and aluminium categories', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelectorAll('.material-card')).toHaveLength(2);
    expect(element.querySelectorAll('.product-card')).toHaveLength(0);

    component.selectMaterialGroup('pvc');
    fixture.detectChanges();
    expect(component.visibleProductChoices().map((product) => product.key)).toEqual([
      'pvc_window',
      'pvc_door',
      'flyscreen',
    ]);
    expect(element.textContent).toContain('PVC Doğrama');
    expect(element.textContent).not.toContain('Giyotin cam');

    component.selectMaterialGroup('aluminium');
    fixture.detectChanges();
    expect(component.visibleProductChoices().map((product) => product.key)).toEqual([
      'guillotine_glass',
      'facade_cladding',
      'balcony_enclosure',
    ]);
    expect(element.textContent).toContain('Alüminyum Doğrama');
    expect(element.textContent).not.toContain('PVC kapı');
  });

  it('starts with blank measurements and keeps the architectural scene empty', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.step.set(2);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(component.productForm.controls.width.value).toBeNull();
    expect(component.productForm.controls.height.value).toBeNull();
    expect(component.measurementReady()).toBe(false);
    expect(element.querySelector('app-installation-scene .mounting-opening')).toBeTruthy();
    expect(element.querySelector('[data-testid="installed-unit"]')).toBeNull();
    expect((element.querySelector('#width') as HTMLInputElement).value).toBe('');
    expect((element.querySelector('#height') as HTMLInputElement).value).toBe('');
  });

  it('starts managed select fields at the explicit Seçin state', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.step.set(2);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const firstQuestion = element.querySelector<HTMLSelectElement>('#catalog-question-0');

    expect(firstQuestion?.value).toBe('');
    expect(component.catalogForm().controls['layout']?.value).toBe('');
    expect(element.querySelector('.visual-selection-rail')).toBeTruthy();
    expect(element.textContent).toContain('Seçin');
    expect(component.catalogForm().invalid).toBe(true);
  });

  it('renders admin-defined numeric measurements even when visual selections are present', () => {
    liveProducts = FALLBACK_CATALOG_PRODUCTS.map((product) =>
      product.key === 'pvc_window'
        ? {
            ...product,
            fields: [
              ...product.fields,
              {
                id: 990,
                key: 'frame_profile_width_mm',
                label: 'Çerçeve görünür genişliği',
                help_text: 'Teknik ölçü',
                field_type: 'number' as const,
                unit: 'mm',
                min_value: 30,
                max_value: 200,
                step: 1,
                required: false,
                sort_order: 52,
                options: [],
              },
            ],
          }
        : product,
    );
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.step.set(2);
    fixture.detectChanges();

    expect(component.nonVisualDetailFields().map((field) => field.key)).toContain(
      'frame_profile_width_mm',
    );
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '.numeric-field input[type="number"]',
    );
    expect(input).toBeTruthy();
    expect(input?.min).toBe('30');
    expect(input?.max).toBe('200');

    component.catalogForm().controls['frame_profile_width_mm']?.setValue(76);
    expect(component.currentItem().catalog_answers['frame_profile_width_mm']).toBe(76);
    component.catalogForm().controls['frame_profile_width_mm']?.setValue(250);
    expect(component.catalogForm().controls['frame_profile_width_mm']?.invalid).toBe(true);
  });

  it('selects a window model from the visual option cards', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.step.set(2);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const doubleSashCard = [
      ...element.querySelectorAll<HTMLButtonElement>('.visual-option-card'),
    ].find((card) => card.textContent?.includes('Çift kanat'));
    expect(doubleSashCard).toBeTruthy();

    doubleSashCard?.click();
    fixture.detectChanges();

    expect(component.catalogForm().controls['layout']?.value).toBe('double_sash');
    expect(component.visualFieldSelectionLabel(component.activeVisualField()!)).toBe('Çift kanat');
    expect(doubleSashCard?.classList.contains('selected')).toBe(true);
  });

  it('places the product only after both measurements are valid', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.step.set(2);

    component.productForm.controls.width.setValue(1200);
    fixture.detectChanges();
    expect(component.measurementReady()).toBe(false);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="installed-unit"]'),
    ).toBeNull();

    component.productForm.controls.height.setValue(1400);
    fixture.detectChanges();
    expect(component.measurementReady()).toBe(true);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="installed-unit"]'),
    ).toBeTruthy();
  });

  it('builds a combined door and window drawing with per-panel opening choices', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.step.set(2);

    component.catalogForm().controls['layout']?.setValue('window_door_window');
    component.catalogForm().controls['opening_mechanism']?.setValue('tilt_turn');
    component.catalogForm().controls['opening_direction']?.setValue('right');
    component.updateJoineryPanelOpening(0, 'fixed');
    component.productForm.patchValue({ width: 2400, height: 2100 });
    fixture.detectChanges();

    const item = component.currentItem();
    expect(item.product_type).toBe('pvc_window');
    if (item.product_type === 'pvc_window' && 'layout' in item) {
      expect(item.layout).toBe('window_door_window');
      expect(item.drawing_version).toBe('2');
      expect(item.panels?.map((panel) => panel.role)).toEqual(['window', 'door', 'window']);
      expect(item.panels?.[0]?.opening).toBe('fixed');
      expect(item.panels?.[0]?.hinge).toBe('none');
      expect(item.panels?.[1]?.opening).toBe('tilt_turn');
    }

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.joinery-panel-card')).toHaveLength(3);
    expect(element.textContent).toContain('Kapı ve pencere bölümlerini ayarlayın');
    expect(element.textContent).toContain('PVC kapı + pencere');
  });

  it('draws unequal sash widths from customer-entered millimetres', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.step.set(2);
    component.catalogForm().controls['layout']?.setValue('double_sash');
    component.productForm.patchValue({ width: 2000, height: 1450 });

    component.updateJoineryColumnWidth(0, '700');
    fixture.detectChanges();

    expect(component.joineryColumnWidthMm(0)).toBe(700);
    expect(component.joineryColumnWidthMm(1)).toBe(1300);
    const item = component.currentItem();
    if (item.product_type === 'pvc_window' && 'panels' in item) {
      expect(item.panels?.[0]?.width_percent).toBeCloseTo(35, 5);
      expect(item.panels?.[1]?.x_percent).toBeCloseTo(35, 5);
      expect(item.panels?.[1]?.width_percent).toBeCloseTo(65, 5);
    }
    const inputs = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>(
      '.joinery-dimension-grid input',
    );
    expect([...inputs].map((input) => Number(input.value))).toEqual([700, 1300]);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.joinery-summary')?.textContent,
    ).toContain('Sol kanat: 700 × 1.450 mm');
  });

  it('draws an exact upper transom height and preserves it in the request panels', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.step.set(2);
    component.catalogForm().controls['layout']?.setValue('transom');
    component.productForm.patchValue({ width: 1400, height: 2000 });

    component.updateJoineryRowHeight(0, '450');
    fixture.detectChanges();

    expect(component.joineryRowHeightMm(0)).toBe(450);
    expect(component.joineryRowHeightMm(1)).toBe(1550);
    const item = component.currentItem();
    if (item.product_type === 'pvc_window' && 'panels' in item) {
      expect(item.panels?.[0]?.height_percent).toBeCloseTo(22.5, 5);
      expect(item.panels?.[1]?.y_percent).toBeCloseTo(22.5, 5);
    }
  });

  it('rejects a section dimension that leaves another sash below the safe minimum', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.catalogForm().controls['layout']?.setValue('double_sash');
    component.productForm.patchValue({ width: 1000, height: 1200 });

    component.updateJoineryColumnWidth(0, '950');

    expect(component.joineryColumnWidthMm(0)).toBe(500);
    expect(component.joineryDimensionError()).toContain('arasında olmalıdır');
  });

  it('keeps a fixed right sash selection in the live window drawing', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.step.set(2);

    component.catalogForm().controls['layout']?.setValue('double_sash');
    component.catalogForm().controls['opening_mechanism']?.setValue('tilt_turn');
    component.catalogForm().controls['opening_direction']?.setValue('right');
    component.productForm.patchValue({ width: 2000, height: 1450 });
    fixture.detectChanges();

    const openingSelect = (fixture.nativeElement as HTMLElement).querySelector(
      '#panel-opening-1',
    ) as HTMLSelectElement | null;
    expect(openingSelect).toBeTruthy();
    openingSelect!.value = 'fixed';
    openingSelect!.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const item = component.currentItem();
    expect(item.product_type).toBe('pvc_window');
    if (item.product_type === 'pvc_window' && 'layout' in item) {
      expect(item.panels?.[1]?.slot).toBe('right_window');
      expect(item.panels?.[1]?.opening).toBe('fixed');
      expect(item.panels?.[1]?.hinge).toBe('none');
    }

    const element = fixture.nativeElement as HTMLElement;
    const rightPanel = element.querySelector(
      'app-installation-scene [data-panel-slot="right_window"]',
    );
    expect(rightPanel?.getAttribute('data-panel-opening')).toBe('fixed');
    expect(element.querySelector('#panel-hinge-1')).toBeNull();
    expect(element.querySelector('.joinery-summary')?.textContent).toContain(
      'Sağ kanat: 1.000 × 1.450 mm · Sabit',
    );
  });

  it('starts a double-sash layout with a turn opening on each sash', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.step.set(2);
    component.catalogForm().controls['layout']?.setValue('double_sash');
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(component.joineryPanelSelections()).toEqual(['turn', 'turn']);
    expect((element.querySelector('#panel-opening-0') as HTMLSelectElement)?.value).toBe('turn');
    expect((element.querySelector('#panel-opening-1') as HTMLSelectElement)?.value).toBe('turn');
    expect((element.querySelector('#panel-hinge-0') as HTMLSelectElement)?.value).toBe('left');
    expect((element.querySelector('#panel-hinge-1') as HTMLSelectElement)?.value).toBe('right');
    expect(component.joinerySelectionsComplete()).toBe(true);
    const item = component.currentItem();
    if ('panels' in item) {
      expect(item.panels?.every((panel) => panel.opening === 'turn')).toBe(true);
    }
  });

  it('uses one panel card as the source of truth for a single door', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.selectProduct('pvc_door');
    component.catalogForm().controls['layout']?.setValue('single');
    component.catalogForm().controls['glazing']?.setValue('panel');
    component.updateJoineryPanelOpening(0, 'turn');
    component.updateJoineryPanelHinge(0, 'left');
    component.productForm.patchValue({ width: 900, height: 2100 });
    fixture.detectChanges();

    const item = component.currentItem();
    expect(item.product_type).toBe('pvc_door');
    if (item.product_type === 'pvc_door' && 'glazing' in item) {
      expect(item.glazing).toBe('panel');
      expect(item.opening_direction).toBe('left');
      expect(item.panels?.[0]?.opening).toBe('turn');
      expect(item.panels?.[0]?.hinge).toBe('left');
      expect(item.catalog_answers['opening_direction']).toBe('left');
      expect(item.catalog_answers['opening_mechanism']).toBe('turn');
    }
    expect(component.currentDetailFields().map((field) => field.key)).not.toEqual(
      expect.arrayContaining(['opening_direction', 'opening_mechanism']),
    );
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('#panel-opening-0')).toHaveLength(1);
    expect(element.querySelectorAll('#panel-hinge-0')).toHaveLength(1);
    expect(element.textContent).not.toContain('Kanat açılım şekli');
  });

  it('clears old measurements when the customer changes product', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.productForm.patchValue({ width: 1200, height: 1400 });

    component.selectProduct('pvc_door');

    expect(component.productForm.controls.width.value).toBeNull();
    expect(component.productForm.controls.height.value).toBeNull();
    expect(component.measurementReference()).toEqual({ widthMm: 900, heightMm: 2100 });
    expect(component.measurementReady()).toBe(false);
  });

  it('uses admin-managed short measurement labels on standard and balcony inputs', () => {
    liveProducts = FALLBACK_CATALOG_PRODUCTS.map((product) => {
      if (product.key === 'pvc_window') {
        return {
          ...product,
          measurement: {
            ...product.measurement,
            short_width_label: 'Net doğrama eni',
            short_height_label: 'Net doğrama boyu',
          },
        };
      }
      if (product.key === 'balcony_enclosure') {
        return {
          ...product,
          measurement: {
            ...product.measurement,
            short_width_label: 'Açık cephe uzunluğu',
            short_height_label: 'Balkon net yüksekliği',
          },
        };
      }
      return product;
    });

    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.step.set(2);
    fixture.detectChanges();

    let element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('label[for="width"]')?.textContent).toContain('Net doğrama eni');
    expect(element.querySelector('label[for="height"]')?.textContent).toContain('Net doğrama boyu');

    component.selectProduct('balcony_enclosure');
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('label[for="balcony-width-0"]')?.textContent).toContain(
      'Açık cephe uzunluğu',
    );
    expect(element.querySelector('label[for="balcony-height"]')?.textContent).toContain(
      'Balkon net yüksekliği',
    );
  });

  it('shows admin-managed series details and sends the visible series name', () => {
    const windowProduct = FALLBACK_CATALOG_PRODUCTS.find(
      (product) => product.key === 'pvc_window',
    )!;
    liveProducts = FALLBACK_CATALOG_PRODUCTS.map((product) =>
      product.key === 'pvc_window'
        ? {
            ...windowProduct,
            fields: [
              ...windowProduct.fields,
              {
                id: 930,
                key: 'profile_series',
                label: 'Tercih edilen seri',
                help_text: 'Seri özelliklerini inceleyerek seçim yapın.',
                field_type: 'select' as const,
                required: true,
                sort_order: 90,
                options: [
                  {
                    id: 931,
                    value: 'prestij_76',
                    label: 'Prestij 76',
                    description: 'Yalıtım ve dayanıklılık odaklı profil serisi.',
                    features: ['76 mm profil derinliği', 'Çok odacıklı gövde'],
                    section_image_urls: ['https://cdn.example.com/sections/prestij-76.webp'],
                    sort_order: 10,
                  },
                ],
              },
            ],
          }
        : product,
    );
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.step.set(2);
    component.productForm.controls.profileSeries.setValue('prestij_76');
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('select#profileSeries')).toBeTruthy();
    expect(element.querySelector('input#profileSeries')).toBeNull();
    expect(element.textContent).toContain('Yalıtım ve dayanıklılık');
    expect(element.textContent).toContain('76 mm profil derinliği');
    expect(element.querySelector('.series-sections img')?.getAttribute('alt')).toContain(
      'Prestij 76 kesit görünümü',
    );
    expect(element.querySelector('.series-info .profile-spec-summary')).toBeNull();
    expect(component.currentItem().profile_series).toBe('Prestij 76');
    expect(component.currentItem().catalog_answers['profile_series']).toBeUndefined();
    expect(element.querySelectorAll('[innerhtml]')).toHaveLength(0);

    component.productForm.controls.profileSeries.setValue('yayinda_olmayan_seri');
    expect(component.productForm.controls.profileSeries.invalid).toBe(true);
    component.selectProduct('pvc_door');
    fixture.detectChanges();
    expect(component.productForm.controls.profileSeries.value).toBe('');
    expect(element.querySelector('.series-info')).toBeNull();
  });

  it('snapshots an admin-managed PVC profile series measurement on the request item', () => {
    const windowProduct = FALLBACK_CATALOG_PRODUCTS.find(
      (product) => product.key === 'pvc_window',
    )!;
    const windowProfileSpec = {
      edge_profile_mm: 76,
      mullion_profile_mm: 82,
      corner_profile_mm: 90,
      top_profile_mm: 76,
      bottom_profile_mm: 76,
      mounting_gap_mm: 12,
      min_glass_width_mm: 350,
      target_glass_width_mm: 700,
      max_glass_width_mm: 1000,
      min_panel_count: 1,
      max_panel_count: 12,
    } as const;
    liveProducts = FALLBACK_CATALOG_PRODUCTS.map((product) =>
      product.key === 'pvc_window'
        ? {
            ...windowProduct,
            fields: [
              ...windowProduct.fields,
              {
                id: 932,
                key: 'profile_series',
                label: 'Profil serisi',
                help_text: 'Üretici profil serisini seçin.',
                field_type: 'select' as const,
                required: false,
                sort_order: 90,
                options: [
                  {
                    id: 933,
                    value: 'yalitim_76',
                    label: 'Yalıtım 76',
                    profile_spec: windowProfileSpec,
                    sort_order: 10,
                  },
                ],
              },
            ],
          }
        : product,
    );

    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.productForm.controls.profileSeries.setValue('yalitim_76');

    expect(component.currentItem().profile_series).toBe('Yalıtım 76');
    expect(component.currentItem().profile_spec).toEqual(windowProfileSpec);
  });

  it('builds an admin-created product from the safe generic catalog contract', () => {
    const base = FALLBACK_CATALOG_PRODUCTS[0]!;
    liveProducts = [
      {
        ...base,
        key: 'pergola',
        name: 'Pergola',
        description: 'Açılır kapanır gölgelendirme sistemi',
        mark: 'PG',
        fields: [
          {
            id: 2001,
            key: 'usage_primary',
            label: 'Nerede kullanılacak?',
            help_text: '',
            field_type: 'select',
            required: true,
            sort_order: 10,
            options: [
              { id: 2002, value: 'terrace', label: 'Teras', sort_order: 10 },
              { id: 2003, value: 'garden', label: 'Bahçe', sort_order: 20 },
            ],
          },
          {
            id: 2004,
            key: 'color',
            label: 'Renk',
            help_text: '',
            field_type: 'select',
            required: true,
            sort_order: 40,
            options: [
              { id: 2005, value: 'white', label: 'Beyaz', sort_order: 10 },
              { id: 2006, value: 'anthracite', label: 'Antrasit', sort_order: 20 },
            ],
          },
          {
            id: 2007,
            key: 'roof_material',
            label: 'Tavan tercihi',
            help_text: '',
            field_type: 'text',
            required: false,
            sort_order: 50,
            options: [],
          },
        ],
      },
    ];

    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.catalogForm().controls['usage_primary']?.setValue('garden');
    component.catalogForm().controls['color']?.setValue('anthracite');
    component.catalogForm().controls['roof_material']?.setValue('Polikarbon');
    component.productForm.patchValue({
      width: 4200,
      height: 2600,
      quantity: 2,
      notes: 'Motor seçeneği görüşülsün',
    });

    const item = component.currentItem();
    expect(item.product_type).toBe('pergola');
    expect(item.width_mm).toBe(4200);
    expect(item.height_mm).toBe(2600);
    expect(item.quantity).toBe(2);
    expect(item.color).toBe('anthracite');
    expect(item.catalog_answers).toEqual({
      usage_primary: 'garden',
      color: 'anthracite',
      roof_material: 'Polikarbon',
    });
    expect(Object.keys(item)).not.toContain('system_type');
    expect(Object.keys(item)).not.toContain('layout');

    component.step.set(2);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Pergola');
  });

  it('does not invent a color selector when a generic product has no catalog color field', () => {
    const base = FALLBACK_CATALOG_PRODUCTS[0]!;
    liveProducts = [
      {
        ...base,
        key: 'pergola',
        name: 'Pergola',
        description: 'Açılır kapanır gölgelendirme sistemi',
        mark: 'PG',
        fields: [],
      },
    ];

    const fixture = TestBed.createComponent(ConfiguratorComponent);
    fixture.componentInstance.step.set(2);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('#genericColor')).toBeNull();
    expect(element.querySelector('#notes')).toBeNull();
    expect(fixture.componentInstance.currentItem().notes).toBeNull();
    expect(element.textContent).not.toContain('Katalogda renk alanı eklenene kadar');
  });

  it('shows every active usage question supplied by the admin catalog', () => {
    const windowProduct = FALLBACK_CATALOG_PRODUCTS.find(
      (product) => product.key === 'pvc_window',
    )!;
    liveProducts = FALLBACK_CATALOG_PRODUCTS.map((product) =>
      product.key === 'pvc_window'
        ? {
            ...windowProduct,
            fields: [
              ...windowProduct.fields,
              {
                id: 1002,
                key: 'usage_fourth',
                label: 'Ek yönlendirme sorusu',
                help_text: '',
                field_type: 'select' as const,
                required: false,
                sort_order: 35,
                options: [
                  { id: 1003, value: 'yes', label: 'Evet', sort_order: 10 },
                  { id: 1004, value: 'no', label: 'Hayır', sort_order: 20 },
                ],
              },
            ],
          }
        : product,
    );

    const fixture = TestBed.createComponent(ConfiguratorComponent);
    fixture.componentInstance.step.set(2);
    fixture.detectChanges();

    expect(fixture.componentInstance.currentQuestions()).toHaveLength(4);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('4 kısa soru');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Ek yönlendirme sorusu');
  });

  it('keeps guided answers in bounded catalog_answers without labels', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.selectProduct('guillotine_glass');
    component.catalogForm().controls['usage_primary']?.setValue('motorized');
    component.catalogForm().controls['usage_secondary']?.setValue('daily');
    component.catalogForm().controls['usage_tertiary']?.setValue('advisor');
    component.catalogForm().controls['system_type']?.setValue('motorized');
    component.catalogForm().controls['panel_count']?.setValue('3');
    component.productForm.patchValue({ width: 3000, height: 2400 });

    const item = component.currentItem();
    expect(item.product_type).toBe('guillotine_glass');
    expect(item.catalog_answers['usage_primary']).toBe('motorized');
    expect(JSON.stringify(item.catalog_answers)).not.toContain('Düğmeyle / motorlu olsun');
    if (item.product_type === 'guillotine_glass' && 'system_type' in item) {
      expect(item.system_type).toBe('motorized');
      expect(item.panel_count).toBe(3);
    }
  });

  it('preserves admin-created glass and cladding option values in the request item', () => {
    liveProducts = FALLBACK_CATALOG_PRODUCTS.map((product) => {
      if (product.key === 'guillotine_glass') {
        return {
          ...product,
          fields: product.fields.map((field) =>
            field.key === 'glass_type'
              ? {
                  ...field,
                  options: [
                    ...field.options,
                    {
                      id: 9101,
                      value: 'solar_controlled',
                      label: 'Güneş kontrollü cam',
                      sort_order: 30,
                    },
                  ],
                }
              : field,
          ),
        };
      }
      if (product.key === 'facade_cladding') {
        return {
          ...product,
          fields: product.fields.map((field) =>
            field.key === 'cladding_type'
              ? {
                  ...field,
                  options: [
                    ...field.options,
                    {
                      id: 9102,
                      value: 'ceramic_panel',
                      label: 'Seramik panel',
                      sort_order: 60,
                    },
                  ],
                }
              : field,
          ),
        };
      }
      return product;
    });

    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;

    component.selectProduct('guillotine_glass');
    component.catalogForm().controls['glass_type']?.setValue('solar_controlled');
    const guillotineItem = component.currentItem();
    expect(guillotineItem.product_type).toBe('guillotine_glass');
    if (guillotineItem.product_type === 'guillotine_glass' && 'glass_type' in guillotineItem) {
      expect(guillotineItem.glass_type).toBe('solar_controlled');
    }

    component.selectProduct('facade_cladding');
    component.catalogForm().controls['cladding_type']?.setValue('ceramic_panel');
    const facadeItem = component.currentItem();
    expect(facadeItem.product_type).toBe('facade_cladding');
    if (facadeItem.product_type === 'facade_cladding' && 'cladding_type' in facadeItem) {
      expect(facadeItem.cladding_type).toBe('ceramic_panel');
    }
  });

  it('creates the balcony enclosure payload with backend field names', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.selectProduct('balcony_enclosure');
    component.catalogForm().controls['system_type']?.setValue('folding');
    component.catalogForm().controls['enclosure_shape']?.setValue('l_shape');
    component.catalogForm().controls['parapet_type']?.setValue('glass');
    component.catalogForm().controls['roof_required']?.setValue(true);
    component.balconySegments.at(0).controls.widthMm.setValue(4000);
    component.balconySegments.at(1).controls.widthMm.setValue(1800);
    component.balconySegments.at(1).controls.turnDegrees.setValue(90);
    component.productForm.patchValue({ height: 1600 });

    const item = component.currentItem();
    expect(item.product_type).toBe('balcony_enclosure');
    if (item.product_type === 'balcony_enclosure' && 'system_type' in item) {
      expect(item.system_type).toBe('folding');
      expect(item.enclosure_shape).toBe('l_shape');
      expect(item.parapet_type).toBe('glass');
      expect(item.roof_required).toBe(true);
      expect(item.width_mm).toBe(4000);
      expect(item.drawing_version).toBe('2');
      expect(item.profile_spec).toEqual({
        edge_profile_mm: 45,
        mullion_profile_mm: 35,
        corner_profile_mm: 65,
        top_profile_mm: 45,
        bottom_profile_mm: 45,
        mounting_gap_mm: 10,
        min_glass_width_mm: 400,
        target_glass_width_mm: 700,
        max_glass_width_mm: 900,
        min_panel_count: 2,
        max_panel_count: 40,
      });
      expect(item.segments).toEqual([
        {
          label: 'A · Ana cephe',
          width_mm: 4000,
          turn_degrees: 0,
        },
        {
          label: 'B · Yan cephe',
          width_mm: 1800,
          turn_degrees: 90,
        },
      ]);
      expect(component.balconyTotalWidth()).toBe(5800);
      expect(component.measurementReady()).toBe(true);
    }
  });

  it('shows all profile measurements for a selected catalog option that only has a profile spec', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.selectProduct('balcony_enclosure');
    component.catalogForm().controls['system_type']?.setValue('sliding');
    fixture.detectChanges();

    const profileDetail = component
      .selectedOptionDetails()
      .find((detail) => detail.field.key === 'system_type');
    const element = fixture.nativeElement as HTMLElement;

    expect(profileDetail?.option.profile_spec).toBeTruthy();
    expect(element.querySelectorAll('.option-detail-card .profile-spec-grid > div')).toHaveLength(
      11,
    );
    expect(
      element.querySelector('.option-detail-card .profile-spec-summary')?.textContent,
    ).toContain('Kenar / kasa profili');
    expect(
      element.querySelector('.option-detail-card .profile-spec-summary')?.textContent,
    ).toContain('Minimum panel adedi');
  });

  it('snapshots a selected balcony series profile spec ahead of the system fallback', () => {
    const balconyProduct = FALLBACK_CATALOG_PRODUCTS.find(
      (product) => product.key === 'balcony_enclosure',
    )!;
    const seriesProfile = {
      edge_profile_mm: 52,
      mullion_profile_mm: 38,
      corner_profile_mm: 74,
      top_profile_mm: 48,
      bottom_profile_mm: 56,
      mounting_gap_mm: 8,
      min_glass_width_mm: 420,
      target_glass_width_mm: 780,
      max_glass_width_mm: 920,
      min_panel_count: 2,
      max_panel_count: 18,
    } as const;
    liveProducts = FALLBACK_CATALOG_PRODUCTS.map((product) =>
      product.key === 'balcony_enclosure'
        ? {
            ...balconyProduct,
            fields: [
              ...balconyProduct.fields,
              {
                id: 8800,
                key: 'profile_series',
                label: 'Profil serisi',
                help_text: 'Üretici profil serisini seçin.',
                field_type: 'select' as const,
                required: false,
                sort_order: 90,
                options: [
                  {
                    id: 8801,
                    value: 'panorama_52',
                    label: 'Panorama 52',
                    profile_spec: seriesProfile,
                    sort_order: 10,
                  },
                ],
              },
            ],
          }
        : product,
    );

    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    component.selectProduct('balcony_enclosure');
    component.productForm.controls.profileSeries.setValue('panorama_52');
    component.balconySegments.at(0).controls.widthMm.setValue(3200);
    component.productForm.controls.height.setValue(1700);
    fixture.detectChanges();

    const item = component.currentItem();
    expect(item.product_type).toBe('balcony_enclosure');
    if (item.product_type === 'balcony_enclosure' && 'profile_spec' in item) {
      expect(item.profile_series).toBe('Panorama 52');
      expect(item.profile_spec).toEqual(seriesProfile);
    }
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.series-info .profile-spec-grid > div')).toHaveLength(11);
    expect(element.querySelector('.series-info .profile-spec-summary')?.textContent).toContain(
      '52 mm',
    );
    expect(element.querySelector('.series-info .profile-spec-summary')?.textContent).toContain(
      '18 adet',
    );
  });

  it('requires both L-shaped balcony arms before the plan is ready', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.selectProduct('balcony_enclosure');
    component.catalogForm().controls['enclosure_shape']?.setValue('l_shape');
    component.balconySegments.at(0).controls.widthMm.setValue(4200);
    component.productForm.controls.height.setValue(1700);

    expect(component.balconySegments).toHaveLength(2);
    expect(component.measurementReady()).toBe(false);

    component.balconySegments.at(1).controls.widthMm.setValue(1600);
    expect(component.balconySegments.at(1).controls.turnDegrees.value).toBe(90);
    expect(component.measurementReady()).toBe(true);
  });

  it('assigns the hidden right-angle turns for every U-shaped balcony side', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.selectProduct('balcony_enclosure');
    component.catalogForm().controls['enclosure_shape']?.setValue('u_shape');

    expect(component.balconySegments).toHaveLength(3);
    expect(
      component.balconySegments.controls.map((segment) => segment.controls.turnDegrees.value),
    ).toEqual([0, 90, 90]);

    [4200, 1600, 2100].forEach((width, index) => {
      component.balconySegments.at(index).controls.widthMm.setValue(width);
    });
    component.productForm.controls.height.setValue(1700);

    expect(component.measurementReady()).toBe(true);
  });

  it('uses the selected L or U face only for the installation preview', () => {
    const scenarios = [
      { shape: 'l_shape', widths: [4000, 1800], selectedIndex: 1 },
      { shape: 'u_shape', widths: [4200, 1600, 2100], selectedIndex: 2 },
    ] as const;

    for (const scenario of scenarios) {
      const fixture = TestBed.createComponent(ConfiguratorComponent);
      const component = fixture.componentInstance;
      component.selectProduct('balcony_enclosure');
      component.catalogForm().controls['enclosure_shape']?.setValue(scenario.shape);
      scenario.widths.forEach((width, index) => {
        component.balconySegments.at(index).controls.widthMm.setValue(width);
      });
      component.productForm.controls.height.setValue(1700);

      component.selectBalconySegment(scenario.selectedIndex);

      expect(component.selectedBalconySegmentIndex()).toBe(scenario.selectedIndex);
      expect(component.installationPreviewItem().width_mm).toBe(
        scenario.widths[scenario.selectedIndex],
      );
      expect(component.currentItem().width_mm).toBe(scenario.widths[0]);
      fixture.destroy();
    }
  });

  it('lets a custom balcony add and remove bounded measured faces', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.selectProduct('balcony_enclosure');
    component.catalogForm().controls['enclosure_shape']?.setValue('custom');

    expect(component.isCustomBalconyShape()).toBe(true);
    expect(component.balconySegments).toHaveLength(2);
    component.addBalconySegment();
    expect(component.balconySegments).toHaveLength(3);
    component.removeBalconySegment(2);
    expect(component.balconySegments).toHaveLength(2);

    for (let index = component.balconySegments.length; index < 10; index += 1) {
      component.addBalconySegment();
    }
    expect(component.balconySegments).toHaveLength(8);
  });

  it('maps an admin-added glazing option into the core item', () => {
    const windowProduct = FALLBACK_CATALOG_PRODUCTS.find(
      (product) => product.key === 'pvc_window',
    )!;
    liveProducts = FALLBACK_CATALOG_PRODUCTS.map((product) =>
      product.key === 'pvc_window'
        ? {
            ...windowProduct,
            fields: windowProduct.fields.map((field) =>
              field.key === 'glazing'
                ? {
                    ...field,
                    options: [
                      ...field.options,
                      {
                        id: 999,
                        value: 'solar_control',
                        label: 'Güneş kontrollü cam',
                        sort_order: 99,
                      },
                    ],
                  }
                : field,
            ),
          }
        : product,
    );
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.catalogForm().controls['glazing']?.setValue('solar_control');

    const item = component.currentItem();
    expect(item.product_type).toBe('pvc_window');
    if (item.product_type === 'pvc_window' && 'glazing' in item) {
      expect(item.glazing).toBe('solar_control');
    }
  });

  it('places an unknown safe catalog field only in catalog_answers', () => {
    const windowProduct = FALLBACK_CATALOG_PRODUCTS.find(
      (product) => product.key === 'pvc_window',
    )!;
    liveProducts = FALLBACK_CATALOG_PRODUCTS.map((product) =>
      product.key === 'pvc_window'
        ? {
            ...windowProduct,
            fields: [
              ...windowProduct.fields,
              {
                id: 1001,
                key: 'custom_context',
                label: 'Ek kullanım bilgisi',
                help_text: '',
                field_type: 'text' as const,
                required: false,
                sort_order: 140,
                options: [],
              },
            ],
          }
        : product,
    );
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.catalogForm().controls['custom_context']?.setValue('Rüzgârlı cephe');

    const item = component.currentItem();
    expect(item.catalog_answers['custom_context']).toBe('Rüzgârlı cephe');
    expect(Object.keys(item)).not.toContain('custom_context');
  });

  it('renders the safe scene in step two and keeps the technical SVG in step three', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.step.set(2);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('app-measurement-guide svg')).toBeTruthy();
    expect(element.querySelector('app-installation-scene [role="img"]')).toBeTruthy();
    expect(element.querySelector('app-product-preview')).toBeNull();
    expect(element.querySelectorAll('[innerhtml]')).toHaveLength(0);

    component.productForm.patchValue({ width: 1200, height: 1400 });
    for (const field of component.currentProduct().fields) {
      if (field.field_type === 'select' && field.options[0]) {
        component.catalogForm().controls[field.key]?.setValue(field.options[0].value);
      }
    }
    component.goToContact();
    fixture.detectChanges();
    const previewSvg = element.querySelector('app-product-preview svg');
    expect(component.step()).toBe(3);
    expect(previewSvg).toBeTruthy();
    expect(previewSvg?.getAttribute('aria-label')).toContain('milimetre');
  });

  it('does not advance while the measurements are blank', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.step.set(2);

    component.goToContact();

    expect(component.step()).toBe(2);
    expect(component.productForm.controls.width.touched).toBe(true);
    expect(component.productForm.controls.height.touched).toBe(true);
  });

  it('advances joinery without requiring the hidden derived opening fields', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.step.set(2);
    component.productForm.patchValue({ width: 1200, height: 1400 });

    for (const field of component.currentProduct().fields) {
      if (
        field.field_type === 'select' &&
        field.options[0] &&
        field.key !== 'opening_direction' &&
        field.key !== 'opening_mechanism'
      ) {
        component.catalogForm().controls[field.key]?.setValue(field.options[0].value);
      }
    }

    expect(component.catalogForm().controls['opening_direction']?.value).toBe('');
    expect(component.catalogForm().controls['opening_mechanism']?.value).toBe('');
    expect(component.catalogForm().valid).toBe(true);

    component.goToContact();

    expect(component.step()).toBe(3);
  });

  it('shows which managed selections are missing when contact navigation is blocked', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    component.step.set(2);
    component.productForm.patchValue({ width: 1200, height: 1400 });

    component.goToContact();
    fixture.detectChanges();

    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(component.step()).toBe(2);
    expect(alert?.textContent).toContain('Devam etmek için şu seçimleri tamamlayın');
    expect(component.missingCatalogSelectionLabels()).toContain('Pencere modeli');
    expect(component.missingCatalogSelectionLabels()).not.toContain('Açılım yönü');
  });

  it('returns from the drawing step to product selection using the top controls', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;

    component.selectProduct('guillotine_glass');
    fixture.detectChanges();

    expect(component.step()).toBe(2);
    expect(element.querySelector('.form-panel')).toBeTruthy();

    const productStep = element.querySelector<HTMLButtonElement>(
      'button[data-testid="step-product"]',
    );
    expect(productStep).toBeTruthy();
    productStep?.click();
    fixture.detectChanges();

    expect(component.step()).toBe(1);
    expect(element.querySelector('.product-grid')).toBeTruthy();
    expect(element.querySelector('.form-panel')).toBeNull();

    component.selectProduct('guillotine_glass');
    fixture.detectChanges();
    const previousStep = element.querySelector<HTMLButtonElement>(
      'button[data-testid="step-back"]',
    );
    expect(previousStep).toBeTruthy();
    previousStep?.click();
    fixture.detectChanges();

    expect(component.step()).toBe(1);
    expect(element.querySelector('.product-grid')).toBeTruthy();
  });

  it('walks back from contact to drawing and then to product selection', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;

    component.selectProduct('guillotine_glass');
    component.step.set(3);
    fixture.detectChanges();

    expect(element.querySelector('.contact-form')).toBeTruthy();
    const drawingStep = element.querySelector<HTMLButtonElement>(
      'button[data-testid="step-drawing"]',
    );
    expect(drawingStep).toBeTruthy();
    drawingStep?.click();
    fixture.detectChanges();

    expect(component.step()).toBe(2);
    expect(element.querySelector('.form-panel')).toBeTruthy();
    expect(element.querySelector('.contact-form')).toBeNull();

    const previousStep = element.querySelector<HTMLButtonElement>(
      'button[data-testid="step-back"]',
    );
    expect(previousStep).toBeTruthy();
    previousStep?.click();
    fixture.detectChanges();

    expect(component.step()).toBe(1);
    expect(element.querySelector('.product-grid')).toBeTruthy();
    expect(element.querySelector('.form-panel')).toBeNull();
  });

  it('requires explicit privacy consent before submission', () => {
    const fixture = TestBed.createComponent(ConfiguratorComponent);
    const component = fixture.componentInstance;

    component.contactForm.patchValue({
      fullName: 'Ayşe Yılmaz',
      phone: '0555 111 22 33',
    });

    expect(component.contactForm.valid).toBe(false);
    component.contactForm.controls.privacyConsent.setValue(true);
    expect(component.contactForm.valid).toBe(true);
  });
});
