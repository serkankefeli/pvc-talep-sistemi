from __future__ import annotations

from math import isclose, isfinite
from typing import Any

from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from .models import (
    CatalogField,
    CatalogOption,
    CatalogOptionProfileSpec,
    CatalogProduct,
    CatalogProductMaterial,
)
from .schemas import (
    BalconyEnclosureItemCreate,
    CustomProductItemCreate,
    ProductItemCreate,
    ProfileSpec,
)


COLORS = [
    ("white", "Beyaz"),
    ("anthracite", "Antrasit"),
    ("golden_oak", "Altın meşe"),
    ("walnut", "Ceviz"),
    ("black", "Siyah"),
    ("grey", "Gri"),
]


BALCONY_SYSTEM_PROFILE_SPECS: dict[str, dict[str, int]] = {
    "sliding": {
        "edge_profile_mm": 50,
        "mullion_profile_mm": 45,
        "corner_profile_mm": 70,
        "top_profile_mm": 50,
        "bottom_profile_mm": 50,
        "mounting_gap_mm": 10,
        "min_glass_width_mm": 450,
        "target_glass_width_mm": 850,
        "max_glass_width_mm": 1000,
        "min_panel_count": 2,
        "max_panel_count": 40,
    },
    "folding": {
        "edge_profile_mm": 45,
        "mullion_profile_mm": 35,
        "corner_profile_mm": 65,
        "top_profile_mm": 45,
        "bottom_profile_mm": 45,
        "mounting_gap_mm": 10,
        "min_glass_width_mm": 400,
        "target_glass_width_mm": 700,
        "max_glass_width_mm": 900,
        "min_panel_count": 2,
        "max_panel_count": 40,
    },
    "guillotine": {
        "edge_profile_mm": 60,
        "mullion_profile_mm": 50,
        "corner_profile_mm": 80,
        "top_profile_mm": 60,
        "bottom_profile_mm": 60,
        "mounting_gap_mm": 10,
        "min_glass_width_mm": 400,
        "target_glass_width_mm": 700,
        "max_glass_width_mm": 1000,
        "min_panel_count": 2,
        "max_panel_count": 4,
    },
    "pvc_joinery": {
        "edge_profile_mm": 65,
        "mullion_profile_mm": 70,
        "corner_profile_mm": 90,
        "top_profile_mm": 65,
        "bottom_profile_mm": 65,
        "mounting_gap_mm": 10,
        "min_glass_width_mm": 500,
        "target_glass_width_mm": 900,
        "max_glass_width_mm": 1200,
        "min_panel_count": 1,
        "max_panel_count": 20,
    },
}


def _select(
    key: str,
    label: str,
    options: list[tuple[str, str]],
    sort_order: int,
    *,
    help_text: str = "",
    required: bool = True,
) -> dict[str, Any]:
    return {
        "key": key,
        "label": label,
        "help_text": help_text,
        "field_type": "select",
        "required": required,
        "active": True,
        "sort_order": sort_order,
        "options": options,
    }


def _boolean(
    key: str,
    label: str,
    sort_order: int,
    *,
    help_text: str = "",
    required: bool = True,
) -> dict[str, Any]:
    return {
        "key": key,
        "label": label,
        "help_text": help_text,
        "field_type": "boolean",
        "required": required,
        "active": True,
        "sort_order": sort_order,
        "options": [],
    }


def _text(
    key: str,
    label: str,
    sort_order: int,
    *,
    help_text: str = "",
) -> dict[str, Any]:
    return {
        "key": key,
        "label": label,
        "help_text": help_text,
        "field_type": "text",
        "required": False,
        "active": True,
        "sort_order": sort_order,
        "options": [],
    }


def _number(
    key: str,
    label: str,
    sort_order: int,
    *,
    unit: str,
    min_value: float,
    max_value: float,
    step: float = 1,
    help_text: str = "",
    required: bool = False,
) -> dict[str, Any]:
    return {
        "key": key,
        "label": label,
        "help_text": help_text,
        "field_type": "number",
        "unit": unit,
        "min_value": min_value,
        "max_value": max_value,
        "step": step,
        "required": required,
        "active": True,
        "sort_order": sort_order,
        "options": [],
    }


GUIDED_FIELDS: dict[str, list[dict[str, Any]]] = {
    "pvc_window": [
        _select(
            "usage_primary",
            "Bu pencere nerede kullanılacak?",
            [
                ("living", "Salon veya oda"),
                ("kitchen", "Mutfak"),
                ("bathroom", "Banyo / WC"),
                ("other", "Diğer / emin değilim"),
            ],
            100,
            help_text="Mekâna uygun açılımı değerlendirmemize yardım eder.",
            required=False,
        ),
        _select(
            "usage_secondary",
            "Sizin için en önemli konu nedir?",
            [
                ("ventilation", "Kolay havalandırma"),
                ("insulation", "Isı ve ses yalıtımı"),
                ("security", "Güvenlik"),
                ("advisor", "Bilmiyorum, uzman belirlesin"),
            ],
            110,
            help_text="Birden fazlaysa en önemlisini seçin.",
            required=False,
        ),
        _select(
            "usage_tertiary",
            "Evde küçük çocuk veya evcil hayvan var mı?",
            [
                ("none", "Hayır"),
                ("child", "Küçük çocuk var"),
                ("pet", "Evcil hayvan var"),
                ("both", "Her ikisi de var"),
            ],
            120,
            help_text="Açılım ve güvenlik seçenekleri için kullanılır.",
            required=False,
        ),
    ],
    "pvc_door": [
        _select(
            "usage_primary",
            "Kapı nereye açılacak?",
            [
                ("balcony", "Balkon / teras"),
                ("garden", "Bahçe"),
                ("entrance", "Giriş"),
                ("other", "Diğer / emin değilim"),
            ],
            100,
            help_text="Geçiş yoğunluğunu anlamamıza yardım eder.",
            required=False,
        ),
        _select(
            "usage_secondary",
            "Geçiş kolaylığı önemli mi?",
            [
                ("standard", "Standart geçiş yeterli"),
                ("accessible", "Engelsiz / alçak eşik olsun"),
                ("advisor", "Bilmiyorum, uzman belirlesin"),
            ],
            110,
            help_text="Alçak eşik ihtiyacını değerlendirebiliriz.",
            required=False,
        ),
        _select(
            "usage_tertiary",
            "Kapı ne sıklıkla kullanılacak?",
            [
                ("occasional", "Ara sıra"),
                ("daily", "Her gün"),
                ("intensive", "Çok yoğun"),
            ],
            120,
            help_text="Donanım seçimi için yol gösterir.",
            required=False,
        ),
    ],
    "flyscreen": [
        _select(
            "usage_primary",
            "Sineklik nereye takılacak?",
            [
                ("window", "Pencereye"),
                ("door", "Kapıya"),
                ("balcony", "Balkon açıklığına"),
                ("advisor", "Bilmiyorum, uzman belirlesin"),
            ],
            100,
            help_text="Açıklığın kullanım biçimini seçin.",
            required=False,
        ),
        _select(
            "usage_secondary",
            "Sık sık açıp kapatacak mısınız?",
            [
                ("never", "Hayır, sabit kalabilir"),
                ("sometimes", "Bazen"),
                ("often", "Evet, sık sık"),
            ],
            110,
            help_text="Sabit veya hareketli model seçiminde yardımcı olur.",
            required=False,
        ),
        _select(
            "usage_tertiary",
            "Evcil hayvanınız var mı?",
            [
                ("no", "Hayır"),
                ("cat", "Kedi"),
                ("dog", "Köpek"),
                ("other", "Başka bir evcil hayvan"),
            ],
            120,
            help_text="Daha dayanıklı tül gerekebilir.",
            required=False,
        ),
    ],
    "guillotine_glass": [
        _select(
            "usage_primary",
            "Camlar nasıl hareket etsin?",
            [
                ("manual", "Elle hareket etsin"),
                ("motorized", "Düğmeyle / motorlu olsun"),
                ("advisor", "Bilmiyorum, uzman belirlesin"),
            ],
            100,
            help_text="Elle veya düğmeyle kullanım tercihinizi belirtin.",
            required=False,
        ),
        _select(
            "usage_secondary",
            "Bu alan ne kadar sık açılacak?",
            [
                ("occasional", "Ara sıra"),
                ("daily", "Her gün"),
                ("intensive", "Gün içinde çok kez"),
            ],
            110,
            help_text="Günlük kullanım alışkanlığınızı seçin.",
            required=False,
        ),
        _select(
            "usage_tertiary",
            "Alt bölüm sabit kalsın mı?",
            [
                ("yes", "Evet, sabit kalsın"),
                ("no", "Hayır"),
                ("advisor", "Bilmiyorum, uzman belirlesin"),
            ],
            120,
            help_text="Emin değilseniz uzmanımız kontrol eder.",
            required=False,
        ),
    ],
    "facade_cladding": [
        _select(
            "usage_primary",
            "Kaplanacak yüzey nasıl?",
            [
                ("flat", "Düz tek yüzey"),
                ("cornered", "Köşeli / birden fazla yüzey"),
                ("irregular", "Girintili çıkıntılı"),
                ("advisor", "Bilmiyorum, uzman incelesin"),
            ],
            100,
            help_text="Ana cephe şeklini yaklaşık seçin.",
            required=False,
        ),
        _select(
            "usage_secondary",
            "Yalıtım da istiyor musunuz?",
            [
                ("yes", "Evet"),
                ("no", "Hayır"),
                ("advisor", "Bilmiyorum, uzman belirlesin"),
            ],
            110,
            help_text="Mevcut duvarın durumunu bilmiyorsanız sorun değil.",
            required=False,
        ),
        _select(
            "usage_tertiary",
            "Görünüm tercihiniz nedir?",
            [
                ("plain", "Sade ve düz"),
                ("jointed", "Belirgin derzli"),
                ("mixed", "Birden fazla renk / doku"),
                ("advisor", "Uzman önerisini istiyorum"),
            ],
            120,
            help_text="Panel düzeni daha sonra netleştirilebilir.",
            required=False,
        ),
    ],
    "balcony_enclosure": [
        _select(
            "usage_primary",
            "Balkonu nasıl kullanacaksınız?",
            [
                ("living", "Yaşam alanı"),
                ("seasonal", "Mevsimlik kullanım"),
                ("protection", "Yağmur ve rüzgârdan koruma"),
                ("advisor", "Bilmiyorum, uzman yönlendirsin"),
            ],
            100,
            help_text="Günlük kullanım amacınızı seçin.",
            required=False,
        ),
        _select(
            "usage_secondary",
            "Camların tamamen açılması önemli mi?",
            [
                ("yes", "Evet, tamamen açılsın"),
                ("partial", "Kısmen açılması yeterli"),
                ("no", "Açılması önemli değil"),
                ("advisor", "Bilmiyorum, uzman belirlesin"),
            ],
            110,
            help_text="Sürme veya katlanır çözüm için yol gösterir.",
            required=False,
        ),
        _select(
            "usage_tertiary",
            "Balkonun üstü kapalı mı?",
            [
                ("yes", "Evet, üstü kapalı"),
                ("no", "Hayır, açık"),
                ("partial", "Kısmen kapalı"),
                ("unknown", "Emin değilim"),
            ],
            120,
            help_text="Çatı veya üst örtü ihtiyacını anlamamıza yardım eder.",
            required=False,
        ),
    ],
}

SPECIAL_SYSTEM_GUIDES = [
    _select(
        "usage_primary",
        "Sistem nerede kullanılacak?",
        [
            ("balcony", "Balkon / teras"),
            ("garden", "Bahçe çıkışı"),
            ("commercial", "İşyeri / ticari alan"),
            ("advisor", "Emin değilim, uzman yönlendirsin"),
        ],
        100,
        help_text="",
        required=False,
    ),
    _select(
        "usage_secondary",
        "Sizin için en önemli özellik nedir?",
        [
            ("wide_opening", "Geniş ve rahat geçiş"),
            ("insulation", "Isı ve ses yalıtımı"),
            ("security", "Güvenlik"),
            ("advisor", "Uzman önerisi"),
        ],
        110,
        help_text="",
        required=False,
    ),
    _select(
        "usage_tertiary",
        "Zemin eşiği tercihiniz nedir?",
        [
            ("standard", "Standart eşik"),
            ("low", "Alçak eşik"),
            ("flush", "Mümkünse sıfır eşik"),
            ("advisor", "Uzman belirlesin"),
        ],
        120,
        help_text="",
        required=False,
    ),
]

for _special_product_key in (
    "volkswagen_sliding_door",
    "hebeschiebe_system",
    "pivot_system",
    "folding_system",
):
    GUIDED_FIELDS[_special_product_key] = SPECIAL_SYSTEM_GUIDES


LEGACY_SPECIAL_SYSTEM_HELP_TEXTS = {
    "usage_primary": "Uygun model ve eşik değerlendirmesine yardımcı olur.",
    "usage_secondary": "Sistem serisi uzman kontrolünde kesinleşir.",
    "usage_tertiary": "Nihai eşik çözümü keşifte kontrol edilir.",
}


PRODUCT_FIELDS: dict[str, list[dict[str, Any]]] = {
    "pvc_window": [
        _select(
            "layout",
            "Pencere modeli",
            [
                ("fixed", "Sabit pencere"),
                ("single_sash", "Tek kanat"),
                ("double_sash", "Çift kanat"),
                ("tilt_turn", "Çift açılım"),
                ("transom", "Üst vasistaslı"),
                ("custom_grid", "Dört bölmeli"),
                ("window_door", "Pencere + kapı"),
                ("door_window", "Kapı + pencere"),
                ("window_door_window", "Pencere + kapı + pencere"),
            ],
            10,
        ),
        _select(
            "opening_direction",
            "Açılım yönü",
            [
                ("none", "Açılım yok"),
                ("left", "Sol açılım"),
                ("right", "Sağ açılım"),
                ("inward", "İçe açılım"),
                ("outward", "Dışa açılım"),
            ],
            20,
        ),
        _select(
            "opening_mechanism",
            "Kanat açılım şekli",
            [
                ("fixed", "Sabit"),
                ("turn", "Tek açılım"),
                ("tilt", "Vasistas"),
                ("tilt_turn", "Çift açılım"),
                ("sliding", "Sürme"),
            ],
            25,
            help_text="Seçilen kanadın çalışma biçimini belirtin.",
            required=False,
        ),
        _select(
            "glazing",
            "Cam türü",
            [
                ("double_glazing", "Isıcam"),
                ("triple_glazing", "Üçlü cam"),
                ("laminated", "Lamine cam"),
                ("tempered", "Temperli cam"),
                ("panel", "Panel"),
            ],
            30,
        ),
    ],
    "pvc_door": [
        _select(
            "layout",
            "Kapı modeli",
            [
                ("single", "Tek kanat kapı"),
                ("double", "Çift kanat kapı"),
                ("balcony", "Balkon kapısı"),
                ("sliding", "Sürme kapı"),
                ("window_door", "Pencere + kapı"),
                ("door_window", "Kapı + pencere"),
                ("window_door_window", "Pencere + kapı + pencere"),
            ],
            10,
        ),
        _select(
            "opening_direction",
            "Açılım yönü",
            [
                ("left", "Sol açılım"),
                ("right", "Sağ açılım"),
                ("inward", "İçe açılım"),
                ("outward", "Dışa açılım"),
                ("sliding", "Sürme"),
            ],
            20,
        ),
        _select(
            "opening_mechanism",
            "Kanat açılım şekli",
            [
                ("fixed", "Sabit"),
                ("turn", "Tek açılım"),
                ("tilt", "Vasistas"),
                ("tilt_turn", "Çift açılım"),
                ("sliding", "Sürme"),
            ],
            25,
            help_text="Seçilen kanadın çalışma biçimini belirtin.",
            required=False,
        ),
        _select(
            "glazing",
            "Cam veya panel",
            [
                ("double_glazing", "Isıcam"),
                ("triple_glazing", "Üçlü cam"),
                ("laminated", "Lamine cam"),
                ("tempered", "Temperli cam"),
                ("panel", "Panel"),
            ],
            30,
            required=False,
        ),
        _select(
            "threshold",
            "Eşik türü",
            [
                ("standard", "Standart eşik"),
                ("low", "Alçak eşik"),
                ("frameless", "Eşiksiz"),
            ],
            40,
        ),
    ],
    "flyscreen": [
        _select(
            "screen_type",
            "Sineklik modeli",
            [
                ("fixed", "Sabit sineklik"),
                ("hinged", "Menteşeli sineklik"),
                ("sliding", "Sürme sineklik"),
                ("roller", "Stor sineklik"),
                ("pleated", "Plise sineklik"),
            ],
            10,
        ),
        _select(
            "mesh_type",
            "Tül türü",
            [
                ("standard", "Standart tül"),
                ("pet_resistant", "Evcil hayvan dayanımlı"),
                ("pollen", "Polen filtreli"),
                ("stainless", "Paslanmaz tel"),
            ],
            20,
        ),
    ],
    "guillotine_glass": [
        _select(
            "system_type",
            "Hareket sistemi",
            [
                ("manual", "Elle hareket eden sistem"),
                ("motorized", "Motorlu sistem"),
            ],
            10,
        ),
        _select(
            "panel_count",
            "Panel sayısı",
            [("2", "2 panel"), ("3", "3 panel"), ("4", "4 panel")],
            20,
        ),
        _select(
            "glass_type",
            "Cam türü",
            [("tempered", "Temperli cam"), ("laminated", "Lamine cam")],
            30,
        ),
        _boolean("bottom_fixed", "Alt bölüm sabit", 40),
    ],
    "facade_cladding": [
        _select(
            "cladding_type",
            "Kaplama türü",
            [
                ("composite_panel", "Kompozit panel"),
                ("compact_laminate", "Kompakt laminat"),
                ("metal_panel", "Metal panel"),
                ("fiber_cement", "Fiber çimento"),
                ("other", "Diğer / uzman görüşü"),
            ],
            10,
        ),
        _select(
            "panel_orientation",
            "Panel yönü",
            [
                ("horizontal", "Yatay"),
                ("vertical", "Dikey"),
                ("mixed", "Karma"),
            ],
            20,
        ),
        _select(
            "installation_system",
            "Montaj sistemi",
            [
                ("visible_fixing", "Görünür bağlantı"),
                ("concealed_fixing", "Gizli bağlantı"),
                ("cassette", "Kaset sistem"),
            ],
            30,
        ),
        _boolean("insulation_required", "Yalıtım gerekli", 40),
        _select(
            "substructure_material",
            "Alt konstrüksiyon",
            [
                ("aluminium", "Alüminyum"),
                ("galvanized_steel", "Galvaniz çelik"),
                ("unspecified", "Uzman belirlesin"),
            ],
            50,
        ),
    ],
    "balcony_enclosure": [
        _select(
            "system_type",
            "Kapama sistemi",
            [
                ("sliding", "Sürme cam"),
                ("folding", "Katlanır cam"),
                ("guillotine", "Giyotin cam"),
                ("pvc_joinery", "PVC doğrama"),
            ],
            10,
        ),
        _select(
            "enclosure_shape",
            "Balkon şekli",
            [
                ("straight", "Düz cephe"),
                ("l_shape", "L şeklinde"),
                ("u_shape", "U şeklinde"),
                ("custom", "Özel / çok cepheli"),
            ],
            20,
        ),
        _boolean("roof_required", "Çatı gerekli", 30),
        _select(
            "parapet_type",
            "Parapet türü",
            [
                ("none", "Parapet yok"),
                ("masonry", "Duvar parapet"),
                ("glass", "Cam parapet"),
            ],
            40,
        ),
    ],
    "volkswagen_sliding_door": [
        _select(
            "system_model",
            "Volkswagen sürme modeli",
            [
                ("vw_two_left", "2 bölüm · sol kanat sürme"),
                ("vw_two_right", "2 bölüm · sağ kanat sürme"),
                ("vw_three_left", "3 bölüm · sol iki kanat sürme"),
                ("vw_three_right", "3 bölüm · sağ iki kanat sürme"),
                ("vw_four_center", "4 bölüm · orta kanatlar sürme"),
            ],
            10,
            help_text="Oklar hareketli kanatların yönünü temsil eder.",
        ),
        _select(
            "glazing",
            "Cam türü",
            [("double_glazing", "Isıcam"), ("laminated", "Lamine cam"), ("tempered", "Temperli cam")],
            20,
        ),
        _select(
            "threshold",
            "Eşik türü",
            [("standard", "Standart eşik"), ("low", "Alçak eşik")],
            30,
        ),
    ],
    "hebeschiebe_system": [
        _select(
            "system_model",
            "Hebeschiebe modeli",
            [
                ("hs_two", "2 kanat karşılıklı sürme"),
                ("hs_one_track", "1 ray · hareketli kanat + sabit"),
                ("hs_fixed_left", "Sol sabit · sağ sürme"),
                ("hs_fixed_right", "Sol sürme · sağ sabit"),
                ("hs_three", "3 bölüm · iki hareketli + sabit"),
                ("hs_three_sides", "3 bölüm · sabit orta + iki hareketli"),
                ("hs_four_center", "4 bölüm · orta kanatlar hareketli"),
                ("hs_four_all", "4 bölüm · tüm kanatlar hareketli"),
                ("hs_six", "6 bölüm · sabit yanlar + dört hareketli"),
                ("hs_corner", "90° köşe kaldır-sür"),
            ],
            10,
            help_text="Kaldır-sür kanat düzenini görselden seçin.",
        ),
        _select(
            "glass_type",
            "Cam türü",
            [("double_glazing", "Isıcam"), ("triple_glazing", "Üçlü cam"), ("laminated", "Lamine cam")],
            20,
        ),
        _select(
            "threshold",
            "Eşik türü",
            [("standard", "Standart eşik"), ("low", "Alçak eşik"), ("flush", "Sıfır eşik talebi")],
            30,
        ),
    ],
    "pivot_system": [
        _select(
            "system_model",
            "Pivot modeli",
            [
                ("pivot_single", "Tek pivot kanat"),
                ("pivot_double", "Çift pivot kanat"),
                ("pivot_fixed_left", "Sol sabit · pivot kanat"),
                ("pivot_fixed_right", "Pivot kanat · sağ sabit"),
                ("pivot_fanlight", "Pivot kanat + üst ışıklık"),
                ("pivot_fixed_fanlight", "Sabit yan + pivot + üst ışıklık"),
                ("pivot_glass", "Şeffaf cam pivot kanat"),
            ],
            10,
            help_text="Pivot ekseni ve sabit bölümü görsel düzenden seçin.",
        ),
        _select(
            "infill_type",
            "Dolgu türü",
            [("glass", "Cam"), ("panel", "Panel"), ("mixed", "Cam + panel")],
            20,
        ),
        _select(
            "pivot_opening_direction",
            "Açılım yönü",
            [("side", "Yana açılır"), ("up", "Yukarı açılır")],
            25,
            help_text="Pivot kanadın yana veya yukarı doğru açılmasını seçin.",
        ),
        _select(
            "pivot_vertical_mullion_count",
            "Dikey cam çıtası sayısı",
            [("0", "Çıta yok"), ("1", "1 dikey çıta"), ("2", "2 dikey çıta"), ("3", "3 dikey çıta")],
            26,
            help_text="Dekoratif çıtalar cam yüzeyine eşit aralıklarla yerleştirilir.",
            required=False,
        ),
        _select(
            "pivot_horizontal_mullion_count",
            "Yatay cam çıtası sayısı",
            [("0", "Çıta yok"), ("1", "1 yatay çıta"), ("2", "2 yatay çıta"), ("3", "3 yatay çıta")],
            27,
            help_text="Dekoratif çıtalar cam yüzeyine eşit aralıklarla yerleştirilir.",
            required=False,
        ),
        _select(
            "lock_type",
            "Kilit tercihi",
            [("standard", "Standart kilit"), ("multipoint", "Çok noktalı kilit"), ("advisor", "Uzman belirlesin")],
            30,
        ),
    ],
    "folding_system": [
        _select(
            "system_model",
            "Katlanır sistem modeli",
            [
                ("fold_three", "3 yaprak katlanır"),
                ("fold_four", "4 yaprak katlanır"),
                ("fold_five", "5 yaprak katlanır"),
                ("fold_six", "6 yaprak katlanır"),
                ("fold_seven", "7 yaprak katlanır"),
                ("fold_eight", "8 yaprak katlanır"),
                ("fold_nine", "9 yaprak katlanır"),
                ("fold_fixed_sides", "Sabit yanlar · orta katlanır"),
            ],
            10,
            help_text="Yaprak sayısı ölçü ve profil limitlerine göre kontrol edilir.",
        ),
        _select(
            "glass_type",
            "Cam türü",
            [("tempered", "Temperli cam"), ("laminated", "Lamine cam"), ("double_glazing", "Isıcam")],
            20,
        ),
        _select(
            "stack_direction",
            "Toplanma yönü",
            [("left", "Sola toplanır"), ("right", "Sağa toplanır"), ("both", "İki yana toplanır")],
            30,
        ),
        _select(
            "opening_side",
            "Açılım tarafı",
            [("inward", "İçe açılır"), ("outward", "Dışa açılır")],
            40,
        ),
    ],
}


JOINERY_TECHNICAL_FIELDS = [
    _select(
        "hinge_type",
        "Menteşe türü",
        [
            ("standard", "Standart menteşe"),
            ("concealed", "Gizli menteşe"),
            ("heavy_duty", "Ağır hizmet menteşesi"),
            ("advisor", "Uzman belirlesin"),
        ],
        50,
        required=False,
    ),
    _select(
        "lock_type",
        "Kilit türü",
        [
            ("standard", "Standart kilit"),
            ("multipoint", "Çok noktalı kilit"),
            ("security", "Güvenlik kilidi"),
            ("advisor", "Uzman belirlesin"),
        ],
        51,
        required=False,
    ),
    _number(
        "frame_profile_width_mm",
        "Çerçeve görünür genişliği",
        52,
        unit="mm",
        min_value=30,
        max_value=200,
        help_text="Boş bırakırsanız seçilen profil serisinin değeri kullanılır.",
    ),
    _number(
        "mullion_profile_width_mm",
        "Orta kayıt görünür genişliği",
        53,
        unit="mm",
        min_value=15,
        max_value=200,
        help_text="Dikey ve yatay orta kayıtların görünen yüz genişliği.",
    ),
    _number(
        "glazing_bar_width_mm",
        "Cam çıtası genişliği",
        54,
        unit="mm",
        min_value=8,
        max_value=80,
        help_text="Cam üzerindeki dekoratif çıtaların genişliği.",
    ),
    _number(
        "lock_height_mm",
        "Kilit kolu yüksekliği",
        55,
        unit="mm",
        min_value=250,
        max_value=2500,
        help_text="Bitmiş zeminden kilit veya kol merkezine kadar ölçün.",
    ),
]


SPECIAL_TECHNICAL_FIELDS = [
    _number(
        "frame_profile_width_mm",
        "Çerçeve görünür genişliği",
        60,
        unit="mm",
        min_value=20,
        max_value=250,
        help_text="Dış çerçevenin görünen profil genişliği.",
    ),
    _number(
        "mullion_profile_width_mm",
        "Kayıt/kanat profil genişliği",
        61,
        unit="mm",
        min_value=10,
        max_value=200,
        help_text="Kanatlar arasındaki kayıt veya birleşim profilinin görünen genişliği.",
    ),
    _number(
        "glazing_bar_width_mm",
        "Cam çıtası genişliği",
        62,
        unit="mm",
        min_value=8,
        max_value=80,
        help_text="Cam yüzeyindeki dekoratif kayıtların genişliği.",
    ),
]


PIVOT_TECHNICAL_FIELDS = [
    _select(
        "hinge_type",
        "Pivot mekanizması",
        [
            ("top_bottom_pivot", "Alt ve üst pivot"),
            ("floor_spring", "Zemin yayı"),
            ("heavy_duty", "Ağır hizmet pivotu"),
            ("advisor", "Uzman belirlesin"),
        ],
        40,
        required=False,
    ),
    _number(
        "pivot_axis_offset_mm",
        "Pivot ekseni mesafesi",
        41,
        unit="mm",
        min_value=50,
        max_value=5000,
        help_text="Yana açılımda kanadın sol kenarından, yukarı açılımda üst kenarından eksene kadar ölçün.",
    ),
    _number(
        "lock_height_mm",
        "Kilit kolu yüksekliği",
        42,
        unit="mm",
        min_value=250,
        max_value=2500,
        help_text="Bitmiş zeminden kilit veya kol merkezine kadar ölçün.",
    ),
]


for _joinery_product_key in ("pvc_window", "pvc_door"):
    PRODUCT_FIELDS[_joinery_product_key] = [
        *PRODUCT_FIELDS[_joinery_product_key],
        *JOINERY_TECHNICAL_FIELDS,
    ]

for _technical_product_key in (
    "volkswagen_sliding_door",
    "hebeschiebe_system",
    "pivot_system",
    "folding_system",
):
    PRODUCT_FIELDS[_technical_product_key] = [
        *PRODUCT_FIELDS[_technical_product_key],
        *(PIVOT_TECHNICAL_FIELDS if _technical_product_key == "pivot_system" else []),
        *SPECIAL_TECHNICAL_FIELDS,
    ]


PRODUCTS: list[dict[str, Any]] = [
    {
        "key": "pvc_window",
        "material_group": "pvc",
        "name": "PVC pencere",
        "description": "Sabit, tek kanat, çift kanat veya vasistaslı pencere",
        "mark": "P",
        "sort_order": 10,
        "measurement_variant": "opening",
        "width_instruction": "Duvar boşluğunun sol iç kenarından sağ iç kenarına ölçün.",
        "height_instruction": "Alt mermerden veya boşluk tabanından üst iç kenara ölçün.",
        "short_width_label": "İçten içe genişlik",
        "short_height_label": "İçten içe yükseklik",
    },
    {
        "key": "pvc_door",
        "material_group": "pvc",
        "name": "PVC kapı",
        "description": "Tek, çift, balkon veya sürme PVC kapı",
        "mark": "K",
        "sort_order": 20,
        "measurement_variant": "opening",
        "width_instruction": "Kapı boşluğunun sol iç kenarından sağ iç kenarına ölçün.",
        "height_instruction": "Bitmiş zeminden boşluğun üst iç kenarına ölçün.",
        "short_width_label": "Kapı boşluğu",
        "short_height_label": "Zeminden üste",
    },
    {
        "key": "volkswagen_sliding_door",
        "material_group": "pvc",
        "name": "Volkswagen sürme PVC kapı",
        "description": "Kanadı içeri alıp yana kayan özel PVC sürme kapı sistemi",
        "mark": "VW",
        "sort_order": 25,
        "measurement_variant": "opening",
        "width_instruction": "Sistemin uygulanacağı açıklığın içten içe toplam genişliğini ölçün.",
        "height_instruction": "Bitmiş zeminden açıklığın üst iç kenarına ölçün.",
        "short_width_label": "Toplam açıklık",
        "short_height_label": "Zeminden üste",
    },
    {
        "key": "flyscreen",
        "material_group": "pvc",
        "name": "Sineklik",
        "description": "Sabit, menteşeli, sürme, stor veya plise sineklik",
        "mark": "S",
        "sort_order": 30,
        "measurement_variant": "opening",
        "width_instruction": "Sinekliğin takılacağı net açıklığın iki yan kenarı arasını ölçün.",
        "height_instruction": "Aynı açıklığın alt kenarından üst kenarına ölçün.",
        "short_width_label": "Net açıklık",
        "short_height_label": "Net açıklık",
    },
    {
        "key": "guillotine_glass",
        "material_group": "aluminium",
        "name": "Giyotin cam",
        "description": "Elle veya motorla hareket eden dikey cam sistemi",
        "mark": "G",
        "sort_order": 40,
        "measurement_variant": "opening",
        "width_instruction": "Cam sisteminin kapanacağı açıklığın solundan sağına ölçün.",
        "height_instruction": "Alt bitiş noktasından üst kiriş veya tavana ölçün.",
        "short_width_label": "Kapanacak açıklık",
        "short_height_label": "Alt noktadan üste",
    },
    {
        "key": "hebeschiebe_system",
        "material_group": "aluminium",
        "name": "Hebeschiebe kaldır-sür",
        "description": "Geniş açıklıklar için ağır kanatlı kaldır-sür sistemi",
        "mark": "HS",
        "sort_order": 42,
        "measurement_variant": "opening",
        "width_instruction": "Kaldır-sür sisteminin uygulanacağı toplam net açıklığı ölçün.",
        "height_instruction": "Bitmiş zeminden üst kirişin altına ölçün.",
        "short_width_label": "Toplam açıklık",
        "short_height_label": "Net yükseklik",
    },
    {
        "key": "pivot_system",
        "material_group": "aluminium",
        "name": "Pivot sistem",
        "description": "Merkez veya özel eksenden dönen alüminyum kapı sistemi",
        "mark": "PV",
        "sort_order": 44,
        "measurement_variant": "opening",
        "width_instruction": "Pivot sisteminin uygulanacağı net açıklığı soldan sağa ölçün.",
        "height_instruction": "Bitmiş zeminden üst açıklığa kadar ölçün.",
        "short_width_label": "Net açıklık",
        "short_height_label": "Net yükseklik",
    },
    {
        "key": "folding_system",
        "material_group": "aluminium",
        "name": "Katlanır akordiyon sistem",
        "description": "Kanatların bir veya iki yana katlanarak toplandığı sistem",
        "mark": "KF",
        "sort_order": 46,
        "measurement_variant": "opening",
        "width_instruction": "Katlanır sistemin kapatacağı toplam açıklığı ölçün.",
        "height_instruction": "Alt bitiş noktasından üst taşıyıcıya ölçün.",
        "short_width_label": "Toplam açıklık",
        "short_height_label": "Net yükseklik",
    },
    {
        "key": "facade_cladding",
        "material_group": "aluminium",
        "name": "Dış cephe",
        "description": "Panel türü ve uygulama yüzeyiyle dış cephe ön çalışması",
        "mark": "C",
        "sort_order": 50,
        "measurement_variant": "facade",
        "width_instruction": "Kaplanacak ana yüzeyin soldan sağa toplamını ölçün.",
        "height_instruction": "Zemin başlangıcından kaplamanın biteceği üst noktaya ölçün.",
        "short_width_label": "Ana yüzey",
        "short_height_label": "Kaplama yüksekliği",
    },
    {
        "key": "balcony_enclosure",
        "material_group": "aluminium",
        "name": "Balkon kapama",
        "description": "Sürme, katlanır, giyotin cam veya PVC balkon çözümü",
        "mark": "B",
        "sort_order": 60,
        "measurement_variant": "balcony",
        "width_instruction": "Balkonun ana açık cephesini soldan sağa ölçün.",
        "height_instruction": "Parapet veya zeminden tavanın altına kadar ölçün.",
        "short_width_label": "Ana balkon cephesi",
        "short_height_label": "Net açıklık",
    },
]


def _seed_fields_for_product(product_key: str) -> list[dict[str, Any]]:
    return [
        *PRODUCT_FIELDS[product_key],
        _select("color", "Renk", COLORS, 80),
        _select(
            "profile_series",
            "Tercih edilen seri",
            [],
            90,
            help_text=(
                "Bir seri seçin veya kararı uzman ekibimize bırakın. "
                "Seri özellikleri seçimden sonra gösterilir."
            ),
            required=False,
        ),
        *GUIDED_FIELDS[product_key],
        _text(
            "notes",
            "Ürün notu",
            130,
            help_text="Uzmanın bilmesini istediğiniz kısa not.",
        ),
    ]


def seed_catalog(engine: Engine) -> None:
    """Insert missing seed rows without changing or reactivating admin edits."""

    with Session(engine) as session:
        for product_data in PRODUCTS:
            product_key = product_data["key"]
            material_group = product_data["material_group"]
            product = session.get(CatalogProduct, product_key)
            if product is None:
                product = CatalogProduct(
                    active=True,
                    **{key: value for key, value in product_data.items() if key != "material_group"},
                )
                session.add(product)
                session.flush()
            if session.get(CatalogProductMaterial, product_key) is None:
                session.add(
                    CatalogProductMaterial(
                        product_key=product_key,
                        material_group=material_group,
                    )
                )

            existing_fields = session.exec(
                select(CatalogField).where(CatalogField.product_key == product_key)
            ).all()
            fields_by_key = {field.key: field for field in existing_fields}

            for field_data in _seed_fields_for_product(product_key):
                options = field_data["options"]
                model_data = {
                    key: value
                    for key, value in field_data.items()
                    if key != "options"
                }
                field = fields_by_key.get(field_data["key"])
                if field is None:
                    field = CatalogField(product_key=product_key, **model_data)
                    session.add(field)
                    session.flush()
                    fields_by_key[field.key] = field

                existing_options = session.exec(
                    select(CatalogOption).where(CatalogOption.field_id == field.id)
                ).all()
                option_values = {option.value for option in existing_options}
                for sort_order, (value, label) in enumerate(options, start=1):
                    if value in option_values:
                        continue
                    session.add(
                        CatalogOption(
                            field_id=field.id,
                            value=value,
                            label=label,
                            active=True,
                            sort_order=sort_order * 10,
                        )
                    )

                if product_key == "balcony_enclosure" and field.key == "system_type":
                    session.flush()
                    system_options = session.exec(
                        select(CatalogOption).where(CatalogOption.field_id == field.id)
                    ).all()
                    for option in system_options:
                        default_spec = BALCONY_SYSTEM_PROFILE_SPECS.get(option.value)
                        if (
                            default_spec is not None
                            and option.id is not None
                            and session.get(CatalogOptionProfileSpec, option.id) is None
                        ):
                            session.add(
                                CatalogOptionProfileSpec(
                                    option_id=option.id,
                                    **default_spec,
                                )
                            )

            # Eski kurulumlarda bu dört ürünün kısa sorularına sabit
            # yardım metinleri yazılmıştı. Yalnız birebir eski varsayılanı
            # taşıyan kayıtlar temizlenir; panelden girilmiş özel metinlere
            # dokunulmaz.
            if product_key in {
                "volkswagen_sliding_door",
                "hebeschiebe_system",
                "pivot_system",
                "folding_system",
            }:
                for field_key, legacy_text in LEGACY_SPECIAL_SYSTEM_HELP_TEXTS.items():
                    field = fields_by_key.get(field_key)
                    if field is not None and field.help_text == legacy_text:
                        field.help_text = ""

        session.commit()


def required_select_fields_without_options(
    session: Session,
    product_key: str,
) -> list[CatalogField]:
    """Return active required selects that cannot currently be answered."""

    fields = session.exec(
        select(CatalogField).where(
            CatalogField.product_key == product_key,
            CatalogField.active == True,  # noqa: E712
            CatalogField.required == True,  # noqa: E712
            CatalogField.field_type == "select",
        )
    ).all()
    field_ids = [field.id for field in fields if field.id is not None]
    if not field_ids:
        return []
    options = session.exec(
        select(CatalogOption).where(
            CatalogOption.field_id.in_(field_ids),
            CatalogOption.active == True,  # noqa: E712
        )
    ).all()
    answerable_field_ids = {option.field_id for option in options}
    return [field for field in fields if field.id not in answerable_field_ids]


def validate_catalog_submission(
    session: Session,
    item: ProductItemCreate,
) -> ProfileSpec | None:
    """Validate a new submission and resolve trusted balcony profile geometry."""

    from fastapi import HTTPException

    product_key = (
        item.product_type
        if isinstance(item, CustomProductItemCreate)
        else item.product_type.value
    )
    product = session.get(CatalogProduct, product_key)
    if product is None or not product.active:
        raise HTTPException(
            status_code=422,
            detail="The selected product is not currently available.",
        )
    if required_select_fields_without_options(session, product_key):
        raise HTTPException(
            status_code=422,
            detail="The selected product is temporarily unavailable.",
        )

    fields = session.exec(
        select(CatalogField).where(
            CatalogField.product_key == product_key,
            CatalogField.active == True,  # noqa: E712
        )
    ).all()
    fields_by_key = {field.key: field for field in fields}
    item_data = item.model_dump(mode="json")
    answers = item_data.pop("catalog_answers", {})

    unknown_keys = sorted(set(answers) - set(fields_by_key))
    if unknown_keys:
        raise HTTPException(
            status_code=422,
            detail="One or more catalog answers are unavailable.",
        )

    field_ids = [field.id for field in fields if field.field_type == "select"]
    options = (
        session.exec(
            select(CatalogOption).where(
                CatalogOption.field_id.in_(field_ids),
                CatalogOption.active == True,  # noqa: E712
            )
        ).all()
        if field_ids
        else []
    )
    option_values: dict[int, set[str]] = {}
    option_labels: dict[int, set[str]] = {}
    for option in options:
        option_values.setdefault(option.field_id, set()).add(option.value)
        option_labels.setdefault(option.field_id, set()).add(option.label)

    missing = object()
    for field in fields:
        core_value = item_data.get(field.key, missing)
        answer_value = answers.get(field.key, missing)
        core_present = (
            core_value is not missing and core_value is not None and core_value != ""
        )
        answer_present = (
            answer_value is not missing
            and answer_value is not None
            and answer_value != ""
        )
        if core_present and answer_present:
            if str(core_value) != str(answer_value):
                raise HTTPException(
                    status_code=422,
                    detail="A catalog answer conflicts with the product configuration.",
                )
            value = core_value
        elif answer_present:
            value = answer_value
        else:
            value = core_value

        is_missing = value is missing or value is None or value == ""
        if is_missing:
            if field.required:
                raise HTTPException(
                    status_code=422,
                    detail="A required catalog answer is missing.",
                )
            continue

        if field.field_type == "select":
            if isinstance(value, (dict, list, bool)):
                raise HTTPException(
                    status_code=422,
                    detail="A catalog selection has an invalid type.",
                )
            allowed_values = (
                option_labels.get(field.id, set())
                if field.key == "profile_series"
                else option_values.get(field.id, set())
            )
            if str(value) not in allowed_values:
                raise HTTPException(
                    status_code=422,
                    detail="A selected catalog option is not currently available.",
                )
        elif field.field_type == "boolean":
            if not isinstance(value, bool):
                raise HTTPException(
                    status_code=422,
                    detail="A catalog boolean answer has an invalid type.",
                )
        elif field.field_type == "text":
            if not isinstance(value, str):
                raise HTTPException(
                    status_code=422,
                    detail="A catalog text answer has an invalid type.",
                )
        elif field.field_type == "number":
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise HTTPException(
                    status_code=422,
                    detail="A catalog number answer has an invalid type.",
                )
            numeric_value = float(value)
            if not isfinite(numeric_value):
                raise HTTPException(
                    status_code=422,
                    detail="A catalog number answer must be finite.",
                )
            if field.min_value is not None and numeric_value < field.min_value:
                raise HTTPException(
                    status_code=422,
                    detail="A catalog number answer is below the configured minimum.",
                )
            if field.max_value is not None and numeric_value > field.max_value:
                raise HTTPException(
                    status_code=422,
                    detail="A catalog number answer exceeds the configured maximum.",
                )
            if field.step is not None:
                step_base = field.min_value if field.min_value is not None else 0
                step_count = (numeric_value - step_base) / field.step
                if not isclose(step_count, round(step_count), abs_tol=1e-7):
                    raise HTTPException(
                        status_code=422,
                        detail="A catalog number answer does not match the configured step.",
                    )

    def active_option(
        field_key: str,
        selected: str,
        *,
        by_label: bool = False,
    ) -> CatalogOption | None:
        field = fields_by_key.get(field_key)
        if field is None or field.field_type != "select":
            return None
        candidates = sorted(
            (
                option
                for option in options
                if option.field_id == field.id
                and (option.label if by_label else option.value) == selected
            ),
            key=lambda option: option.id or 0,
        )
        return candidates[0] if candidates else None

    profile_spec_model: CatalogOptionProfileSpec | None = None
    if item.profile_series:
        series_option = active_option(
            "profile_series",
            item.profile_series,
            by_label=True,
        )
        if series_option is not None and series_option.id is not None:
            profile_spec_model = session.get(
                CatalogOptionProfileSpec,
                series_option.id,
            )

    if profile_spec_model is not None:
        return ProfileSpec.model_validate(profile_spec_model, from_attributes=True)

    if not isinstance(item, BalconyEnclosureItemCreate):
        return None

    system_option = active_option("system_type", item.system_type)
    if system_option is not None and system_option.id is not None:
        profile_spec_model = session.get(
            CatalogOptionProfileSpec,
            system_option.id,
        )

    if profile_spec_model is None:
        raise HTTPException(
            status_code=422,
            detail="The selected balcony profile dimensions are not configured.",
        )

    return ProfileSpec.model_validate(profile_spec_model, from_attributes=True)
