import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  BalconyEnclosureItem,
  BalconySegment,
  productTypeLabel,
  PublicRequestItem,
} from '../core/request.models';
import { BalconyPlanPreviewComponent } from './balcony-plan-preview.component';
import { calculateBalconyElevationGeometry } from './balcony-elevation-geometry';
import {
  calculateJoineryGeometry,
  isJoineryItem,
  isMixedJoineryLayout,
  joineryPanelDescription,
  joinerySurfaceKind,
} from './joinery-geometry';
import { calculatePreviewGeometry, frameColor } from './preview-geometry';

@Component({
  selector: 'app-product-preview',
  imports: [BalconyPlanPreviewComponent],
  templateUrl: './product-preview.component.html',
  styleUrl: './product-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductPreviewComponent {
  readonly item = input.required<PublicRequestItem>();
  readonly productName = input<string>();
  readonly geometry = computed(() => calculatePreviewGeometry(this.item()));
  readonly balconyElevations = computed(() => {
    const item = this.item();
    if (item.product_type !== 'balcony_enclosure') {
      return [];
    }
    const enclosure = item as BalconyEnclosureItem;
    const count = Math.max(Array.isArray(enclosure.segments) ? enclosure.segments.length : 0, 1);
    return Array.from({ length: count }, (_value, index) =>
      calculateBalconyElevationGeometry(enclosure, index),
    );
  });
  readonly balconyElevation = computed(() => this.balconyElevations()[0] ?? null);
  readonly balconyElevationSummaries = computed(() =>
    this.balconyElevations().map((elevation) => ({
      label: elevation.segmentLabel,
      panelText:
        elevation.orientation === 'horizontal'
          ? `${elevation.panelCount} eşit yatay cam`
          : `${elevation.panelCount} eşit cam`,
      glassText: `Net cam ${formatMillimetres(elevation.glassWidthMm)} × ${formatMillimetres(elevation.glassHeightMm)} mm`,
      profileText: `Baş/son profil ${formatMillimetres(elevation.startProfileWidthMm)} / ${formatMillimetres(elevation.endProfileWidthMm)} mm · ara profil ${formatMillimetres(elevation.mullionProfileWidthMm)} mm`,
    })),
  );
  readonly displayWidthMm = computed(
    () => this.balconyElevation()?.segmentWidthMm ?? this.item().width_mm,
  );
  readonly joineryGeometry = computed(() => {
    const item = this.item();
    return isJoineryItem(item) ? calculateJoineryGeometry(item, this.geometry().inner) : null;
  });
  readonly joineryPanelSummaries = computed(
    () =>
      this.joineryGeometry()?.panels.map(({ panel }) => ({
        slot: panel.slot,
        label: panel.label,
        detail: joineryPanelDescription(panel),
      })) ?? [],
  );
  readonly joinerySurface = computed(() => {
    const item = this.item();
    return isJoineryItem(item) ? joinerySurfaceKind(item) : 'glass';
  });
  readonly productLabel = computed(() => {
    const item = this.item();
    if (isJoineryItem(item) && isMixedJoineryLayout(item.layout)) {
      return 'PVC kapı + pencere';
    }
    return this.productName()?.trim() || productTypeLabel(item.product_type);
  });
  readonly frameFill = computed(() => frameColor(this.item().color));
  readonly glassFill = computed(() =>
    this.item().product_type === 'facade_cladding' ? '#d9dfd8' : '#cfe6e8',
  );
  readonly balconySegments = computed<readonly BalconySegment[]>(() => {
    const item = this.item();
    if (item.product_type !== 'balcony_enclosure') {
      return [];
    }
    const segments = (item as BalconyEnclosureItem).segments;
    return Array.isArray(segments) ? segments : [];
  });
  readonly balconyShape = computed(() => {
    const item = this.item();
    return item.product_type === 'balcony_enclosure'
      ? (item as BalconyEnclosureItem).enclosure_shape
      : 'straight';
  });
  readonly balconyShapeLabel = computed(() => {
    const labels: Readonly<Record<string, string>> = {
      straight: 'Düz cephe',
      l_shape: 'L şeklinde',
      u_shape: 'U şeklinde',
      custom: 'Özel / çok cepheli',
    };
    return labels[this.balconyShape()] ?? 'Özel balkon planı';
  });
  readonly ariaLabel = computed(
    () =>
      `${this.productLabel()}, ${this.displayWidthMm()} milimetre genişlik, ${this.item().height_mm} milimetre yükseklik`,
  );
}

const MILLIMETRE_FORMATTER = new Intl.NumberFormat('tr-TR', {
  maximumFractionDigits: 1,
});

function formatMillimetres(value: number): string {
  return MILLIMETRE_FORMATTER.format(value);
}
