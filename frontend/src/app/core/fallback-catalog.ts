import {
  CatalogField,
  CatalogFieldType,
  CatalogMeasurement,
  CatalogOption,
  CatalogProduct,
} from './catalog.models';
import { BalconyProfileSpec, ProductType } from './request.models';

type OptionSeed = readonly [value: string, label: string, profileSpec?: BalconyProfileSpec];
type FieldSeed = readonly [
  key: string,
  label: string,
  help: string,
  type: CatalogFieldType,
  options?: readonly OptionSeed[],
];

let nextFallbackId = -1;

function options(values: readonly OptionSeed[]): readonly CatalogOption[] {
  return values.map(([value, label, profileSpec], index) => ({
    id: nextFallbackId--,
    value,
    label,
    ...(profileSpec ? { profile_spec: profileSpec } : {}),
    sort_order: index + 1,
  }));
}

const BALCONY_SYSTEM_PROFILE_SPECS: Readonly<Record<string, BalconyProfileSpec>> = {
  sliding: {
    edge_profile_mm: 50,
    mullion_profile_mm: 45,
    corner_profile_mm: 70,
    top_profile_mm: 50,
    bottom_profile_mm: 50,
    mounting_gap_mm: 10,
    min_glass_width_mm: 450,
    target_glass_width_mm: 850,
    max_glass_width_mm: 1000,
    min_panel_count: 2,
    max_panel_count: 40,
  },
  folding: {
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
  },
  guillotine: {
    edge_profile_mm: 60,
    mullion_profile_mm: 50,
    corner_profile_mm: 80,
    top_profile_mm: 60,
    bottom_profile_mm: 60,
    mounting_gap_mm: 10,
    min_glass_width_mm: 400,
    target_glass_width_mm: 700,
    max_glass_width_mm: 1000,
    min_panel_count: 2,
    max_panel_count: 4,
  },
  pvc_joinery: {
    edge_profile_mm: 65,
    mullion_profile_mm: 70,
    corner_profile_mm: 90,
    top_profile_mm: 65,
    bottom_profile_mm: 65,
    mounting_gap_mm: 10,
    min_glass_width_mm: 500,
    target_glass_width_mm: 900,
    max_glass_width_mm: 1200,
    min_panel_count: 1,
    max_panel_count: 20,
  },
};

function fields(seeds: readonly FieldSeed[]): readonly CatalogField[] {
  return seeds.map(([key, label, help, fieldType, values], index) => ({
    id: nextFallbackId--,
    key,
    label,
    help_text: help,
    field_type: fieldType,
    required: fieldType !== 'text',
    sort_order: index + 1,
    options: values ? options(values) : [],
  }));
}

const COLORS: readonly OptionSeed[] = [
  ['white', 'Beyaz'],
  ['anthracite', 'Antrasit'],
  ['golden_oak', 'Altın meşe'],
  ['walnut', 'Ceviz'],
  ['black', 'Siyah'],
  ['grey', 'Gri'],
];

const PRODUCT_META: Readonly<
  Record<
    ProductType,
    {
      readonly name: string;
      readonly material_group: 'pvc' | 'aluminium';
      readonly description: string;
      readonly mark: string;
      readonly measurement: CatalogMeasurement;
      readonly seeds: readonly FieldSeed[];
    }
  >
> = {
  pvc_window: {
    material_group: 'pvc',
    name: 'PVC pencere',
    description: 'Pencere, kanatlı düzen veya kapıyla birleşik PVC doğrama',
    mark: 'P',
    measurement: {
      variant: 'opening',
      width_instruction: 'Duvar boşluğunun sol iç kenarından sağ iç kenarına.',
      height_instruction: 'Alt mermerden veya boşluk tabanından üst iç kenara.',
      short_width_label: 'İçten içe genişlik',
      short_height_label: 'İçten içe yükseklik',
    },
    seeds: [
      [
        'usage_primary',
        'Bu pencere nerede kullanılacak?',
        'Mekâna uygun açılımı değerlendirmemize yardım eder.',
        'select',
        [
          ['living', 'Salon veya oda'],
          ['kitchen', 'Mutfak'],
          ['bathroom', 'Banyo / WC'],
          ['other', 'Diğer / emin değilim'],
        ],
      ],
      [
        'usage_secondary',
        'Sizin için en önemli konu nedir?',
        'Birden fazlaysa en önemlisini seçin.',
        'select',
        [
          ['ventilation', 'Kolay havalandırma'],
          ['insulation', 'Isı ve ses yalıtımı'],
          ['security', 'Güvenlik'],
          ['advisor', 'Bilmiyorum, uzman belirlesin'],
        ],
      ],
      [
        'usage_tertiary',
        'Evde küçük çocuk veya evcil hayvan var mı?',
        'Açılım ve güvenlik seçenekleri için kullanılır.',
        'select',
        [
          ['none', 'Hayır'],
          ['child', 'Küçük çocuk var'],
          ['pet', 'Evcil hayvan var'],
          ['both', 'Her ikisi de var'],
        ],
      ],
      [
        'layout',
        'Pencere modeli',
        'Emin değilseniz en yakın görünümü seçin.',
        'select',
        [
          ['fixed', 'Sabit pencere'],
          ['single_sash', 'Tek kanat'],
          ['double_sash', 'Çift kanat'],
          ['tilt_turn', 'Çift açılım'],
          ['transom', 'Üst vasistaslı'],
          ['custom_grid', 'Dört bölmeli'],
          ['window_door', 'Pencere + kapı'],
          ['door_window', 'Kapı + pencere'],
          ['window_door_window', 'Pencere + kapı + pencere'],
        ],
      ],
      [
        'opening_mechanism',
        'Kanat çalışma biçimi',
        'Sabit, tek açılım, vasistas veya çift açılım seçin.',
        'select',
        [
          ['fixed', 'Sabit'],
          ['turn', 'Tek açılım'],
          ['tilt', 'Vasistas'],
          ['tilt_turn', 'Çift açılım'],
          ['sliding', 'Sürme'],
        ],
      ],
      [
        'opening_direction',
        'Açılım',
        'Kanadın hareket yönü.',
        'select',
        [
          ['none', 'Açılım yok'],
          ['left', 'Sol açılım'],
          ['right', 'Sağ açılım'],
          ['inward', 'İçe açılım'],
          ['outward', 'Dışa açılım'],
        ],
      ],
      [
        'glazing',
        'Cam tercihi',
        'Cam türü daha sonra netleştirilebilir.',
        'select',
        [
          ['double_glazing', 'Isıcam'],
          ['triple_glazing', 'Üçlü cam'],
          ['laminated', 'Lamine cam'],
          ['tempered', 'Temperli cam'],
          ['panel', 'Panel'],
        ],
      ],
      ['color', 'Renk', 'Doğrama rengi.', 'select', COLORS],
    ],
  },
  pvc_door: {
    material_group: 'pvc',
    name: 'PVC kapı',
    description: 'Tek, çift, balkon veya sürme kapı',
    mark: 'K',
    measurement: {
      variant: 'opening',
      width_instruction: 'Kapı boşluğunun sol iç kenarından sağ iç kenarına.',
      height_instruction: 'Bitmiş zeminden boşluğun üst iç kenarına.',
      short_width_label: 'Kapı boşluğu',
      short_height_label: 'Zeminden üste',
    },
    seeds: [
      [
        'usage_primary',
        'Kapı nereye açılacak?',
        'Geçiş alanını seçin.',
        'select',
        [
          ['balcony', 'Balkon / teras'],
          ['garden', 'Bahçe'],
          ['entrance', 'Giriş'],
          ['other', 'Diğer / emin değilim'],
        ],
      ],
      [
        'usage_secondary',
        'Geçiş kolaylığı önemli mi?',
        'Alçak eşik ihtiyacını değerlendirebiliriz.',
        'select',
        [
          ['standard', 'Standart geçiş yeterli'],
          ['accessible', 'Engelsiz / alçak eşik olsun'],
          ['advisor', 'Bilmiyorum, uzman belirlesin'],
        ],
      ],
      [
        'usage_tertiary',
        'Kapı ne sıklıkla kullanılacak?',
        'Yaklaşık sıklık yeterli.',
        'select',
        [
          ['occasional', 'Ara sıra'],
          ['daily', 'Her gün'],
          ['intensive', 'Çok yoğun'],
        ],
      ],
      [
        'layout',
        'Kapı modeli',
        'En yakın görünümü seçin.',
        'select',
        [
          ['single', 'Tek kanat kapı'],
          ['double', 'Çift kanat kapı'],
          ['balcony', 'Balkon kapısı'],
          ['sliding', 'Sürme kapı'],
          ['window_door', 'Pencere + kapı'],
          ['door_window', 'Kapı + pencere'],
          ['window_door_window', 'Pencere + kapı + pencere'],
        ],
      ],
      [
        'opening_mechanism',
        'Kanat çalışma biçimi',
        'Kapı ve pencere kanatlarının çalışma biçimini seçin.',
        'select',
        [
          ['fixed', 'Sabit'],
          ['turn', 'Tek açılım'],
          ['tilt', 'Vasistas'],
          ['tilt_turn', 'Çift açılım'],
          ['sliding', 'Sürme'],
        ],
      ],
      [
        'opening_direction',
        'Açılım',
        'Kanadın hareket yönü.',
        'select',
        [
          ['left', 'Sol açılım'],
          ['right', 'Sağ açılım'],
          ['inward', 'İçe açılım'],
          ['outward', 'Dışa açılım'],
          ['sliding', 'Sürme'],
        ],
      ],
      [
        'glazing',
        'Cam veya panel',
        'Dolgu tercihi.',
        'select',
        [
          ['double_glazing', 'Isıcam'],
          ['triple_glazing', 'Üçlü cam'],
          ['laminated', 'Lamine cam'],
          ['tempered', 'Temperli cam'],
          ['panel', 'Panel'],
        ],
      ],
      [
        'threshold',
        'Eşik',
        'Geçiş tabanını seçin.',
        'select',
        [
          ['standard', 'Standart eşik'],
          ['low', 'Alçak eşik'],
          ['frameless', 'Eşiksiz'],
        ],
      ],
      ['color', 'Renk', 'Doğrama rengi.', 'select', COLORS],
    ],
  },
  flyscreen: {
    material_group: 'pvc',
    name: 'Sineklik',
    description: 'Sabit, menteşeli, sürme, stor veya plise',
    mark: 'S',
    measurement: {
      variant: 'opening',
      width_instruction: 'Sinekliğin takılacağı net açıklığın iki yan kenarı arası.',
      height_instruction: 'Aynı açıklığın alt kenarından üst kenarına.',
      short_width_label: 'Net açıklık',
      short_height_label: 'Net açıklık',
    },
    seeds: [
      [
        'usage_primary',
        'Sineklik nereye takılacak?',
        'Açıklığı seçin.',
        'select',
        [
          ['window', 'Pencereye'],
          ['door', 'Kapıya'],
          ['balcony', 'Balkon açıklığına'],
          ['advisor', 'Bilmiyorum, uzman belirlesin'],
        ],
      ],
      [
        'usage_secondary',
        'Sık sık açıp kapatacak mısınız?',
        'Kullanım sıklığınızı seçin.',
        'select',
        [
          ['never', 'Hayır, sabit kalabilir'],
          ['sometimes', 'Bazen'],
          ['often', 'Evet, sık sık'],
        ],
      ],
      [
        'usage_tertiary',
        'Evcil hayvanınız var mı?',
        'Dayanıklı tül gerekebilir.',
        'select',
        [
          ['no', 'Hayır'],
          ['cat', 'Kedi'],
          ['dog', 'Köpek'],
          ['other', 'Başka bir evcil hayvan'],
        ],
      ],
      [
        'screen_type',
        'Sineklik modeli',
        'En yakın kullanım biçimini seçin.',
        'select',
        [
          ['fixed', 'Sabit sineklik'],
          ['hinged', 'Menteşeli sineklik'],
          ['sliding', 'Sürme sineklik'],
          ['roller', 'Stor sineklik'],
          ['pleated', 'Plise sineklik'],
        ],
      ],
      [
        'mesh_type',
        'Tül türü',
        'Uzmanımız uygunluğu kontrol eder.',
        'select',
        [
          ['standard', 'Standart tül'],
          ['pet_resistant', 'Evcil hayvan dayanımlı'],
          ['pollen', 'Polen filtreli'],
          ['stainless', 'Paslanmaz tel'],
        ],
      ],
      ['color', 'Renk', 'Çerçeve rengi.', 'select', COLORS],
    ],
  },
  guillotine_glass: {
    material_group: 'aluminium',
    name: 'Giyotin cam',
    description: 'Elle veya motorla hareket eden dikey cam sistemi',
    mark: 'G',
    measurement: {
      variant: 'opening',
      width_instruction: 'Cam sisteminin kapanacağı açıklığın solundan sağına.',
      height_instruction: 'Alt bitiş noktasından üst kiriş veya tavana.',
      short_width_label: 'Kapanacak açıklık',
      short_height_label: 'Alt noktadan üste',
    },
    seeds: [
      [
        'usage_primary',
        'Camlar nasıl hareket etsin?',
        'Elle veya düğmeyle kullanım tercihinizi belirtin.',
        'select',
        [
          ['manual', 'Elle hareket etsin'],
          ['motorized', 'Düğmeyle / motorlu olsun'],
          ['advisor', 'Bilmiyorum, uzman belirlesin'],
        ],
      ],
      [
        'usage_secondary',
        'Bu alan ne kadar sık açılacak?',
        'Kullanım sıklığı.',
        'select',
        [
          ['occasional', 'Ara sıra'],
          ['daily', 'Her gün'],
          ['intensive', 'Gün içinde çok kez'],
        ],
      ],
      [
        'usage_tertiary',
        'Alt bölüm sabit kalsın mı?',
        'Emin değilseniz uzmanımız kontrol eder.',
        'select',
        [
          ['yes', 'Evet, sabit kalsın'],
          ['no', 'Hayır'],
          ['advisor', 'Bilmiyorum, uzman belirlesin'],
        ],
      ],
      [
        'system_type',
        'Hareket biçimi',
        'Elle veya motorla kullanım.',
        'select',
        [
          ['manual', 'Elle hareket eden'],
          ['motorized', 'Motorlu'],
        ],
      ],
      [
        'panel_count',
        'Cam panel sayısı',
        'Yaklaşık görünümü seçin.',
        'select',
        [
          ['2', '2 panel'],
          ['3', '3 panel'],
          ['4', '4 panel'],
        ],
      ],
      [
        'glass_type',
        'Cam tercihi',
        'Uzman kontrolüyle kesinleşir.',
        'select',
        [
          ['tempered', 'Temperli cam'],
          ['laminated', 'Lamine cam'],
        ],
      ],
      ['bottom_fixed', 'Alt bölüm sabit', 'Alt panel sabit kalsın.', 'boolean'],
      ['color', 'Renk', 'Çerçeve rengi.', 'select', COLORS],
    ],
  },
  facade_cladding: {
    material_group: 'aluminium',
    name: 'Dış cephe',
    description: 'Panel türü ve uygulama yüzeyiyle ön çalışma',
    mark: 'C',
    measurement: {
      variant: 'facade',
      width_instruction: 'Kaplanmasını istediğiniz ana yüzeyin soldan sağa toplamı.',
      height_instruction: 'Zemin başlangıcından kaplamanın biteceği üst noktaya.',
      short_width_label: 'Ana yüzey',
      short_height_label: 'Kaplama yüksekliği',
    },
    seeds: [
      [
        'usage_primary',
        'Kaplanacak yüzey nasıl?',
        'Ana yüzey şeklini seçin.',
        'select',
        [
          ['flat', 'Düz tek yüzey'],
          ['cornered', 'Köşeli / birden fazla yüzey'],
          ['irregular', 'Girintili çıkıntılı'],
          ['advisor', 'Bilmiyorum, uzman incelesin'],
        ],
      ],
      [
        'usage_secondary',
        'Yalıtım da istiyor musunuz?',
        'Emin değilseniz sorun değil.',
        'select',
        [
          ['yes', 'Evet'],
          ['no', 'Hayır'],
          ['advisor', 'Bilmiyorum, uzman belirlesin'],
        ],
      ],
      [
        'usage_tertiary',
        'Görünüm tercihiniz nedir?',
        'Yaklaşık görünüm yeterli.',
        'select',
        [
          ['plain', 'Sade ve düz'],
          ['jointed', 'Belirgin derzli'],
          ['mixed', 'Birden fazla renk / doku'],
          ['advisor', 'Uzman önerisini istiyorum'],
        ],
      ],
      [
        'cladding_type',
        'Kaplama türü',
        'Emin değilseniz diğer seçeneğini kullanın.',
        'select',
        [
          ['composite_panel', 'Kompozit panel'],
          ['compact_laminate', 'Kompakt laminat'],
          ['metal_panel', 'Metal panel'],
          ['fiber_cement', 'Fiber çimento'],
          ['other', 'Diğer / uzman görüşü'],
        ],
      ],
      [
        'panel_orientation',
        'Panel yönü',
        'Genel panel düzeni.',
        'select',
        [
          ['vertical', 'Dikey'],
          ['horizontal', 'Yatay'],
          ['mixed', 'Karma'],
        ],
      ],
      [
        'installation_system',
        'Uygulama türü',
        'Uzman kontrolüyle kesinleşir.',
        'select',
        [
          ['visible_fixing', 'Görünür bağlantı'],
          ['concealed_fixing', 'Gizli bağlantı'],
          ['cassette', 'Kaset sistem'],
        ],
      ],
      [
        'insulation_required',
        'Isı yalıtımı da değerlendirilsin',
        'Yalıtım ihtiyacını işaretleyin.',
        'boolean',
      ],
      [
        'substructure_material',
        'Alt konstrüksiyon',
        'Bilmiyorsanız uzman belirlesin.',
        'select',
        [
          ['unspecified', 'Uzman belirlesin'],
          ['aluminium', 'Alüminyum'],
          ['galvanized_steel', 'Galvaniz çelik'],
        ],
      ],
      ['color', 'Renk', 'Ana yüzey rengi.', 'select', COLORS],
    ],
  },
  balcony_enclosure: {
    material_group: 'aluminium',
    name: 'Balkon kapama',
    description: 'Sürme, katlanır, giyotin cam veya PVC çözüm',
    mark: 'B',
    measurement: {
      variant: 'balcony',
      width_instruction: 'Balkonun ana açık cephesini soldan sağa ölçün.',
      height_instruction: 'Parapet veya zeminden tavanın altına kadar ölçün.',
      short_width_label: 'Ana balkon cephesi',
      short_height_label: 'Net açıklık',
    },
    seeds: [
      [
        'usage_primary',
        'Balkonu nasıl kullanacaksınız?',
        'Ana kullanım amacını seçin.',
        'select',
        [
          ['living', 'Yaşam alanı'],
          ['seasonal', 'Mevsimlik kullanım'],
          ['protection', 'Yağmur ve rüzgârdan koruma'],
          ['advisor', 'Bilmiyorum, uzman yönlendirsin'],
        ],
      ],
      [
        'usage_secondary',
        'Camların tamamen açılması önemli mi?',
        'Yaklaşık tercih yeterli.',
        'select',
        [
          ['yes', 'Evet, tamamen açılsın'],
          ['partial', 'Kısmen açılması yeterli'],
          ['no', 'Açılması önemli değil'],
          ['advisor', 'Bilmiyorum, uzman belirlesin'],
        ],
      ],
      [
        'usage_tertiary',
        'Balkonun üstü kapalı mı?',
        'Üst örtü ihtiyacını anlamamıza yardım eder.',
        'select',
        [
          ['yes', 'Evet, üstü kapalı'],
          ['no', 'Hayır, açık'],
          ['partial', 'Kısmen kapalı'],
          ['unknown', 'Emin değilim'],
        ],
      ],
      [
        'system_type',
        'Kapama sistemi',
        'En yakın kullanım biçimini seçin.',
        'select',
        [
          ['sliding', 'Sürme cam', BALCONY_SYSTEM_PROFILE_SPECS['sliding']],
          ['folding', 'Katlanır cam', BALCONY_SYSTEM_PROFILE_SPECS['folding']],
          ['guillotine', 'Giyotin cam', BALCONY_SYSTEM_PROFILE_SPECS['guillotine']],
          ['pvc_joinery', 'PVC doğrama', BALCONY_SYSTEM_PROFILE_SPECS['pvc_joinery']],
        ],
      ],
      [
        'enclosure_shape',
        'Balkon şekli',
        'Ana görünüş şeklini seçin.',
        'select',
        [
          ['straight', 'Düz cephe'],
          ['l_shape', 'L şeklinde'],
          ['u_shape', 'U şeklinde'],
          ['custom', 'Özel / çok cepheli'],
        ],
      ],
      [
        'parapet_type',
        'Alt bölüm',
        'Mevcut alt bölümü seçin.',
        'select',
        [
          ['masonry', 'Duvar / parapet var'],
          ['glass', 'Cam parapet var'],
          ['none', 'Zeminden tavana açık'],
        ],
      ],
      [
        'roof_required',
        'Üst örtü de değerlendirilsin',
        'Üst örtü ihtiyacını işaretleyin.',
        'boolean',
      ],
      ['color', 'Renk', 'Çerçeve rengi.', 'select', COLORS],
    ],
  },
};

export const FALLBACK_CATALOG_PRODUCTS: readonly CatalogProduct[] = (
  Object.keys(PRODUCT_META) as ProductType[]
).map((key, index) => {
  const product = PRODUCT_META[key];
  return {
    key,
    material_group: product.material_group,
    name: product.name,
    description: product.description,
    mark: product.mark,
    sort_order: index + 1,
    measurement: product.measurement,
    fields: fields(product.seeds),
  };
});
