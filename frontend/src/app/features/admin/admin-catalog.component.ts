import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { AdminCatalogService } from '../../core/admin-catalog.service';
import {
  AdminCatalogField,
  AdminCatalogOption,
  AdminCatalogProduct,
  CatalogFieldType,
  CatalogFieldWrite,
  CatalogMaterialGroup,
  CatalogOptionWrite,
  CatalogProductWrite,
  containsRestrictedPublicTerm,
  isSafeCatalogFieldKey,
  isSafeCatalogKey,
} from '../../core/catalog.models';
import { BalconyProfileSpec } from '../../core/request.models';

const DEFAULT_BALCONY_PROFILE_SPEC: BalconyProfileSpec = {
  edge_profile_mm: 45,
  mullion_profile_mm: 35,
  corner_profile_mm: 90,
  top_profile_mm: 45,
  bottom_profile_mm: 55,
  mounting_gap_mm: 5,
  min_glass_width_mm: 300,
  target_glass_width_mm: 800,
  max_glass_width_mm: 1100,
  min_panel_count: 1,
  max_panel_count: 40,
};

function boundedInteger(minimum: number, maximum: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null =>
    typeof control.value === 'number' &&
    Number.isInteger(control.value) &&
    control.value >= minimum &&
    control.value <= maximum
      ? null
      : { boundedInteger: { minimum, maximum } };
}

const orderedProfileSpec: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const minGlass = control.get('min_glass_width_mm')?.value;
  const targetGlass = control.get('target_glass_width_mm')?.value;
  const maxGlass = control.get('max_glass_width_mm')?.value;
  const minPanels = control.get('min_panel_count')?.value;
  const maxPanels = control.get('max_panel_count')?.value;
  if (
    [minGlass, targetGlass, maxGlass, minPanels, maxPanels].some(
      (value) => typeof value !== 'number' || !Number.isFinite(value),
    )
  ) {
    return null;
  }
  return minGlass <= targetGlass && targetGlass <= maxGlass && minPanels <= maxPanels
    ? null
    : { unorderedProfileSpec: true };
};

const safePublicText: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = typeof control.value === 'string' ? control.value : '';
  if (containsRestrictedPublicTerm(value)) {
    return { restrictedPublicTerm: true };
  }
  return /[<>]|javascript:|data:text\/html/i.test(value) ? { unsafePublicText: true } : null;
};

const safeCatalogKey: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = typeof control.value === 'string' ? control.value : '';
  return isSafeCatalogKey(value) ? null : { unsafeCatalogKey: true };
};

const safeCatalogFieldKey: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = typeof control.value === 'string' ? control.value : '';
  return isSafeCatalogFieldKey(value) ? null : { unsafeCatalogKey: true };
};

const safeCatalogValue: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = typeof control.value === 'string' ? control.value : '';
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value) && !containsRestrictedPublicTerm(value)
    ? null
    : { unsafeCatalogValue: true };
};

const safeFeatureLines: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = typeof control.value === 'string' ? control.value : '';
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length <= 12 &&
    lines.every((line) => line.length <= 160) &&
    new Set(lines).size === lines.length
    ? null
    : { invalidFeatureLines: true };
};

const safeSectionImageUrls: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = typeof control.value === 'string' ? control.value : '';
  const urls = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (urls.length > 4 || new Set(urls).size !== urls.length) {
    return { invalidSectionImageUrls: true };
  }
  return urls.every((url) => {
    try {
      const parsed = new URL(url);
      return (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        !parsed.username &&
        !parsed.password &&
        url.length <= 2048
      );
    } catch {
      return false;
    }
  })
    ? null
    : { invalidSectionImageUrls: true };
};

@Component({
  selector: 'app-admin-catalog',
  imports: [ReactiveFormsModule],
  templateUrl: './admin-catalog.component.html',
  styleUrl: './admin-catalog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCatalogComponent {
  private readonly api = inject(AdminCatalogService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly products = signal<readonly AdminCatalogProduct[]>([]);
  readonly fields = signal<readonly AdminCatalogField[]>([]);
  readonly options = signal<readonly AdminCatalogOption[]>([]);
  readonly selectedProductKey = signal<string | null>(null);
  readonly selectedFieldId = signal<number | null>(null);
  readonly productIsNew = signal(false);
  readonly fieldIsNew = signal(false);
  readonly optionIsNew = signal(false);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);

  readonly selectedProduct = computed(() =>
    this.products().find((product) => product.key === this.selectedProductKey()),
  );
  readonly selectedField = computed(() =>
    this.fields().find((field) => field.id === this.selectedFieldId()),
  );
  readonly canManageProfileSpec = computed(
    () =>
      this.selectedField()?.key === 'profile_series' ||
      (this.selectedProductKey() === 'balcony_enclosure' &&
        this.selectedField()?.key === 'system_type'),
  );
  readonly profileSpecRequired = computed(
    () =>
      this.selectedProductKey() === 'balcony_enclosure' &&
      this.selectedField()?.key === 'system_type',
  );

  readonly productForm = this.fb.group({
    key: this.fb.control('', [
      Validators.required,
      Validators.maxLength(64),
      safeCatalogKey,
      safePublicText,
    ]),
    name: this.fb.control('', [Validators.required, Validators.maxLength(120), safePublicText]),
    description: this.fb.control('', [
      Validators.required,
      Validators.maxLength(1000),
      safePublicText,
    ]),
    active: this.fb.control(true),
    materialGroup: this.fb.control<CatalogMaterialGroup>('pvc'),
    sortOrder: this.fb.control(1, [Validators.required, Validators.min(0)]),
    measurementVariant: this.fb.control<'opening' | 'facade' | 'balcony'>('opening'),
    widthInstruction: this.fb.control('', [
      Validators.required,
      Validators.maxLength(300),
      safePublicText,
    ]),
    heightInstruction: this.fb.control('', [
      Validators.required,
      Validators.maxLength(300),
      safePublicText,
    ]),
    shortWidthLabel: this.fb.control('', [
      Validators.required,
      Validators.maxLength(80),
      safePublicText,
    ]),
    shortHeightLabel: this.fb.control('', [
      Validators.required,
      Validators.maxLength(80),
      safePublicText,
    ]),
  });

  readonly fieldForm = this.fb.group({
    key: this.fb.control('', [
      Validators.required,
      Validators.maxLength(64),
      safeCatalogFieldKey,
      safePublicText,
    ]),
    label: this.fb.control('', [Validators.required, Validators.maxLength(160), safePublicText]),
    helpText: this.fb.control('', [Validators.maxLength(300), safePublicText]),
    fieldType: this.fb.control<CatalogFieldType>('select'),
    unit: this.fb.control('', [Validators.maxLength(16), safePublicText]),
    minValue: this.fb.control(0, [Validators.required, Validators.min(-1_000_000_000)]),
    maxValue: this.fb.control(10_000, [Validators.required, Validators.max(1_000_000_000)]),
    step: this.fb.control(1, [Validators.required, Validators.min(0.000001)]),
    required: this.fb.control(true),
    active: this.fb.control(true),
    sortOrder: this.fb.control(1, [Validators.required, Validators.min(0)]),
  });

  readonly optionForm = this.fb.group({
    value: this.fb.control('', [
      Validators.required,
      Validators.maxLength(64),
      safeCatalogValue,
      safePublicText,
    ]),
    label: this.fb.control('', [Validators.required, Validators.maxLength(160), safePublicText]),
    description: this.fb.control('', [Validators.maxLength(1000), safePublicText]),
    featuresText: this.fb.control('', [
      Validators.maxLength(2000),
      safePublicText,
      safeFeatureLines,
    ]),
    visualIconUrl: this.fb.control('', [Validators.maxLength(2048), safeSectionImageUrls]),
    sectionImageUrlsText: this.fb.control('', [Validators.maxLength(8195), safeSectionImageUrls]),
    profileSpecEnabled: this.fb.control(false),
    profileSpec: this.fb.group(
      {
        edge_profile_mm: this.fb.control(DEFAULT_BALCONY_PROFILE_SPEC.edge_profile_mm, [
          boundedInteger(0, 500),
        ]),
        mullion_profile_mm: this.fb.control(DEFAULT_BALCONY_PROFILE_SPEC.mullion_profile_mm, [
          boundedInteger(0, 500),
        ]),
        corner_profile_mm: this.fb.control(DEFAULT_BALCONY_PROFILE_SPEC.corner_profile_mm, [
          boundedInteger(0, 500),
        ]),
        top_profile_mm: this.fb.control(DEFAULT_BALCONY_PROFILE_SPEC.top_profile_mm, [
          boundedInteger(0, 500),
        ]),
        bottom_profile_mm: this.fb.control(DEFAULT_BALCONY_PROFILE_SPEC.bottom_profile_mm, [
          boundedInteger(0, 500),
        ]),
        mounting_gap_mm: this.fb.control(DEFAULT_BALCONY_PROFILE_SPEC.mounting_gap_mm, [
          boundedInteger(0, 100),
        ]),
        min_glass_width_mm: this.fb.control(DEFAULT_BALCONY_PROFILE_SPEC.min_glass_width_mm, [
          boundedInteger(100, 3000),
        ]),
        target_glass_width_mm: this.fb.control(DEFAULT_BALCONY_PROFILE_SPEC.target_glass_width_mm, [
          boundedInteger(100, 3000),
        ]),
        max_glass_width_mm: this.fb.control(DEFAULT_BALCONY_PROFILE_SPEC.max_glass_width_mm, [
          boundedInteger(100, 3000),
        ]),
        min_panel_count: this.fb.control(DEFAULT_BALCONY_PROFILE_SPEC.min_panel_count, [
          boundedInteger(1, 64),
        ]),
        max_panel_count: this.fb.control(DEFAULT_BALCONY_PROFILE_SPEC.max_panel_count, [
          boundedInteger(1, 64),
        ]),
      },
      { validators: orderedProfileSpec },
    ),
    active: this.fb.control(true),
    sortOrder: this.fb.control(1, [Validators.required, Validators.min(0)]),
  });

  constructor() {
    this.optionForm.controls.profileSpecEnabled.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((enabled) => {
        if (this.profileSpecRequired() && !enabled) {
          this.optionForm.controls.profileSpecEnabled.setValue(true, { emitEvent: false });
          this.setProfileSpecControlsEnabled(true);
          return;
        }
        this.setProfileSpecControlsEnabled(enabled);
      });
    this.setProfileSpecControlsEnabled(false);
    this.loadProducts();
  }

  loadProducts(preferredKey?: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.loadProducts().subscribe({
      next: (products) => {
        const sorted = [...products].sort((left, right) => left.sort_order - right.sort_order);
        this.products.set(sorted);
        this.loading.set(false);
        const next = sorted.find((product) => product.key === preferredKey) ?? sorted[0];
        if (next) {
          this.selectProduct(next);
        }
      },
      error: () => {
        this.error.set('Katalog ürünleri yüklenemedi.');
        this.loading.set(false);
      },
    });
  }

  selectProduct(product: AdminCatalogProduct): void {
    this.productIsNew.set(false);
    this.productForm.controls.key.enable({ emitEvent: false });
    this.productForm.controls.active.enable({ emitEvent: false });
    this.selectedProductKey.set(product.key);
    this.productForm.setValue({
      key: product.key,
      name: product.name,
      description: product.description,
      active: product.active,
      materialGroup: product.material_group,
      sortOrder: product.sort_order,
      measurementVariant: product.measurement_variant,
      widthInstruction: product.width_instruction,
      heightInstruction: product.height_instruction,
      shortWidthLabel: product.short_width_label,
      shortHeightLabel: product.short_height_label,
    });
    this.productForm.controls.key.disable({ emitEvent: false });
    this.loadFields(product.key);
  }

  startNewProduct(): void {
    this.productIsNew.set(true);
    this.productForm.controls.key.enable({ emitEvent: false });
    this.productForm.controls.active.enable({ emitEvent: false });
    this.selectedProductKey.set(null);
    this.fields.set([]);
    this.options.set([]);
    this.selectedFieldId.set(null);
    this.productForm.reset({
      key: '',
      name: '',
      description: '',
      active: false,
      materialGroup: 'pvc',
      sortOrder: this.products().length + 1,
      measurementVariant: 'opening',
      widthInstruction: 'Açıklığın içten içe genişliğini ölçün.',
      heightInstruction: 'Açıklığın içten içe yüksekliğini ölçün.',
      shortWidthLabel: 'Açıklık genişliği',
      shortHeightLabel: 'Açıklık yüksekliği',
    });
    this.productForm.controls.active.disable({ emitEvent: false });
  }

  saveProduct(): void {
    this.productForm.markAllAsTouched();
    if (this.productForm.invalid || this.busy()) {
      return;
    }
    this.beginAction();
    const value = this.productForm.getRawValue();
    const internalMark =
      this.selectedProduct()?.mark ?? value.key.replaceAll('_', '').slice(0, 3).toUpperCase();
    const payload: CatalogProductWrite = {
      key: value.key,
      material_group: value.materialGroup,
      name: value.name.trim(),
      description: value.description.trim(),
      mark: internalMark,
      active: value.active,
      sort_order: value.sortOrder,
      measurement_variant: value.measurementVariant,
      width_instruction: value.widthInstruction.trim(),
      height_instruction: value.heightInstruction.trim(),
      short_width_label: value.shortWidthLabel.trim(),
      short_height_label: value.shortHeightLabel.trim(),
    };
    const request = this.productIsNew()
      ? this.api.createProduct(payload)
      : this.api.updateProduct(value.key, {
          name: payload.name,
          description: payload.description,
          material_group: payload.material_group,
          active: payload.active,
          sort_order: payload.sort_order,
          measurement_variant: payload.measurement_variant,
          width_instruction: payload.width_instruction,
          height_instruction: payload.height_instruction,
          short_width_label: payload.short_width_label,
          short_height_label: payload.short_height_label,
        });
    request.subscribe({
      next: () => this.finishAction('Ürün kaydedildi.', value.key),
      error: (error: unknown) => this.failAction(error),
    });
  }

  toggleProduct(product: AdminCatalogProduct): void {
    if (this.busy()) {
      return;
    }
    this.beginAction();
    this.api.updateProduct(product.key, { active: !product.active }).subscribe({
      next: () =>
        this.finishAction(
          product.active ? 'Ürün yayından kaldırıldı.' : 'Ürün yayınlandı.',
          product.key,
        ),
      error: (error: unknown) => this.failAction(error),
    });
  }

  loadFields(productKey: string, preferredId?: number): void {
    this.api.loadFields(productKey).subscribe({
      next: (fields) => {
        const sorted = [...fields].sort((left, right) => left.sort_order - right.sort_order);
        this.fields.set(sorted);
        const next = sorted.find((field) => field.id === preferredId) ?? sorted[0];
        if (next) {
          this.selectField(next);
        } else {
          this.selectedFieldId.set(null);
          this.options.set([]);
        }
      },
      error: () => this.error.set('Ürün alanları yüklenemedi.'),
    });
  }

  selectField(field: AdminCatalogField): void {
    this.fieldIsNew.set(false);
    this.selectedFieldId.set(field.id);
    this.fieldForm.setValue({
      key: field.key,
      label: field.label,
      helpText: field.help_text,
      fieldType: field.field_type,
      unit: field.unit ?? '',
      minValue: field.min_value ?? 0,
      maxValue: field.max_value ?? 10_000,
      step: field.step ?? 1,
      required: field.required,
      active: field.active,
      sortOrder: field.sort_order,
    });
    this.loadOptions(field.id);
  }

  startNewField(): void {
    if (!this.selectedProductKey()) {
      return;
    }
    this.fieldIsNew.set(true);
    this.selectedFieldId.set(null);
    this.options.set([]);
    this.fieldForm.reset({
      key: '',
      label: '',
      helpText: '',
      fieldType: 'select',
      unit: '',
      minValue: 0,
      maxValue: 10_000,
      step: 1,
      required: true,
      active: this.selectedProduct()?.active !== true,
      sortOrder: this.fields().length + 1,
    });
  }

  saveField(): void {
    const productKey = this.selectedProductKey();
    this.fieldForm.markAllAsTouched();
    if (!productKey || this.fieldForm.invalid || this.busy()) {
      return;
    }
    const value = this.fieldForm.getRawValue();
    if (value.fieldType === 'number' && value.minValue > value.maxValue) {
      this.error.set('Sayısal alanın minimum değeri maksimum değerinden büyük olamaz.');
      return;
    }
    this.beginAction();
    const numericField = value.fieldType === 'number';
    const payload: CatalogFieldWrite = {
      key: value.key.trim(),
      label: value.label.trim(),
      help_text: value.helpText.trim(),
      field_type: value.fieldType,
      unit: numericField ? value.unit.trim() : '',
      min_value: numericField ? value.minValue : null,
      max_value: numericField ? value.maxValue : null,
      step: numericField ? value.step : null,
      required: value.required,
      active: value.active,
      sort_order: value.sortOrder,
    };
    const request = this.fieldIsNew()
      ? this.api.createField(productKey, payload)
      : this.api.updateField(this.selectedFieldId()!, {
          label: payload.label,
          help_text: payload.help_text,
          field_type: payload.field_type,
          ...(numericField
            ? {
                unit: payload.unit,
                min_value: payload.min_value,
                max_value: payload.max_value,
                step: payload.step,
              }
            : {}),
          required: payload.required,
          active: payload.active,
          sort_order: payload.sort_order,
        });
    request.subscribe({
      next: (field) => {
        this.busy.set(false);
        this.message.set('Alan kaydedildi.');
        this.loadFields(productKey, field.id);
      },
      error: (error: unknown) => this.failAction(error),
    });
  }

  toggleField(field: AdminCatalogField): void {
    const productKey = this.selectedProductKey();
    if (!productKey || this.busy()) {
      return;
    }
    this.beginAction();
    this.api.updateField(field.id, { active: !field.active }).subscribe({
      next: () => {
        this.busy.set(false);
        this.message.set(field.active ? 'Alan yayından kaldırıldı.' : 'Alan yayınlandı.');
        this.loadFields(productKey, field.id);
      },
      error: (error: unknown) => this.failAction(error),
    });
  }

  removeField(field: AdminCatalogField): void {
    const productKey = this.selectedProductKey();
    if (!productKey || this.busy() || !field.active) {
      return;
    }
    this.beginAction();
    this.api.deleteField(field.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.message.set('Alan müşteri formundan kaldırıldı. İsterseniz tekrar ekleyebilirsiniz.');
        this.loadFields(productKey);
      },
      error: (error: unknown) => this.failAction(error),
    });
  }

  loadOptions(fieldId: number, preferredId?: number): void {
    this.api.loadOptions(fieldId).subscribe({
      next: (options) => {
        const sorted = [...options].sort((left, right) => left.sort_order - right.sort_order);
        this.options.set(sorted);
        const next = sorted.find((option) => option.id === preferredId) ?? sorted[0];
        if (next) {
          this.selectOption(next);
        } else {
          const profileSpecRequired = this.profileSpecRequired();
          this.optionIsNew.set(true);
          this.optionForm.reset({
            value: '',
            label: '',
            description: '',
            featuresText: '',
            visualIconUrl: '',
            sectionImageUrlsText: '',
            profileSpecEnabled: profileSpecRequired,
            profileSpec: DEFAULT_BALCONY_PROFILE_SPEC,
            active: true,
            sortOrder: 1,
          });
          this.setProfileSpecControlsEnabled(profileSpecRequired);
        }
      },
      error: () => this.error.set('Alan seçenekleri yüklenemedi.'),
    });
  }

  selectOption(option: AdminCatalogOption): void {
    this.optionIsNew.set(false);
    const profileSpecEnabled =
      this.profileSpecRequired() ||
      (option.profile_spec !== null && option.profile_spec !== undefined);
    this.optionForm.setValue(
      {
        value: option.value,
        label: option.label,
        description: option.description ?? '',
        featuresText: (option.features ?? []).join('\n'),
        visualIconUrl: option.visual_icon_url ?? '',
        sectionImageUrlsText: (option.section_image_urls ?? []).join('\n'),
        profileSpecEnabled,
        profileSpec: option.profile_spec ?? DEFAULT_BALCONY_PROFILE_SPEC,
        active: option.active,
        sortOrder: option.sort_order,
      },
      { emitEvent: false },
    );
    this.setProfileSpecControlsEnabled(profileSpecEnabled);
  }

  startNewOption(): void {
    if (!this.selectedFieldId()) {
      return;
    }
    this.optionIsNew.set(true);
    const profileSpecRequired = this.profileSpecRequired();
    this.optionForm.reset({
      value: '',
      label: '',
      description: '',
      featuresText: '',
      visualIconUrl: '',
      sectionImageUrlsText: '',
      profileSpecEnabled: profileSpecRequired,
      profileSpec: DEFAULT_BALCONY_PROFILE_SPEC,
      active: true,
      sortOrder: this.options().length + 1,
    });
    this.setProfileSpecControlsEnabled(profileSpecRequired);
  }

  saveOption(): void {
    const fieldId = this.selectedFieldId();
    this.optionForm.markAllAsTouched();
    if (!fieldId || this.optionForm.invalid || this.busy()) {
      return;
    }
    this.beginAction();
    const value = this.optionForm.getRawValue();
    const payload: CatalogOptionWrite = {
      value: value.value.trim(),
      label: value.label.trim(),
      description: value.description.trim(),
      features: this.cleanLines(value.featuresText),
      visual_icon_url: value.visualIconUrl.trim() || null,
      section_image_urls: this.cleanLines(value.sectionImageUrlsText),
      profile_spec: this.profileSpecPayload(),
      active: value.active,
      sort_order: value.sortOrder,
    };
    const selectedOption = this.options().find((option) => option.value === value.value);
    const request = this.optionIsNew()
      ? this.api.createOption(fieldId, payload)
      : this.api.updateOption(selectedOption!.id, {
          label: payload.label,
          description: payload.description,
          features: payload.features,
          visual_icon_url: payload.visual_icon_url,
          section_image_urls: payload.section_image_urls,
          profile_spec: payload.profile_spec,
          active: payload.active,
          sort_order: payload.sort_order,
        });
    request.subscribe({
      next: (option) => {
        this.busy.set(false);
        this.message.set('Seçenek kaydedildi.');
        this.loadOptions(fieldId, option.id);
      },
      error: (error: unknown) => this.failAction(error),
    });
  }

  toggleOption(option: AdminCatalogOption): void {
    const fieldId = this.selectedFieldId();
    if (!fieldId || this.busy()) {
      return;
    }
    this.beginAction();
    this.api.updateOption(option.id, { active: !option.active }).subscribe({
      next: () => {
        this.busy.set(false);
        this.message.set(option.active ? 'Seçenek yayından kaldırıldı.' : 'Seçenek yayınlandı.');
        this.loadOptions(fieldId, option.id);
      },
      error: (error: unknown) => this.failAction(error),
    });
  }

  removeOption(option: AdminCatalogOption): void {
    const fieldId = this.selectedFieldId();
    if (!fieldId || this.busy() || !option.active) {
      return;
    }
    this.beginAction();
    this.api.deleteOption(option.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.message.set('Seçenek silindi. İsterseniz listeden tekrar ekleyebilirsiniz.');
        this.loadOptions(fieldId);
      },
      error: (error: unknown) => this.failAction(error),
    });
  }

  sectionImagePreviewUrls(): readonly string[] {
    return this.cleanLines(this.optionForm.controls.sectionImageUrlsText.value).slice(0, 4);
  }

  private profileSpecPayload(): BalconyProfileSpec | null {
    if (!this.canManageProfileSpec()) {
      return null;
    }
    if (this.profileSpecRequired()) {
      return this.optionForm.controls.profileSpec.getRawValue();
    }
    if (!this.optionForm.controls.profileSpecEnabled.value) {
      return null;
    }
    return this.optionForm.controls.profileSpec.getRawValue();
  }

  private setProfileSpecControlsEnabled(enabled: boolean): void {
    const profileSpec = this.optionForm.controls.profileSpec;
    if (enabled && this.canManageProfileSpec()) {
      profileSpec.enable({ emitEvent: false });
    } else {
      profileSpec.disable({ emitEvent: false });
    }
  }

  private beginAction(): void {
    this.busy.set(true);
    this.error.set(null);
    this.message.set(null);
  }

  private cleanLines(value: string): string[] {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line, index, lines) => Boolean(line) && lines.indexOf(line) === index);
  }

  private finishAction(message: string, key: string): void {
    this.busy.set(false);
    this.message.set(message);
    this.loadProducts(key);
  }

  private failAction(error: unknown): void {
    this.busy.set(false);
    const detail =
      error instanceof HttpErrorResponse &&
      typeof (error.error as { detail?: unknown } | null)?.detail === 'string'
        ? (error.error as { detail: string }).detail
        : '';
    if (detail.includes('active required select field')) {
      this.error.set(
        'Yayınlamadan önce her zorunlu seçim alanına en az bir aktif seçenek ekleyin.',
      );
      return;
    }
    this.error.set(
      error instanceof HttpErrorResponse && error.status === 409
        ? 'Bu anahtar veya değer zaten kullanılıyor ya da kayıt henüz yayınlanmaya hazır değil.'
        : error instanceof HttpErrorResponse && error.status === 422
          ? 'Alanları ve public içerik kurallarını kontrol edip yeniden deneyin.'
          : 'İşlem tamamlanamadı. Alanları kontrol edip yeniden deneyin.',
    );
  }
}
