import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  FormControl,
  FormRecord,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { map, Subscription } from 'rxjs';
import {
  CatalogAnswers,
  CatalogField,
  CatalogOption,
  CatalogProduct,
  isProductType,
  isSafeCatalogKey,
} from '../../core/catalog.models';
import { CatalogService } from '../../core/catalog.service';
import {
  BalconyEnclosureItem,
  BalconyProfileSpec,
  BalconySegment,
  DoorItem,
  FacadeCladdingItem,
  FlyscreenItem,
  GenericProductItem,
  GuillotineGlassItem,
  JoineryPanel,
  ProductType,
  PublicRequestItem,
  PublicRequestCreate,
  PublicRequestCreated,
  WindowItem,
} from '../../core/request.models';
import { RequestApiService } from '../../core/request-api.service';
import { BalconyPlanPreviewComponent } from '../../shared/balcony-plan-preview.component';
import { DEFAULT_BALCONY_PROFILE_SPEC } from '../../shared/balcony-elevation-geometry';
import { InstallationSceneComponent } from '../../shared/installation-scene.component';
import { installationReferenceFor } from '../../shared/installation-scene-geometry';
import { buildJoineryPanels, JoineryLayout } from '../../shared/joinery-geometry';
import { MeasurementGuideComponent } from '../../shared/measurement-guide.component';
import { ProductPreviewComponent } from '../../shared/product-preview.component';

interface SelectOption<T extends string = string> {
  readonly value: T;
  readonly label: string;
}

type UsageControl = 'usagePrimary' | 'usageSecondary' | 'usageTertiary';

interface UsageQuestion {
  readonly control: UsageControl;
  readonly prompt: string;
  readonly help: string;
  readonly options: readonly SelectOption[];
}

type OpeningSelection = 'none' | 'left' | 'right' | 'inward' | 'outward' | 'sliding';
type JoineryPanelOpeningSelection = JoineryPanel['opening'] | '';
type JoineryPanelHingeSelection = Exclude<JoineryPanel['hinge'], 'none'> | '';

const JOINERY_OPENING_VALUES = new Set<JoineryPanel['opening']>([
  'fixed',
  'turn',
  'tilt',
  'tilt_turn',
  'sliding',
]);

const FALLBACK_JOINERY_OPENINGS: readonly SelectOption<JoineryPanel['opening']>[] = [
  { value: 'fixed', label: 'Sabit' },
  { value: 'turn', label: 'Tek açılım' },
  { value: 'tilt', label: 'Vasistas' },
  { value: 'tilt_turn', label: 'Çift açılım' },
  { value: 'sliding', label: 'Sürme' },
];

const FALLBACK_HINGE_OPTIONS: readonly SelectOption<'left' | 'right'>[] = [
  { value: 'left', label: 'Menteşe solda' },
  { value: 'right', label: 'Menteşe sağda' },
];

interface MeasurementLimits {
  readonly minWidth: number;
  readonly minHeight: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
}

interface ProfileSpecEntry {
  readonly key: keyof BalconyProfileSpec;
  readonly label: string;
  readonly value: number;
  readonly unit: 'mm' | 'adet';
}

const PROFILE_SPEC_LABELS: readonly Omit<ProfileSpecEntry, 'value'>[] = [
  { key: 'edge_profile_mm', label: 'Kenar / kasa profili', unit: 'mm' },
  { key: 'mullion_profile_mm', label: 'Ara kayıt profili', unit: 'mm' },
  { key: 'corner_profile_mm', label: 'L / U köşe profili', unit: 'mm' },
  { key: 'top_profile_mm', label: 'Üst profil', unit: 'mm' },
  { key: 'bottom_profile_mm', label: 'Alt profil', unit: 'mm' },
  { key: 'mounting_gap_mm', label: 'Montaj boşluğu', unit: 'mm' },
  { key: 'min_glass_width_mm', label: 'Minimum net cam eni', unit: 'mm' },
  { key: 'target_glass_width_mm', label: 'Hedef net cam eni', unit: 'mm' },
  { key: 'max_glass_width_mm', label: 'Maksimum net cam eni', unit: 'mm' },
  { key: 'min_panel_count', label: 'Minimum panel adedi', unit: 'adet' },
  { key: 'max_panel_count', label: 'Maksimum panel adedi', unit: 'adet' },
];

const MAX_BALCONY_SEGMENTS = 8;
const KNOWN_BALCONY_SHAPES = new Set(['straight', 'l_shape', 'u_shape']);

const GENERIC_MEASUREMENT_LIMITS: MeasurementLimits = {
  minWidth: 100,
  minHeight: 100,
  maxWidth: 50_000,
  maxHeight: 50_000,
};

const PRODUCT_MEASUREMENT_LIMITS: Readonly<Record<ProductType, MeasurementLimits>> = {
  pvc_window: {
    minWidth: 300,
    minHeight: 300,
    maxWidth: 6000,
    maxHeight: 4000,
  },
  pvc_door: {
    minWidth: 500,
    minHeight: 1500,
    maxWidth: 6000,
    maxHeight: 4000,
  },
  flyscreen: {
    minWidth: 200,
    minHeight: 200,
    maxWidth: 4000,
    maxHeight: 4000,
  },
  guillotine_glass: {
    minWidth: 600,
    minHeight: 1000,
    maxWidth: 6000,
    maxHeight: 5000,
  },
  facade_cladding: {
    minWidth: 500,
    minHeight: 500,
    maxWidth: 50_000,
    maxHeight: 50_000,
  },
  balcony_enclosure: {
    minWidth: 1000,
    minHeight: 1000,
    maxWidth: 30_000,
    maxHeight: 4000,
  },
};

export const PUBLIC_REVIEW_MESSAGE =
  'Talebiniz otomatik olarak sonuçlandırılmaz. Uzman ekibimiz ölçüleri ve seçimleri inceler; ardından telefon veya e-posta yoluyla sizinle iletişime geçer.';

export const PRODUCT_CHOICES: readonly {
  readonly type: ProductType;
  readonly name: string;
  readonly description: string;
  readonly mark: string;
}[] = [
  {
    type: 'pvc_window',
    name: 'PVC pencere',
    description: 'Sabit, tek kanat, çift kanat veya vasistaslı',
    mark: 'P',
  },
  {
    type: 'pvc_door',
    name: 'PVC kapı',
    description: 'Tek, çift, balkon veya sürme kapı',
    mark: 'K',
  },
  {
    type: 'flyscreen',
    name: 'Sineklik',
    description: 'Sabit, menteşeli, sürme, stor veya plise',
    mark: 'S',
  },
  {
    type: 'guillotine_glass',
    name: 'Giyotin cam',
    description: 'Elle veya motorla hareket eden dikey cam sistemi',
    mark: 'G',
  },
  {
    type: 'facade_cladding',
    name: 'Dış cephe',
    description: 'Panel türü ve uygulama yüzeyiyle ön çalışma',
    mark: 'C',
  },
  {
    type: 'balcony_enclosure',
    name: 'Balkon kapama',
    description: 'Sürme, katlanır, giyotin cam veya PVC çözüm',
    mark: 'B',
  },
];

const TEMPLATE_OPTIONS: Readonly<Record<ProductType, readonly SelectOption[]>> = {
  pvc_window: [
    { value: 'fixed', label: 'Sabit pencere' },
    { value: 'single_sash', label: 'Tek kanat' },
    { value: 'double_sash', label: 'Çift kanat' },
    { value: 'tilt_turn', label: 'Çift açılım' },
    { value: 'transom', label: 'Üst vasistaslı' },
    { value: 'custom_grid', label: 'Dört bölmeli' },
  ],
  pvc_door: [
    { value: 'single', label: 'Tek kanat kapı' },
    { value: 'double', label: 'Çift kanat kapı' },
    { value: 'balcony', label: 'Balkon kapısı' },
    { value: 'sliding', label: 'Sürme kapı' },
  ],
  flyscreen: [
    { value: 'fixed', label: 'Sabit sineklik' },
    { value: 'hinged', label: 'Menteşeli sineklik' },
    { value: 'sliding', label: 'Sürme sineklik' },
    { value: 'roller', label: 'Stor sineklik' },
    { value: 'pleated', label: 'Plise sineklik' },
  ],
  guillotine_glass: [
    { value: 'manual', label: 'Elle hareket eden sistem' },
    { value: 'motorized', label: 'Motorlu sistem' },
  ],
  facade_cladding: [
    { value: 'composite_panel', label: 'Kompozit panel' },
    { value: 'compact_laminate', label: 'Kompakt laminat' },
    { value: 'metal_panel', label: 'Metal panel' },
    { value: 'fiber_cement', label: 'Fiber çimento' },
    { value: 'other', label: 'Diğer / uzman görüşü' },
  ],
  balcony_enclosure: [
    { value: 'sliding', label: 'Sürme cam' },
    { value: 'folding', label: 'Katlanır cam' },
    { value: 'guillotine', label: 'Giyotin cam' },
    { value: 'pvc_joinery', label: 'PVC doğrama' },
  ],
};

export const USAGE_QUESTIONS: Readonly<Record<ProductType, readonly UsageQuestion[]>> = {
  pvc_window: [
    {
      control: 'usagePrimary',
      prompt: 'Bu pencere nerede kullanılacak?',
      help: 'Mekâna uygun açılımı değerlendirmemize yardım eder.',
      options: [
        { value: 'living', label: 'Salon veya oda' },
        { value: 'kitchen', label: 'Mutfak' },
        { value: 'bathroom', label: 'Banyo / WC' },
        { value: 'other', label: 'Diğer / emin değilim' },
      ],
    },
    {
      control: 'usageSecondary',
      prompt: 'Sizin için en önemli konu nedir?',
      help: 'Birden fazlaysa en önemlisini seçin.',
      options: [
        { value: 'ventilation', label: 'Kolay havalandırma' },
        { value: 'insulation', label: 'Isı ve ses yalıtımı' },
        { value: 'security', label: 'Güvenlik' },
        { value: 'advisor', label: 'Bilmiyorum, uzman belirlesin' },
      ],
    },
    {
      control: 'usageTertiary',
      prompt: 'Evde küçük çocuk veya evcil hayvan var mı?',
      help: 'Açılım ve güvenlik seçenekleri için kullanılır.',
      options: [
        { value: 'none', label: 'Hayır' },
        { value: 'child', label: 'Küçük çocuk var' },
        { value: 'pet', label: 'Evcil hayvan var' },
        { value: 'both', label: 'Her ikisi de var' },
      ],
    },
  ],
  pvc_door: [
    {
      control: 'usagePrimary',
      prompt: 'Kapı nereye açılacak?',
      help: 'Geçiş yoğunluğunu anlamamıza yardım eder.',
      options: [
        { value: 'balcony', label: 'Balkon / teras' },
        { value: 'garden', label: 'Bahçe' },
        { value: 'entrance', label: 'Giriş' },
        { value: 'other', label: 'Diğer / emin değilim' },
      ],
    },
    {
      control: 'usageSecondary',
      prompt: 'Geçiş kolaylığı önemli mi?',
      help: 'Alçak eşik ihtiyacını değerlendirebiliriz.',
      options: [
        { value: 'standard', label: 'Standart geçiş yeterli' },
        { value: 'accessible', label: 'Engelsiz / alçak eşik olsun' },
        { value: 'advisor', label: 'Bilmiyorum, uzman belirlesin' },
      ],
    },
    {
      control: 'usageTertiary',
      prompt: 'Kapı ne sıklıkla kullanılacak?',
      help: 'Donanım seçimi için yol gösterir.',
      options: [
        { value: 'occasional', label: 'Ara sıra' },
        { value: 'daily', label: 'Her gün' },
        { value: 'intensive', label: 'Çok yoğun' },
      ],
    },
  ],
  flyscreen: [
    {
      control: 'usagePrimary',
      prompt: 'Sineklik nereye takılacak?',
      help: 'Açıklığın kullanım biçimini seçin.',
      options: [
        { value: 'window', label: 'Pencereye' },
        { value: 'door', label: 'Kapıya' },
        { value: 'balcony', label: 'Balkon açıklığına' },
        { value: 'advisor', label: 'Bilmiyorum, uzman belirlesin' },
      ],
    },
    {
      control: 'usageSecondary',
      prompt: 'Sık sık açıp kapatacak mısınız?',
      help: 'Sabit veya hareketli model seçiminde yardımcı olur.',
      options: [
        { value: 'never', label: 'Hayır, sabit kalabilir' },
        { value: 'sometimes', label: 'Bazen' },
        { value: 'often', label: 'Evet, sık sık' },
      ],
    },
    {
      control: 'usageTertiary',
      prompt: 'Evcil hayvanınız var mı?',
      help: 'Daha dayanıklı tül gerekebilir.',
      options: [
        { value: 'no', label: 'Hayır' },
        { value: 'cat', label: 'Kedi' },
        { value: 'dog', label: 'Köpek' },
        { value: 'other', label: 'Başka bir evcil hayvan' },
      ],
    },
  ],
  guillotine_glass: [
    {
      control: 'usagePrimary',
      prompt: 'Camlar nasıl hareket etsin?',
      help: 'Elle veya düğmeyle kullanım tercihinizi belirtin.',
      options: [
        { value: 'manual', label: 'Elle hareket etsin' },
        { value: 'motorized', label: 'Düğmeyle / motorlu olsun' },
        { value: 'advisor', label: 'Bilmiyorum, uzman belirlesin' },
      ],
    },
    {
      control: 'usageSecondary',
      prompt: 'Bu alan ne kadar sık açılacak?',
      help: 'Günlük kullanım alışkanlığınızı seçin.',
      options: [
        { value: 'occasional', label: 'Ara sıra' },
        { value: 'daily', label: 'Her gün' },
        { value: 'intensive', label: 'Gün içinde çok kez' },
      ],
    },
    {
      control: 'usageTertiary',
      prompt: 'Alt bölüm sabit kalsın mı?',
      help: 'Emin değilseniz uzmanımız kontrol eder.',
      options: [
        { value: 'yes', label: 'Evet, sabit kalsın' },
        { value: 'no', label: 'Hayır' },
        { value: 'advisor', label: 'Bilmiyorum, uzman belirlesin' },
      ],
    },
  ],
  facade_cladding: [
    {
      control: 'usagePrimary',
      prompt: 'Kaplanacak yüzey nasıl?',
      help: 'Ana cephe şeklini yaklaşık seçin.',
      options: [
        { value: 'flat', label: 'Düz tek yüzey' },
        { value: 'cornered', label: 'Köşeli / birden fazla yüzey' },
        { value: 'irregular', label: 'Girintili çıkıntılı' },
        { value: 'advisor', label: 'Bilmiyorum, uzman incelesin' },
      ],
    },
    {
      control: 'usageSecondary',
      prompt: 'Yalıtım da istiyor musunuz?',
      help: 'Mevcut duvarın durumunu bilmiyorsanız sorun değil.',
      options: [
        { value: 'yes', label: 'Evet' },
        { value: 'no', label: 'Hayır' },
        { value: 'advisor', label: 'Bilmiyorum, uzman belirlesin' },
      ],
    },
    {
      control: 'usageTertiary',
      prompt: 'Görünüm tercihiniz nedir?',
      help: 'Panel düzeni daha sonra netleştirilebilir.',
      options: [
        { value: 'plain', label: 'Sade ve düz' },
        { value: 'jointed', label: 'Belirgin derzli' },
        { value: 'mixed', label: 'Birden fazla renk / doku' },
        { value: 'advisor', label: 'Uzman önerisini istiyorum' },
      ],
    },
  ],
  balcony_enclosure: [
    {
      control: 'usagePrimary',
      prompt: 'Balkonu nasıl kullanacaksınız?',
      help: 'Günlük kullanım amacınızı seçin.',
      options: [
        { value: 'living', label: 'Yaşam alanı' },
        { value: 'seasonal', label: 'Mevsimlik kullanım' },
        { value: 'protection', label: 'Yağmur ve rüzgârdan koruma' },
        { value: 'advisor', label: 'Bilmiyorum, uzman yönlendirsin' },
      ],
    },
    {
      control: 'usageSecondary',
      prompt: 'Camların tamamen açılması önemli mi?',
      help: 'Sürme veya katlanır çözüm için yol gösterir.',
      options: [
        { value: 'yes', label: 'Evet, tamamen açılsın' },
        { value: 'partial', label: 'Kısmen açılması yeterli' },
        { value: 'no', label: 'Açılması önemli değil' },
        { value: 'advisor', label: 'Bilmiyorum, uzman belirlesin' },
      ],
    },
    {
      control: 'usageTertiary',
      prompt: 'Balkonun üstü kapalı mı?',
      help: 'Çatı veya üst örtü ihtiyacını anlamamıza yardım eder.',
      options: [
        { value: 'yes', label: 'Evet, üstü kapalı' },
        { value: 'no', label: 'Hayır, açık' },
        { value: 'partial', label: 'Kısmen kapalı' },
        { value: 'unknown', label: 'Emin değilim' },
      ],
    },
  ],
};

@Component({
  selector: 'app-configurator',
  imports: [
    ReactiveFormsModule,
    DecimalPipe,
    InstallationSceneComponent,
    BalconyPlanPreviewComponent,
    MeasurementGuideComponent,
    ProductPreviewComponent,
  ],
  templateUrl: './configurator.component.html',
  styleUrl: './configurator.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfiguratorComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(RequestApiService);
  private readonly catalog = inject(CatalogService);
  private catalogSubscriptions: Subscription[] = [];
  private readonly configuratorTitle =
    viewChild<ElementRef<HTMLHeadingElement>>('configuratorTitle');

  readonly catalogLoading = signal(true);
  readonly catalogError = signal<string | null>(null);
  readonly usingFallbackCatalog = signal(false);
  readonly products = signal<readonly CatalogProduct[]>(this.catalog.fallbackProducts);
  readonly productChoices = computed(() => this.products());
  readonly reviewMessage = PUBLIC_REVIEW_MESSAGE;
  readonly step = signal<1 | 2 | 3 | 4>(1);
  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly joinerySelectionError = signal(false);
  readonly completion = signal<PublicRequestCreated | null>(null);

  readonly openings: readonly SelectOption<OpeningSelection>[] = [
    { value: 'left', label: 'Sol açılım' },
    { value: 'right', label: 'Sağ açılım' },
    { value: 'inward', label: 'İçe açılım' },
    { value: 'outward', label: 'Dışa açılım' },
  ];
  readonly glazingOptions: readonly SelectOption[] = [
    { value: 'double_glazing', label: 'Isıcam' },
    { value: 'triple_glazing', label: 'Üçlü cam' },
    { value: 'laminated', label: 'Lamine cam' },
    { value: 'tempered', label: 'Temperli cam' },
    { value: 'panel', label: 'Panel' },
  ];
  readonly meshOptions: readonly SelectOption[] = [
    { value: 'standard', label: 'Standart tül' },
    { value: 'pet_resistant', label: 'Evcil hayvan dayanımlı' },
    { value: 'pollen', label: 'Polen filtreli' },
    { value: 'stainless', label: 'Paslanmaz tel' },
  ];
  readonly balconyTurnOptions: readonly {
    readonly value: -90 | 0 | 90;
    readonly label: string;
  }[] = [
    { value: -90, label: 'Sola dönsün' },
    { value: 0, label: 'Düz devam etsin' },
    { value: 90, label: 'Sağa dönsün' },
  ];

  readonly balconySegments = this.fb.array([this.createBalconySegment('A · Ana cephe', 0)]);

  readonly productForm = this.fb.group({
    productType: this.fb.control('pvc_window', Validators.required),
    template: this.fb.control('single_sash', Validators.required),
    usagePrimary: this.fb.control('living', Validators.required),
    usageSecondary: this.fb.control('ventilation', Validators.required),
    usageTertiary: this.fb.control('none', Validators.required),
    width: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(PRODUCT_MEASUREMENT_LIMITS.pvc_window.minWidth),
      Validators.max(PRODUCT_MEASUREMENT_LIMITS.pvc_window.maxWidth),
    ]),
    height: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(PRODUCT_MEASUREMENT_LIMITS.pvc_window.minHeight),
      Validators.max(PRODUCT_MEASUREMENT_LIMITS.pvc_window.maxHeight),
    ]),
    quantity: this.fb.control(1, [Validators.required, Validators.min(1), Validators.max(100)]),
    color: this.fb.control('white', Validators.required),
    opening: this.fb.control<OpeningSelection>('right', Validators.required),
    glazing: this.fb.control('double_glazing', Validators.required),
    threshold: this.fb.control<'standard' | 'low' | 'frameless'>('standard'),
    meshType: this.fb.control<'standard' | 'pet_resistant' | 'pollen' | 'stainless'>('standard'),
    panelCount: this.fb.control<2 | 3 | 4>(2),
    glassType: this.fb.control<'tempered' | 'laminated'>('tempered'),
    bottomFixed: this.fb.control(true),
    panelOrientation: this.fb.control<'horizontal' | 'vertical' | 'mixed'>('vertical'),
    installationSystem: this.fb.control<'visible_fixing' | 'concealed_fixing' | 'cassette'>(
      'concealed_fixing',
    ),
    insulationRequired: this.fb.control(false),
    substructureMaterial: this.fb.control<'aluminium' | 'galvanized_steel' | 'unspecified'>(
      'unspecified',
    ),
    enclosureShape: this.fb.control('straight'),
    roofRequired: this.fb.control(false),
    parapetType: this.fb.control<'none' | 'masonry' | 'glass'>('masonry'),
    balconySegments: this.balconySegments,
    profileSeries: this.fb.control(''),
    notes: this.fb.control('', Validators.maxLength(1000)),
  });

  readonly contactForm = this.fb.group({
    fullName: this.fb.control('', [
      Validators.required,
      Validators.minLength(2),
      Validators.maxLength(120),
    ]),
    companyName: this.fb.control('', Validators.maxLength(160)),
    email: this.fb.control('', [Validators.email, Validators.maxLength(254)]),
    phone: this.fb.control('', [Validators.required, Validators.pattern(/^[+0-9()\-\s.]{7,32}$/)]),
    preferredContact: this.fb.control<'phone' | 'email'>('phone'),
    city: this.fb.control('', Validators.maxLength(80)),
    district: this.fb.control('', Validators.maxLength(80)),
    projectNote: this.fb.control('', Validators.maxLength(3000)),
    privacyConsent: this.fb.control(false, Validators.requiredTrue),
    website: this.fb.control(''),
  });

  private readonly productValue = toSignal(
    this.productForm.valueChanges.pipe(map(() => this.productForm.getRawValue())),
    {
      initialValue: this.productForm.getRawValue(),
    },
  );
  readonly productType = computed(() => this.productValue().productType);
  readonly currentProduct = computed(
    () =>
      this.products().find((product) => product.key === this.productType()) ??
      this.catalog.fallbackProducts.find((product) => product.key === this.productType())!,
  );
  readonly currentQuestions = computed(() =>
    [...this.currentProduct().fields]
      .filter((field) => field.key.startsWith('usage_'))
      .sort((left, right) => left.sort_order - right.sort_order),
  );
  readonly currentDetailFields = computed(() =>
    [...this.currentProduct().fields]
      .filter(
        (field) =>
          !field.key.startsWith('usage_') &&
          field.key !== 'notes' &&
          field.key !== 'profile_series' &&
          !(this.productType() === 'balcony_enclosure' && field.key === 'enclosure_shape') &&
          !(
            (this.productType() === 'pvc_window' || this.productType() === 'pvc_door') &&
            (field.key === 'opening_direction' || field.key === 'opening_mechanism')
          ),
      )
      .sort((left, right) => left.sort_order - right.sort_order),
  );
  readonly currentSeriesField = computed(
    () =>
      this.currentProduct().fields.find(
        (field) => field.key === 'profile_series' && field.field_type === 'select',
      ) ?? null,
  );
  readonly currentNotesField = computed(
    () => this.currentProduct().fields.find((field) => field.key === 'notes') ?? null,
  );
  readonly selectedSeriesOption = computed<CatalogOption | null>(() => {
    const selectedValue = this.productValue().profileSeries;
    return (
      this.currentSeriesField()?.options.find((option) => option.value === selectedValue) ?? null
    );
  });
  readonly selectedSeriesHasDetails = computed(() => {
    const option = this.selectedSeriesOption();
    return Boolean(
      option?.description ||
      option?.features?.length ||
      option?.section_image_urls?.length ||
      option?.profile_spec,
    );
  });
  readonly selectedBalconySystemOption = computed<CatalogOption | null>(() => {
    if (!this.isBalcony()) {
      return null;
    }
    const systemField = this.currentProduct().fields.find(
      (field) => field.key === 'system_type' && field.field_type === 'select',
    );
    const selectedValue = this.catalogAnswers()['system_type'];
    const fallbackValue = this.productValue().template;
    const value =
      typeof selectedValue === 'string' && selectedValue ? selectedValue : fallbackValue;
    return systemField?.options.find((option) => option.value === value) ?? null;
  });
  readonly selectedBalconyProfileSpec = computed<BalconyProfileSpec>(() => ({
    ...(this.selectedSeriesOption()?.profile_spec ??
      this.selectedBalconySystemOption()?.profile_spec ??
      DEFAULT_BALCONY_PROFILE_SPEC),
  }));
  readonly catalogForm = signal(new FormRecord<FormControl<string | boolean>>({}));
  readonly catalogAnswers = signal<CatalogAnswers>({});
  readonly joineryPanels = signal<readonly JoineryPanel[]>([]);
  /**
   * The drawing keeps a safe, renderable panel model, while the form keeps
   * the customer's explicit choices separately. This lets a select start at
   * "Seçin" without inventing an opening or hinge in the request preview.
   */
  readonly joineryPanelSelections = signal<readonly JoineryPanelOpeningSelection[]>([]);
  readonly joineryHingeSelections = signal<readonly JoineryPanelHingeSelection[]>([]);
  readonly currentItem = computed(() => this.buildItem(this.productValue()));
  readonly isBalcony = computed(() => this.productType() === 'balcony_enclosure');
  readonly selectedBalconySegmentIndex = signal(0);
  readonly balconyShapeField = computed(
    () =>
      this.currentProduct().fields.find(
        (field) => field.key === 'enclosure_shape' && field.field_type === 'select',
      ) ?? null,
  );
  readonly selectedBalconyShape = computed(() => {
    const value = this.catalogAnswers()['enclosure_shape'];
    return typeof value === 'string' && value ? value : 'straight';
  });
  readonly selectedBalconyShapeLabel = computed(
    () =>
      this.balconyShapeField()?.options.find(
        (option) => option.value === this.selectedBalconyShape(),
      )?.label ?? 'Özel balkon planı',
  );
  readonly isCustomBalconyShape = computed(
    () => !KNOWN_BALCONY_SHAPES.has(this.selectedBalconyShape()),
  );
  readonly currentBalconySegments = computed<readonly BalconySegment[]>(() =>
    this.productValue()
      .balconySegments.filter(
        (segment) =>
          segment.widthMm !== null && Number.isFinite(segment.widthMm) && segment.widthMm >= 300,
      )
      .map((segment, index) => ({
        label: segment.label || this.balconySegmentLabel(index, this.selectedBalconyShape()),
        width_mm: Number(segment.widthMm),
        turn_degrees: (index === 0 ? 0 : Number(segment.turnDegrees)) as -90 | 0 | 90,
      })),
  );
  readonly balconyTotalWidth = computed(() =>
    this.currentBalconySegments().reduce((total, segment) => total + segment.width_mm, 0),
  );
  readonly selectedBalconySegment = computed<BalconySegment | null>(() => {
    const segments = this.currentBalconySegments();
    if (segments.length === 0) {
      return null;
    }
    const index = Math.min(this.selectedBalconySegmentIndex(), segments.length - 1);
    return segments[index] ?? segments[0] ?? null;
  });
  readonly installationPreviewItem = computed<PublicRequestItem>(() => {
    const item = this.currentItem();
    const segment = this.selectedBalconySegment();
    if (item.product_type !== 'balcony_enclosure' || !segment) {
      return item;
    }
    return {
      ...item,
      width_mm: segment.width_mm,
    };
  });
  readonly installationPreviewProductName = computed(() => {
    const productName = this.currentProduct().name;
    const segment = this.selectedBalconySegment();
    if (this.isBalcony() && segment) {
      return `${productName} · ${segment.label}`;
    }
    const item = this.currentItem();
    if (
      (item.product_type === 'pvc_window' || item.product_type === 'pvc_door') &&
      'layout' in item &&
      ['window_door', 'door_window', 'window_door_window'].includes(item.layout)
    ) {
      return 'PVC kapı + pencere';
    }
    return productName;
  });
  readonly measurementReference = computed(() =>
    installationReferenceFor(this.productType(), this.currentProduct().measurement.variant),
  );
  readonly measurementReady = computed(() => {
    const value = this.productValue();
    const limits = this.measurementLimitsFor(value.productType);
    if (value.productType === 'balcony_enclosure') {
      return (
        this.balconySegments.valid &&
        this.currentBalconySegments().length === this.balconySegments.length &&
        value.width !== null &&
        value.height !== null &&
        Number.isFinite(value.width) &&
        Number.isFinite(value.height) &&
        value.width >= limits.minWidth &&
        value.width <= limits.maxWidth &&
        value.height >= limits.minHeight &&
        value.height <= limits.maxHeight &&
        this.balconyTotalWidth() <= 60_000
      );
    }
    return (
      value.width !== null &&
      value.height !== null &&
      Number.isFinite(value.width) &&
      Number.isFinite(value.height) &&
      value.width >= limits.minWidth &&
      value.width <= limits.maxWidth &&
      value.height >= limits.minHeight &&
      value.height <= limits.maxHeight
    );
  });
  readonly isJoinery = computed(
    () => this.productType() === 'pvc_window' || this.productType() === 'pvc_door',
  );
  readonly joineryOpeningOptions = computed<readonly SelectOption<JoineryPanel['opening']>[]>(
    () => {
      const field = this.currentProduct().fields.find(
        (entry) => entry.key === 'opening_mechanism' && entry.field_type === 'select',
      );
      const managed = (field?.options ?? [])
        .filter((option) => JOINERY_OPENING_VALUES.has(option.value as JoineryPanel['opening']))
        .map((option) => ({
          value: option.value as JoineryPanel['opening'],
          label: option.label,
        }));
      return field ? managed : this.usingFallbackCatalog() ? FALLBACK_JOINERY_OPENINGS : [];
    },
  );
  readonly joineryHingeOptions = computed<readonly SelectOption<'left' | 'right'>[]>(() => {
    const field = this.currentProduct().fields.find(
      (entry) => entry.key === 'opening_direction' && entry.field_type === 'select',
    );
    const managed = (field?.options ?? [])
      .filter((option) => option.value === 'left' || option.value === 'right')
      .map((option) => ({
        value: option.value as 'left' | 'right',
        label: option.label,
      }));
    return field ? managed : this.usingFallbackCatalog() ? FALLBACK_HINGE_OPTIONS : [];
  });
  readonly selectedOptionDetails = computed(() => {
    const answers = this.catalogAnswers();
    return this.currentDetailFields().flatMap((field) => {
      if (field.field_type !== 'select') {
        return [];
      }
      const selected = field.options.find((option) => option.value === answers[field.key]);
      if (
        !selected ||
        (!selected.description &&
          !selected.features?.length &&
          !selected.section_image_urls?.length &&
          !selected.profile_spec)
      ) {
        return [];
      }
      return [{ field, option: selected }];
    });
  });

  readonly joinerySelectionsComplete = computed(() => {
    const panels = this.joineryPanels();
    const openings = this.joineryPanelSelections();
    const hinges = this.joineryHingeSelections();
    if (this.joineryOpeningOptions().length === 0) {
      return true;
    }
    const hingeSelectionAvailable = this.joineryHingeOptions().length > 0;
    return (
      panels.length > 0 &&
      panels.every((_panel, index) => {
        const opening = openings[index];
        if (!opening) {
          return false;
        }
        return opening !== 'turn' && opening !== 'tilt_turn'
          ? true
          : !hingeSelectionAvailable || Boolean(hinges[index]);
      })
    );
  });

  profileSpecEntries(spec: BalconyProfileSpec): readonly ProfileSpecEntry[] {
    return PROFILE_SPEC_LABELS.map((entry) => ({
      ...entry,
      value: spec[entry.key],
    }));
  }

  constructor() {
    this.balconySegments.disable({ emitEvent: false });
    this.balconySegments.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.syncBalconyWidth());
    this.productForm.controls.productType.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((type) => {
        this.applyProductDefaults(type);
        this.configureCatalogForm(type);
      });
    this.contactForm.controls.preferredContact.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => this.updateContactValidators(value));
    this.configureCatalogForm('pvc_window');
    this.loadCatalog();
  }

  loadCatalog(): void {
    this.catalogLoading.set(true);
    this.catalogError.set(null);
    this.catalog.load().subscribe({
      next: (response) => {
        if (response.products.length === 0) {
          this.activateFallbackCatalog();
          return;
        }
        this.products.set(response.products);
        this.usingFallbackCatalog.set(false);
        const selectedExists = response.products.some(
          (product) => product.key === this.productType(),
        );
        if (!selectedExists) {
          this.productForm.controls.productType.setValue(response.products[0]!.key);
        } else {
          this.configureCatalogForm(this.productType());
        }
        this.catalogLoading.set(false);
      },
      error: () => this.activateFallbackCatalog(),
    });
  }

  selectProduct(type: string): void {
    if (this.catalogLoading()) {
      return;
    }
    this.productForm.controls.productType.setValue(type);
    this.step.set(2);
    this.focusStepHeading();
  }

  addBalconySegment(): void {
    if (!this.isCustomBalconyShape() || this.balconySegments.length >= MAX_BALCONY_SEGMENTS) {
      return;
    }
    const index = this.balconySegments.length;
    this.balconySegments.push(
      this.createBalconySegment(this.balconySegmentLabel(index, this.selectedBalconyShape()), null),
    );
    this.syncBalconyWidth();
  }

  selectBalconySegment(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.currentBalconySegments().length) {
      return;
    }
    this.selectedBalconySegmentIndex.set(index);
  }

  removeBalconySegment(index: number): void {
    if (
      !this.isCustomBalconyShape() ||
      this.balconySegments.length <= 2 ||
      index < 1 ||
      index >= this.balconySegments.length
    ) {
      return;
    }
    this.balconySegments.removeAt(index);
    const selectedIndex = this.selectedBalconySegmentIndex();
    if (selectedIndex > index) {
      this.selectedBalconySegmentIndex.set(selectedIndex - 1);
    } else if (selectedIndex >= this.balconySegments.length) {
      this.selectedBalconySegmentIndex.set(Math.max(0, this.balconySegments.length - 1));
    }
    this.relabelBalconySegments(this.selectedBalconyShape());
    this.syncBalconyWidth();
  }

  joineryPanelNeedsHinge(panel: JoineryPanel, index?: number): boolean {
    const opening = index === undefined ? panel.opening : this.joineryPanelSelections()[index];
    return opening === 'turn' || opening === 'tilt_turn';
  }

  joineryPanelOpeningValue(index: number): JoineryPanelOpeningSelection {
    return this.joineryPanelSelections()[index] ?? '';
  }

  joineryPanelHingeValue(index: number): JoineryPanelHingeSelection {
    return this.joineryHingeSelections()[index] ?? '';
  }

  updateJoineryPanelOpening(index: number, value: string): void {
    if (value !== '' && !JOINERY_OPENING_VALUES.has(value as JoineryPanel['opening'])) {
      return;
    }
    const panels = [...this.joineryPanels()];
    const panel = panels[index];
    if (!panel) {
      return;
    }
    const openingSelections = [...this.joineryPanelSelections()];
    const hingeSelections = [...this.joineryHingeSelections()];
    this.joinerySelectionError.set(false);
    openingSelections[index] = value as JoineryPanelOpeningSelection;
    hingeSelections[index] = '';
    if (!value) {
      panels[index] = { ...panel, opening: 'fixed', hinge: 'none' };
      this.joineryPanelSelections.set(openingSelections);
      this.joineryHingeSelections.set(hingeSelections);
      this.joineryPanels.set(panels);
      return;
    }
    const opening = value as JoineryPanel['opening'];
    panels[index] = { ...panel, opening, hinge: 'none' };
    this.joineryPanelSelections.set(openingSelections);
    this.joineryHingeSelections.set(hingeSelections);
    this.joineryPanels.set(panels);
  }

  updateJoineryPanelHinge(index: number, value: string): void {
    if (value !== '' && value !== 'left' && value !== 'right') {
      return;
    }
    const panels = [...this.joineryPanels()];
    const panel = panels[index];
    if (!panel || !this.joineryPanelNeedsHinge(panel, index)) {
      return;
    }
    const hingeSelections = [...this.joineryHingeSelections()];
    this.joinerySelectionError.set(false);
    hingeSelections[index] = value as JoineryPanelHingeSelection;
    panels[index] = { ...panel, hinge: value === '' ? 'none' : (value as 'left' | 'right') };
    this.joineryHingeSelections.set(hingeSelections);
    this.joineryPanels.set(panels);
  }

  goToContact(): void {
    this.productForm.markAllAsTouched();
    this.catalogForm().markAllAsTouched();
    const joineryIncomplete = this.isJoinery() && !this.joinerySelectionsComplete();
    this.joinerySelectionError.set(joineryIncomplete);
    if (this.productForm.invalid || this.catalogForm().invalid || joineryIncomplete) {
      return;
    }
    this.submitError.set(null);
    this.joinerySelectionError.set(false);
    this.step.set(3);
    this.focusStepHeading();
  }

  goBack(): void {
    const currentStep = this.step();
    if (currentStep === 3) {
      this.goToStep(2);
    } else if (currentStep === 2) {
      this.goToStep(1);
    }
  }

  goToStep(targetStep: 1 | 2): void {
    const currentStep = this.step();
    if (currentStep === 4 || targetStep >= currentStep) {
      return;
    }
    this.submitError.set(null);
    this.joinerySelectionError.set(false);
    this.step.set(targetStep);
    this.focusStepHeading();
  }

  submit(): void {
    this.productForm.markAllAsTouched();
    this.catalogForm().markAllAsTouched();
    this.contactForm.markAllAsTouched();
    if (this.productForm.invalid || this.catalogForm().invalid) {
      this.step.set(2);
      this.focusStepHeading();
      return;
    }
    if (this.contactForm.invalid || this.submitting()) {
      return;
    }

    if (this.contactForm.controls.website.value.trim()) {
      this.completion.set({
        request_number: '',
        status: 'received',
        message: 'Talebiniz alındı.',
      });
      this.step.set(4);
      this.focusStepHeading();
      return;
    }

    this.submitError.set(null);
    this.submitting.set(true);
    this.api.createRequest(this.createPayload()).subscribe({
      next: (response) => {
        this.completion.set(response);
        this.step.set(4);
        this.focusStepHeading();
        this.submitting.set(false);
      },
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && (error.status === 409 || error.status === 422)) {
          this.loadCatalog();
        }
        this.submitError.set(this.publicErrorMessage(error));
        this.submitting.set(false);
      },
    });
  }

  reset(): void {
    const firstProductKey = this.products()[0]?.key ?? 'pvc_window';
    this.productForm.reset({ productType: firstProductKey });
    this.contactForm.reset();
    this.applyProductDefaults(firstProductKey);
    this.configureCatalogForm(firstProductKey);
    this.updateContactValidators('phone');
    this.completion.set(null);
    this.submitError.set(null);
    this.selectedBalconySegmentIndex.set(0);
    this.step.set(1);
    this.focusStepHeading();
  }

  private focusStepHeading(): void {
    queueMicrotask(() => {
      const heading = this.configuratorTitle()?.nativeElement;
      if (!heading) {
        return;
      }
      heading.focus({ preventScroll: true });
      if (typeof heading.scrollIntoView === 'function') {
        heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  private activateFallbackCatalog(): void {
    this.products.set(this.catalog.fallbackProducts);
    this.usingFallbackCatalog.set(true);
    this.catalogError.set(
      'Katalog bağlantısı kurulamadı. Güvenli temel seçenekler gösteriliyor; dilerseniz yeniden deneyin.',
    );
    this.configureCatalogForm(this.productType());
    this.catalogLoading.set(false);
  }

  private configureCatalogForm(type: string): void {
    this.catalogSubscriptions.forEach((subscription) => subscription.unsubscribe());
    this.catalogSubscriptions = [];
    const product =
      this.products().find((entry) => entry.key === type) ??
      this.catalog.fallbackProducts.find((entry) => entry.key === type);
    const form = new FormRecord<FormControl<string | boolean>>({});
    if (!product) {
      this.configureProfileSeries();
      this.configureNotesField();
      this.catalogForm.set(form);
      this.catalogAnswers.set({});
      this.joineryPanels.set([]);
      this.joineryPanelSelections.set([]);
      this.joineryHingeSelections.set([]);
      return;
    }
    this.configureProfileSeries(product);
    this.configureNotesField(product);
    for (const field of product.fields.slice(0, 30)) {
      if (!isSafeCatalogKey(field.key) || field.key === 'notes' || field.key === 'profile_series') {
        continue;
      }
      const initialValue = field.field_type === 'boolean' ? false : '';
      const validators =
        field.required && field.field_type !== 'boolean' ? [Validators.required] : [];
      if (field.field_type === 'text') {
        validators.push(Validators.maxLength(500));
      }
      form.addControl(
        field.key,
        new FormControl<string | boolean>(initialValue, {
          nonNullable: true,
          validators,
        }),
      );
    }
    this.catalogForm.set(form);
    const initialAnswers = this.sanitizeAnswers(product, form.getRawValue());
    this.catalogAnswers.set(initialAnswers);
    this.syncJoineryPanels(type, initialAnswers);
    if (type === 'balcony_enclosure') {
      this.syncBalconySegments(
        typeof initialAnswers['enclosure_shape'] === 'string'
          ? initialAnswers['enclosure_shape']
          : 'straight',
      );
    }
    this.catalogSubscriptions.push(
      form.valueChanges.subscribe(() => {
        const previousAnswers = this.catalogAnswers();
        let answers = this.sanitizeAnswers(product, form.getRawValue());
        if (answers['layout'] !== previousAnswers['layout']) {
          answers = this.sanitizeAnswers(product, form.getRawValue());
        }
        const previousShape = this.catalogAnswers()['enclosure_shape'];
        this.catalogAnswers.set(answers);
        if (
          answers['layout'] !== previousAnswers['layout'] ||
          answers['opening_mechanism'] !== previousAnswers['opening_mechanism'] ||
          answers['opening_direction'] !== previousAnswers['opening_direction']
        ) {
          this.syncJoineryPanels(type, answers);
        }
        const nextShape = answers['enclosure_shape'];
        if (
          type === 'balcony_enclosure' &&
          typeof nextShape === 'string' &&
          nextShape !== previousShape
        ) {
          this.syncBalconySegments(nextShape);
        }
      }),
    );
  }

  private syncJoineryPanels(type: string, answers: CatalogAnswers): void {
    if (type !== 'pvc_window' && type !== 'pvc_door') {
      this.joineryPanels.set([]);
      this.joineryPanelSelections.set([]);
      this.joineryHingeSelections.set([]);
      this.joinerySelectionError.set(false);
      return;
    }
    const rawLayout = answers['layout'];
    if (typeof rawLayout !== 'string' || !rawLayout) {
      this.joineryPanels.set([]);
      this.joineryPanelSelections.set([]);
      this.joineryHingeSelections.set([]);
      this.joinerySelectionError.set(false);
      return;
    }
    const layout = rawLayout as JoineryLayout;
    const rawOpening = answers['opening_mechanism'];
    const fallbackOpening: JoineryPanel['opening'] =
      layout === 'fixed'
        ? 'fixed'
        : layout === 'tilt_turn'
          ? 'tilt_turn'
          : layout === 'sliding'
            ? 'sliding'
            : 'turn';
    const opening =
      typeof rawOpening === 'string' &&
      JOINERY_OPENING_VALUES.has(rawOpening as JoineryPanel['opening'])
        ? (rawOpening as JoineryPanel['opening'])
        : fallbackOpening;
    const rawHinge = answers['opening_direction'];
    const hinge = rawHinge === 'left' || rawHinge === 'right' ? rawHinge : 'right';
    const panels = buildJoineryPanels(type, layout, opening, hinge);
    this.joineryPanels.set(panels);
    this.joineryPanelSelections.set(panels.map((panel) => panel.opening));
    this.joineryHingeSelections.set(
      panels.map((panel) =>
        panel.opening === 'turn' || panel.opening === 'tilt_turn'
          ? panel.hinge === 'left' || panel.hinge === 'right'
            ? panel.hinge
            : ''
          : '',
      ),
    );
  }

  private sanitizeAnswers(
    product: CatalogProduct,
    values: Readonly<Record<string, string | boolean>>,
  ): CatalogAnswers {
    const result = Object.create(null) as Record<string, string | boolean>;
    for (const field of product.fields.slice(0, 30)) {
      if (!isSafeCatalogKey(field.key) || field.key === 'notes' || field.key === 'profile_series') {
        continue;
      }
      const value = values[field.key];
      if (field.field_type === 'boolean' && typeof value === 'boolean') {
        result[field.key] = value;
      } else if (
        field.field_type === 'select' &&
        typeof value === 'string' &&
        field.options.some((option) => option.value === value)
      ) {
        result[field.key] = value.slice(0, 120);
      } else if (field.field_type === 'text' && typeof value === 'string') {
        result[field.key] = value.trim().slice(0, 500);
      }
    }
    return result;
  }

  private applyProductDefaults(type: string): void {
    this.selectedBalconySegmentIndex.set(0);
    if (!isProductType(type)) {
      this.balconySegments.disable({ emitEvent: false });
      this.productForm.patchValue({
        template: '',
        width: null,
        height: null,
        usagePrimary: '',
        usageSecondary: '',
        usageTertiary: '',
        color: 'white',
        profileSeries: '',
        notes: '',
      });
      this.productForm.controls.width.setValidators([
        Validators.required,
        Validators.min(100),
        Validators.max(50_000),
      ]);
      this.productForm.controls.height.setValidators([
        Validators.required,
        Validators.min(100),
        Validators.max(50_000),
      ]);
      this.productForm.controls.width.updateValueAndValidity();
      this.productForm.controls.height.updateValueAndValidity();
      return;
    }
    if (type === 'balcony_enclosure') {
      this.balconySegments.enable({ emitEvent: false });
      this.syncBalconySegments('straight', true);
    } else {
      this.balconySegments.disable({ emitEvent: false });
    }
    const defaults: Readonly<
      Record<
        ProductType,
        {
          readonly template: string;
          readonly usagePrimary: string;
          readonly usageSecondary: string;
          readonly usageTertiary: string;
        }
      >
    > = {
      pvc_window: {
        template: 'single_sash',
        usagePrimary: 'living',
        usageSecondary: 'ventilation',
        usageTertiary: 'none',
      },
      pvc_door: {
        template: 'single',
        usagePrimary: 'balcony',
        usageSecondary: 'standard',
        usageTertiary: 'daily',
      },
      flyscreen: {
        template: 'fixed',
        usagePrimary: 'window',
        usageSecondary: 'sometimes',
        usageTertiary: 'no',
      },
      guillotine_glass: {
        template: 'manual',
        usagePrimary: 'advisor',
        usageSecondary: 'daily',
        usageTertiary: 'advisor',
      },
      facade_cladding: {
        template: 'composite_panel',
        usagePrimary: 'advisor',
        usageSecondary: 'advisor',
        usageTertiary: 'advisor',
      },
      balcony_enclosure: {
        template: 'sliding',
        usagePrimary: 'seasonal',
        usageSecondary: 'advisor',
        usageTertiary: 'yes',
      },
    };
    this.productForm.patchValue({
      ...defaults[type],
      width: null,
      height: null,
      profileSeries: '',
      notes: '',
    });
    const limits = PRODUCT_MEASUREMENT_LIMITS[type];
    this.productForm.controls.width.setValidators([
      Validators.required,
      Validators.min(limits.minWidth),
      Validators.max(limits.maxWidth),
    ]);
    this.productForm.controls.height.setValidators([
      Validators.required,
      Validators.min(limits.minHeight),
      Validators.max(limits.maxHeight),
    ]);
    this.productForm.controls.width.updateValueAndValidity();
    this.productForm.controls.height.updateValueAndValidity();
  }

  private updateContactValidators(preference: 'phone' | 'email'): void {
    this.contactForm.controls.phone.setValidators([
      ...(preference === 'phone' ? [Validators.required] : []),
      Validators.pattern(/^[+0-9()\-\s.]{7,32}$/),
    ]);
    this.contactForm.controls.email.setValidators([
      ...(preference === 'email' ? [Validators.required] : []),
      Validators.email,
      Validators.maxLength(254),
    ]);
    this.contactForm.controls.phone.updateValueAndValidity();
    this.contactForm.controls.email.updateValueAndValidity();
  }

  private createPayload(): PublicRequestCreate {
    const contact = this.contactForm.getRawValue();
    return {
      contact: {
        full_name: contact.fullName.trim(),
        company_name: this.trimOrNull(contact.companyName),
        email: this.trimOrNull(contact.email),
        phone: this.trimOrNull(contact.phone),
        preferred_contact: contact.preferredContact,
        city: this.trimOrNull(contact.city),
        district: this.trimOrNull(contact.district),
      },
      items: [this.currentItem()],
      project_note: this.trimOrNull(contact.projectNote),
      privacy_consent: true,
    };
  }

  private buildItem(value: ReturnType<typeof this.productForm.getRawValue>): PublicRequestItem {
    const base = {
      width_mm: Number(value.width ?? 0),
      height_mm: Number(value.height ?? 0),
      quantity: Number(value.quantity),
      color: this.catalogString('color', value.color),
      profile_series: this.selectedSeriesOption()?.label ?? null,
      notes: this.currentNotesField() ? this.trimOrNull(value.notes) : null,
      drawing_version: (value.productType === 'pvc_window' ||
      value.productType === 'pvc_door' ||
      value.productType === 'balcony_enclosure'
        ? '2'
        : '1') as '1' | '2',
      catalog_answers: this.requestCatalogAnswers(value.productType),
      profile_spec: this.selectedSeriesOption()?.profile_spec ?? null,
    };

    if (value.productType === 'pvc_window') {
      const layout = this.catalogAllowed<WindowItem['layout']>(
        'layout',
        [
          'fixed',
          'single_sash',
          'double_sash',
          'tilt_turn',
          'transom',
          'custom_grid',
          'window_door',
          'door_window',
          'window_door_window',
        ],
        value.template as WindowItem['layout'],
      );
      const opening = this.catalogAllowed<WindowItem['opening_direction']>(
        'opening_direction',
        ['none', 'left', 'right', 'inward', 'outward'],
        this.joineryOpeningDirection(
          'pvc_window',
          value.opening === 'none' || value.opening === 'sliding' ? 'right' : value.opening,
        ) as WindowItem['opening_direction'],
      );
      const item: WindowItem = {
        ...base,
        product_type: 'pvc_window',
        layout,
        opening_direction: opening,
        glazing: this.catalogString('glazing', value.glazing),
        panels: this.previewJoineryPanels('pvc_window', layout),
        divisions:
          layout === 'double_sash'
            ? [{ axis: 'vertical', position_percent: 50 }]
            : layout === 'transom'
              ? [{ axis: 'horizontal', position_percent: 28 }]
              : layout === 'custom_grid'
                ? [
                    { axis: 'vertical', position_percent: 50 },
                    { axis: 'horizontal', position_percent: 50 },
                  ]
                : layout === 'window_door'
                  ? [{ axis: 'vertical', position_percent: 38 }]
                  : layout === 'door_window'
                    ? [{ axis: 'vertical', position_percent: 62 }]
                    : layout === 'window_door_window'
                      ? [
                          { axis: 'vertical', position_percent: 28 },
                          { axis: 'vertical', position_percent: 72 },
                        ]
                      : [],
      };
      return item;
    }

    if (value.productType === 'pvc_door') {
      const layout = this.catalogAllowed<DoorItem['layout']>(
        'layout',
        [
          'single',
          'double',
          'balcony',
          'sliding',
          'window_door',
          'door_window',
          'window_door_window',
        ],
        value.template as DoorItem['layout'],
      );
      const opening = this.catalogAllowed<DoorItem['opening_direction']>(
        'opening_direction',
        ['left', 'right', 'inward', 'outward', 'sliding'],
        this.joineryOpeningDirection(
          'pvc_door',
          value.opening === 'none' ? 'right' : value.opening,
        ) as DoorItem['opening_direction'],
      );
      const item: DoorItem = {
        ...base,
        product_type: 'pvc_door',
        layout,
        opening_direction: opening,
        glazing: this.catalogString('glazing', value.glazing),
        threshold: this.catalogString('threshold', value.threshold),
        panels: this.previewJoineryPanels('pvc_door', layout),
        divisions:
          layout === 'double' || layout === 'sliding'
            ? [{ axis: 'vertical', position_percent: 50 }]
            : layout === 'window_door'
              ? [{ axis: 'vertical', position_percent: 38 }]
              : layout === 'door_window'
                ? [{ axis: 'vertical', position_percent: 62 }]
                : layout === 'window_door_window'
                  ? [
                      { axis: 'vertical', position_percent: 28 },
                      { axis: 'vertical', position_percent: 72 },
                    ]
                  : [],
      };
      return item;
    }

    if (value.productType === 'flyscreen') {
      const item: FlyscreenItem = {
        ...base,
        product_type: 'flyscreen',
        screen_type: this.catalogAllowed<FlyscreenItem['screen_type']>(
          'screen_type',
          ['fixed', 'hinged', 'sliding', 'roller', 'pleated'],
          value.template as FlyscreenItem['screen_type'],
        ),
        mesh_type: this.catalogString('mesh_type', value.meshType),
      };
      return item;
    }

    if (value.productType === 'guillotine_glass') {
      const selectedSystem = this.catalogString('system_type', value.template);
      const panelCount = this.catalogAllowed<'2' | '3' | '4'>(
        'panel_count',
        ['2', '3', '4'],
        String(value.panelCount) as '2' | '3' | '4',
      );
      const item: GuillotineGlassItem = {
        ...base,
        product_type: 'guillotine_glass',
        system_type: selectedSystem,
        panel_count: Number(panelCount) as 2 | 3 | 4,
        glass_type: this.catalogString('glass_type', value.glassType),
        bottom_fixed: this.catalogBoolean('bottom_fixed', value.bottomFixed),
      };
      return item;
    }

    if (value.productType === 'facade_cladding') {
      const item: FacadeCladdingItem = {
        ...base,
        product_type: 'facade_cladding',
        cladding_type: this.catalogString('cladding_type', value.template),
        panel_orientation: this.catalogAllowed<FacadeCladdingItem['panel_orientation']>(
          'panel_orientation',
          ['horizontal', 'vertical', 'mixed'],
          value.panelOrientation,
        ),
        installation_system: this.catalogString('installation_system', value.installationSystem),
        insulation_required: this.catalogBoolean('insulation_required', value.insulationRequired),
        substructure_material: this.catalogString(
          'substructure_material',
          value.substructureMaterial,
        ),
      };
      return item;
    }

    if (value.productType === 'balcony_enclosure') {
      const segments = this.currentBalconySegments();
      const item: BalconyEnclosureItem = {
        ...base,
        width_mm: segments[0]?.width_mm ?? base.width_mm,
        product_type: 'balcony_enclosure',
        system_type: this.catalogAllowed<BalconyEnclosureItem['system_type']>(
          'system_type',
          ['sliding', 'folding', 'guillotine', 'pvc_joinery'],
          value.template as BalconyEnclosureItem['system_type'],
        ),
        enclosure_shape: this.catalogString('enclosure_shape', value.enclosureShape),
        roof_required: this.catalogBoolean('roof_required', value.roofRequired),
        parapet_type: this.catalogString('parapet_type', value.parapetType),
        segments,
        profile_spec: this.selectedBalconyProfileSpec(),
      };
      return item;
    }

    const item: GenericProductItem = {
      ...base,
      product_type: value.productType,
    };
    return item;
  }

  private catalogString(key: string, fallback: string): string {
    const value = this.catalogAnswers()[key];
    return typeof value === 'string' && value ? value : fallback;
  }

  private previewJoineryPanels(
    productType: 'pvc_window' | 'pvc_door',
    layout: JoineryLayout,
  ): readonly JoineryPanel[] {
    const panels = this.joineryPanels();
    if (panels.length) {
      return panels;
    }
    return buildJoineryPanels(productType, layout, 'fixed', 'none').map((panel) => ({
      ...panel,
      opening: 'fixed',
      hinge: 'none',
    }));
  }

  private requestCatalogAnswers(productType: string): CatalogAnswers {
    const answers = { ...this.catalogAnswers() };
    if (productType !== 'pvc_window' && productType !== 'pvc_door') {
      return answers;
    }

    const panel = this.joineryPanels()[0];
    const selectedOpening = this.joineryPanelSelections()[0];
    if (!panel || !selectedOpening) {
      return answers;
    }

    answers['opening_mechanism'] = selectedOpening;
    if (selectedOpening === 'sliding' && productType === 'pvc_door') {
      answers['opening_direction'] = 'sliding';
    } else if (this.joineryHingeSelections()[0]) {
      answers['opening_direction'] = this.joineryHingeSelections()[0];
    } else if (productType === 'pvc_window' && selectedOpening === 'fixed') {
      answers['opening_direction'] = 'none';
    }
    return answers;
  }

  private joineryOpeningDirection(
    productType: 'pvc_window' | 'pvc_door',
    fallback: string,
  ): string {
    const panel = this.joineryPanels()[0];
    if (!panel) {
      return fallback;
    }
    if (panel.opening === 'sliding' && productType === 'pvc_door') {
      return 'sliding';
    }
    if (panel.hinge === 'left' || panel.hinge === 'right') {
      return panel.hinge;
    }
    return productType === 'pvc_window' && panel.opening === 'fixed' ? 'none' : fallback;
  }

  private catalogBoolean(key: string, fallback: boolean): boolean {
    const value = this.catalogAnswers()[key];
    return typeof value === 'boolean' ? value : fallback;
  }

  private catalogAllowed<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
    const value = this.catalogString(key, fallback);
    return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  }

  private trimOrNull(value: string): string | null {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private createBalconySegment(label: string, turnDegrees: -90 | 0 | 90 | null) {
    return this.fb.group({
      label: this.fb.control(label, [Validators.required, Validators.maxLength(40)]),
      widthMm: new FormControl<number | null>(null, [
        Validators.required,
        Validators.min(turnDegrees === 0 ? 1000 : 300),
        Validators.max(30_000),
      ]),
      turnDegrees: new FormControl<-90 | 0 | 90 | null>(turnDegrees, [
        Validators.required,
        Validators.min(-90),
        Validators.max(90),
      ]),
    });
  }

  private syncBalconySegments(shape: string, reset = false): void {
    this.selectedBalconySegmentIndex.set(0);
    const fixedCounts: Readonly<Record<string, number>> = {
      straight: 1,
      l_shape: 2,
      u_shape: 3,
    };
    const targetCount =
      fixedCounts[shape] ??
      Math.max(2, Math.min(this.balconySegments.length, MAX_BALCONY_SEGMENTS));

    if (reset) {
      this.balconySegments.clear({ emitEvent: false });
    }
    while (this.balconySegments.length < targetCount) {
      const index = this.balconySegments.length;
      this.balconySegments.push(
        this.createBalconySegment(this.balconySegmentLabel(index, shape), index === 0 ? 0 : null),
        { emitEvent: false },
      );
    }
    while (this.balconySegments.length > targetCount) {
      this.balconySegments.removeAt(this.balconySegments.length - 1, { emitEvent: false });
    }

    this.relabelBalconySegments(shape);
    this.balconySegments.controls.forEach((control, index) => {
      if (index === 0) {
        control.controls.turnDegrees.setValue(0, { emitEvent: false });
      } else if (KNOWN_BALCONY_SHAPES.has(shape)) {
        control.controls.turnDegrees.setValue(null, { emitEvent: false });
      }
    });
    this.balconySegments.updateValueAndValidity({ emitEvent: true });
    this.syncBalconyWidth();
  }

  private relabelBalconySegments(shape: string): void {
    this.balconySegments.controls.forEach((control, index) =>
      control.controls.label.setValue(this.balconySegmentLabel(index, shape), {
        emitEvent: false,
      }),
    );
  }

  private balconySegmentLabel(index: number, shape: string): string {
    const letter = String.fromCharCode(65 + index);
    if (shape === 'straight') {
      return `${letter} · Ana cephe`;
    }
    if (shape === 'l_shape') {
      return index === 0 ? `${letter} · Ana cephe` : `${letter} · Yan cephe`;
    }
    if (shape === 'u_shape') {
      return [`${letter} · Ön cephe`, `${letter} · Sağ yan`, `${letter} · Sol yan`][index]!;
    }
    return `${letter} · Özel cephe ${index + 1}`;
  }

  private syncBalconyWidth(): void {
    if (this.balconySegments.disabled) {
      return;
    }
    const firstWidth = this.balconySegments.at(0)?.controls.widthMm.value ?? null;
    const width = firstWidth !== null && Number.isFinite(firstWidth) ? Number(firstWidth) : null;
    if (this.productForm.controls.width.value !== width) {
      this.productForm.controls.width.setValue(width);
    }
  }

  private measurementLimitsFor(type: string): MeasurementLimits {
    return isProductType(type) ? PRODUCT_MEASUREMENT_LIMITS[type] : GENERIC_MEASUREMENT_LIMITS;
  }

  private configureProfileSeries(product?: CatalogProduct): void {
    const field = product?.fields.find(
      (entry) => entry.key === 'profile_series' && entry.field_type === 'select',
    );
    const values = new Set(field?.options.map((option) => option.value) ?? []);
    this.productForm.controls.profileSeries.setValidators([
      ...(field?.required ? [Validators.required] : []),
      (control) =>
        !control.value || values.has(control.value) ? null : { unavailableSeries: true },
    ]);
    this.productForm.controls.profileSeries.setValue('');
    this.productForm.controls.profileSeries.updateValueAndValidity();
  }

  private configureNotesField(product?: CatalogProduct): void {
    const field = product?.fields.find((entry) => entry.key === 'notes');
    this.productForm.controls.notes.setValidators([
      Validators.maxLength(1000),
      ...(field?.required ? [Validators.required] : []),
    ]);
    this.productForm.controls.notes.updateValueAndValidity({ emitEvent: false });
  }

  private publicErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 429) {
      return 'Kısa sürede çok sayıda gönderim yapıldı. Lütfen biraz bekleyip yeniden deneyin.';
    }
    if (error instanceof HttpErrorResponse && (error.status === 409 || error.status === 422)) {
      return 'Ürün seçenekleri güncellendi. Lütfen güncel seçimleri yeniden kontrol edip gönderin.';
    }
    return 'Talebiniz şu anda iletilemedi. Bilgilerinizi kontrol edip yeniden deneyin.';
  }
}
