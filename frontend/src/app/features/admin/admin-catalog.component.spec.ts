import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AdminCatalogService } from '../../core/admin-catalog.service';
import {
  AdminCatalogField,
  AdminCatalogOption,
  AdminCatalogProduct,
  CatalogProductWrite,
} from '../../core/catalog.models';
import { AdminCatalogComponent } from './admin-catalog.component';

describe('AdminCatalogComponent custom products', () => {
  const existingProduct: AdminCatalogProduct = {
    key: 'pvc_window',
    name: 'PVC pencere',
    description: 'Pencere çözümleri',
    mark: 'P',
    active: true,
    sort_order: 1,
    measurement_variant: 'opening',
    width_instruction: 'Genişliği ölçün.',
    height_instruction: 'Yüksekliği ölçün.',
    short_width_label: 'Genişlik',
    short_height_label: 'Yükseklik',
  };

  const balconyProduct: AdminCatalogProduct = {
    ...existingProduct,
    key: 'balcony_enclosure',
    name: 'Balkon kapama',
    description: 'Ölçüye göre balkon kapama seçenekleri',
    mark: 'B',
    measurement_variant: 'balcony',
  };

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

  const api = {
    loadProducts: vi.fn(() => of([existingProduct])),
    loadFields: vi.fn(() => of([])),
    createProduct: vi.fn((payload: CatalogProductWrite) =>
      of({
        ...payload,
      } satisfies AdminCatalogProduct),
    ),
    updateProduct: vi.fn(),
    createField: vi.fn(),
    updateField: vi.fn(),
    loadOptions: vi.fn(() => of<readonly AdminCatalogOption[]>([])),
    createOption: vi.fn(),
    updateOption: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [AdminCatalogComponent],
      providers: [{ provide: AdminCatalogService, useValue: api }],
    }).compileComponents();
  });

  it('starts a unique draft with a free safe slug instead of duplicating pvc_window', () => {
    const fixture = TestBed.createComponent(AdminCatalogComponent);
    const component = fixture.componentInstance;

    component.startNewProduct();

    expect(component.productIsNew()).toBe(true);
    expect(component.productForm.controls.key.value).toBe('');
    expect(component.productForm.controls.active.value).toBe(false);
    expect(component.productForm.controls.active.disabled).toBe(true);
    expect(component.productForm.controls.key.enabled).toBe(true);

    component.productForm.controls.key.setValue('A');
    expect(component.productForm.controls.key.invalid).toBe(true);
    component.productForm.controls.key.setValue('internal_cost');
    expect(component.productForm.controls.key.invalid).toBe(true);
    component.productForm.controls.key.setValue('pergola');
    expect(component.productForm.controls.key.valid).toBe(true);
  }, 30_000);

  it('posts the custom key and keeps the product unpublished until configured', () => {
    const fixture = TestBed.createComponent(AdminCatalogComponent);
    const component = fixture.componentInstance;
    component.startNewProduct();
    component.productForm.patchValue({
      key: 'pergola',
      name: 'Pergola',
      description: 'Açılır kapanır gölgelendirme sistemi',
    });

    component.saveProduct();

    expect(api.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'pergola',
        name: 'Pergola',
        mark: 'PER',
        active: false,
      }),
    );
  });

  it('does not expose the internal product mark field in the editor', () => {
    const fixture = TestBed.createComponent(AdminCatalogComponent);
    fixture.componentInstance.startNewProduct();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Kısa işaret');
    expect(fixture.nativeElement.querySelector('#catalogProductMark')).toBeNull();
  });

  it('loads and saves descriptions, features, and images for a regular select option', () => {
    const layoutField: AdminCatalogField = {
      id: 40,
      product_key: 'pvc_window',
      key: 'layout',
      label: 'Pencere modeli',
      help_text: 'Modeli seçin.',
      field_type: 'select',
      required: true,
      active: true,
      sort_order: 10,
    };
    const layoutOption: AdminCatalogOption = {
      id: 41,
      field_id: 40,
      value: 'tilt_turn',
      label: 'Çift açılım',
      description: 'Kanat hem yana hem üstten açılabilir.',
      features: ['Kolay havalandırma', 'İki farklı kullanım biçimi'],
      section_image_urls: ['https://cdn.example.com/tilt-turn.webp'],
      active: true,
      sort_order: 10,
    };
    api.loadOptions.mockReturnValue(of([layoutOption]));
    api.updateOption.mockReturnValue(of(layoutOption));
    const fixture = TestBed.createComponent(AdminCatalogComponent);
    const component = fixture.componentInstance;
    component.fields.set([layoutField]);
    component.selectField(layoutField);
    fixture.detectChanges();

    expect(component.optionForm.controls.description.value).toContain('üstten');
    expect(component.optionForm.controls.featuresText.value).toContain('havalandırma');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Seçenek açıklaması');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('#catalogOptionFeatures'),
    ).toBeTruthy();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.section-image-preview img'),
    ).toBeTruthy();

    component.saveOption();

    expect(api.updateOption).toHaveBeenCalledWith(
      41,
      expect.objectContaining({
        description: 'Kanat hem yana hem üstten açılabilir.',
        features: ['Kolay havalandırma', 'İki farklı kullanım biçimi'],
        section_image_urls: ['https://cdn.example.com/tilt-turn.webp'],
      }),
    );
  });

  it('manages structured measurements with descriptions and images for every profile series', () => {
    const seriesField: AdminCatalogField = {
      id: 50,
      product_key: 'pvc_window',
      key: 'profile_series',
      label: 'Tercih edilen seri',
      help_text: 'Seri özelliklerini inceleyin.',
      field_type: 'select',
      required: false,
      active: true,
      sort_order: 90,
    };
    const seriesOption: AdminCatalogOption = {
      id: 51,
      field_id: 50,
      value: 'prestij_76',
      label: 'Prestij 76',
      description: 'Yalıtım odaklı profil serisi.',
      features: ['76 mm profil derinliği', 'Çok odacıklı gövde'],
      section_image_urls: ['https://cdn.example.com/prestij-76.webp'],
      active: true,
      sort_order: 10,
    };
    api.loadOptions.mockReturnValue(of([seriesOption]));
    api.updateOption.mockReturnValue(of(seriesOption));
    const fixture = TestBed.createComponent(AdminCatalogComponent);
    const component = fixture.componentInstance;
    component.fields.set([seriesField]);
    component.selectField(seriesField);
    fixture.detectChanges();

    expect(component.optionForm.controls.description.value).toContain('Yalıtım');
    expect(component.optionForm.controls.featuresText.value).toContain('Çok odacıklı');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('#catalogOptionFeatures'),
    ).toBeTruthy();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.section-image-preview img'),
    ).toBeTruthy();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.profile-spec-editor'),
    ).toBeTruthy();
    expect(component.canManageProfileSpec()).toBe(true);
    expect(component.profileSpecRequired()).toBe(false);

    component.optionForm.controls.profileSpecEnabled.setValue(true);
    component.optionForm.controls.profileSpec.setValue(balconyProfileSpec);

    component.saveOption();

    expect(api.updateOption).toHaveBeenCalledWith(
      51,
      expect.objectContaining({
        description: 'Yalıtım odaklı profil serisi.',
        features: ['76 mm profil derinliği', 'Çok odacıklı gövde'],
        section_image_urls: ['https://cdn.example.com/prestij-76.webp'],
        profile_spec: balconyProfileSpec,
      }),
    );
  });

  it('shows and saves a structured profile specification for balcony system options', () => {
    const systemField: AdminCatalogField = {
      id: 60,
      product_key: 'balcony_enclosure',
      key: 'system_type',
      label: 'Kapama sistemi',
      help_text: 'Sistemi seçin.',
      field_type: 'select',
      required: true,
      active: true,
      sort_order: 10,
    };
    const systemOption: AdminCatalogOption = {
      id: 61,
      field_id: 60,
      value: 'folding',
      label: 'Katlanır cam',
      profile_spec: balconyProfileSpec,
      active: true,
      sort_order: 10,
    };
    api.loadOptions.mockReturnValue(of([systemOption]));
    api.updateOption.mockReturnValue(of(systemOption));
    const fixture = TestBed.createComponent(AdminCatalogComponent);
    const component = fixture.componentInstance;
    component.products.set([balconyProduct]);
    component.selectProduct(balconyProduct);
    component.fields.set([systemField]);
    component.selectField(systemField);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.profile-spec-editor')).toBeTruthy();
    expect(element.querySelector('#profileCornerMm')).toBeTruthy();
    expect(element.textContent).toContain('Yapılandırılmış profil ölçüleri');
    expect(element.textContent).toContain('Bu balkon sistemi için profil ölçüleri zorunlu');
    expect(
      (element.querySelector('.profile-spec-required input') as HTMLInputElement).disabled,
    ).toBe(true);
    expect(component.profileSpecRequired()).toBe(true);
    expect(component.optionForm.controls.profileSpecEnabled.value).toBe(true);
    expect(component.optionForm.controls.profileSpec.controls.corner_profile_mm.value).toBe(70);

    component.optionForm.controls.profileSpec.controls.target_glass_width_mm.setValue(880);
    component.saveOption();

    expect(api.updateOption).toHaveBeenCalledWith(
      61,
      expect.objectContaining({
        profile_spec: {
          ...balconyProfileSpec,
          target_glass_width_mm: 880,
        },
      }),
    );
  });

  it('starts new balcony system options with a required profile specification', () => {
    const systemField: AdminCatalogField = {
      id: 80,
      product_key: 'balcony_enclosure',
      key: 'system_type',
      label: 'Kapama sistemi',
      help_text: 'Sistemi seçin.',
      field_type: 'select',
      required: true,
      active: true,
      sort_order: 10,
    };
    const createdOption: AdminCatalogOption = {
      id: 81,
      field_id: 80,
      value: 'new_system',
      label: 'Yeni sistem',
      profile_spec: balconyProfileSpec,
      active: true,
      sort_order: 1,
    };
    api.loadOptions.mockReturnValue(of([]));
    api.createOption.mockReturnValue(of(createdOption));
    const fixture = TestBed.createComponent(AdminCatalogComponent);
    const component = fixture.componentInstance;
    component.products.set([balconyProduct]);
    component.selectProduct(balconyProduct);
    component.fields.set([systemField]);
    component.selectField(systemField);

    expect(component.optionIsNew()).toBe(true);
    expect(component.optionForm.controls.profileSpecEnabled.value).toBe(true);
    expect(component.optionForm.controls.profileSpec.enabled).toBe(true);

    component.optionForm.controls.profileSpecEnabled.setValue(false);
    expect(component.optionForm.controls.profileSpecEnabled.value).toBe(true);

    component.optionForm.patchValue({ value: 'new_system', label: 'Yeni sistem' });
    component.optionForm.controls.profileSpec.setValue(balconyProfileSpec);
    component.saveOption();

    expect(api.createOption).toHaveBeenCalledWith(
      80,
      expect.objectContaining({ profile_spec: balconyProfileSpec }),
    );
  });

  it('sends null when profile simulation is disabled and blocks unordered ranges', () => {
    const seriesField: AdminCatalogField = {
      id: 70,
      product_key: 'balcony_enclosure',
      key: 'profile_series',
      label: 'Tercih edilen seri',
      help_text: 'Seriyi seçin.',
      field_type: 'select',
      required: false,
      active: true,
      sort_order: 90,
    };
    const seriesOption: AdminCatalogOption = {
      id: 71,
      field_id: 70,
      value: 'balcony_50',
      label: 'Balkon 50',
      profile_spec: balconyProfileSpec,
      active: true,
      sort_order: 10,
    };
    api.loadOptions.mockReturnValue(of([seriesOption]));
    api.updateOption.mockReturnValue(of(seriesOption));
    const fixture = TestBed.createComponent(AdminCatalogComponent);
    const component = fixture.componentInstance;
    component.products.set([balconyProduct]);
    component.selectProduct(balconyProduct);
    component.fields.set([seriesField]);
    component.selectField(seriesField);

    component.optionForm.controls.profileSpec.controls.min_glass_width_mm.setValue(1000);
    component.optionForm.controls.profileSpec.controls.target_glass_width_mm.setValue(900);
    component.saveOption();
    expect(api.updateOption).not.toHaveBeenCalled();

    component.optionForm.controls.profileSpecEnabled.setValue(false);
    component.saveOption();
    expect(api.updateOption).toHaveBeenCalledWith(
      71,
      expect.objectContaining({ profile_spec: null }),
    );
  });
});
