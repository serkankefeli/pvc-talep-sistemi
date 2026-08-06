import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CatalogMeasurement } from '../core/catalog.models';
import { BalconyEnclosureItem, productTypeLabel, PublicRequestItem } from '../core/request.models';
import { calculateBalconyElevationGeometry } from './balcony-elevation-geometry';
import {
  calculateJoineryGeometry,
  isJoineryItem,
  isMixedJoineryLayout,
  joineryPanelDescription,
  joinerySurfaceKind,
} from './joinery-geometry';
import { frameColor } from './preview-geometry';
import { calculateInstallationSceneGeometry } from './installation-scene-geometry';

@Component({
  selector: 'app-installation-scene',
  templateUrl: './installation-scene.component.html',
  styleUrl: './installation-scene.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstallationSceneComponent {
  readonly item = input.required<PublicRequestItem>();
  readonly productName = input<string>();
  readonly measurementVariant = input<CatalogMeasurement['variant']>('opening');
  readonly measurementReady = input(false);
  readonly balconySegmentIndex = input(0);

  readonly productLabel = computed(() => {
    const item = this.item();
    if (isJoineryItem(item) && isMixedJoineryLayout(item.layout)) {
      return 'PVC kapı + pencere';
    }
    return this.productName()?.trim() || productTypeLabel(item.product_type);
  });
  readonly usagePrimary = computed(() => {
    const value = this.item().catalog_answers['usage_primary'];
    return typeof value === 'string' ? value : '';
  });
  readonly geometry = computed(() =>
    calculateInstallationSceneGeometry({
      productType: this.item().product_type,
      measurementVariant: this.measurementVariant(),
      usagePrimary: this.usagePrimary(),
      widthMm: this.item().width_mm,
      heightMm: this.item().height_mm,
      measurementReady: this.measurementReady(),
    }),
  );
  readonly frameFill = computed(() => frameColor(this.item().color));
  readonly joineryGeometry = computed(() => {
    const item = this.item();
    return isJoineryItem(item)
      ? calculateJoineryGeometry(item, { x: 0, y: 0, width: 100, height: 100 })
      : null;
  });
  readonly joinerySummary = computed(
    () =>
      this.joineryGeometry()
        ?.panels.map(({ panel }) => `${panel.label}: ${joineryPanelDescription(panel)}`)
        .join(' · ') ?? '',
  );
  readonly joinerySurface = computed(() => {
    const item = this.item();
    return isJoineryItem(item) ? joinerySurfaceKind(item) : 'glass';
  });
  readonly balconyGeometry = computed(() => {
    const item = this.item();
    if (item.product_type !== 'balcony_enclosure' || !('segments' in item)) {
      return null;
    }
    return calculateBalconyElevationGeometry(
      item as BalconyEnclosureItem,
      this.balconySegmentIndex(),
    );
  });
  readonly balconyWidthSummary = computed(() => {
    const geometry = this.balconyGeometry();
    if (!geometry) {
      return '';
    }
    const glassTerm =
      geometry.orientation === 'vertical'
        ? `${geometry.panelCount} eşit cam × ${formatMillimeters(geometry.glassWidthMm)} mm`
        : `${formatMillimeters(geometry.glassWidthMm)} mm net cam genişliği`;
    const mullionTerm =
      geometry.orientation === 'vertical'
        ? `${geometry.mullionCount} ara profil × ${formatMillimeters(geometry.mullionProfileWidthMm)} mm`
        : null;
    return [
      glassTerm,
      mullionTerm,
      `${formatMillimeters(geometry.startProfileWidthMm + geometry.endProfileWidthMm)} mm uç/köşe profil`,
      `${formatMillimeters(geometry.totalMountingGapMm)} mm montaj payı`,
      `${formatMillimeters(geometry.calculatedWidthMm)} mm`,
    ]
      .filter((term): term is string => Boolean(term))
      .join(' + ')
      .replace(/ \+ ([^+]+)$/, ' = $1');
  });
  readonly balconyHeightSummary = computed(() => {
    const geometry = this.balconyGeometry();
    if (!geometry) {
      return '';
    }
    if (geometry.orientation === 'horizontal') {
      return `${geometry.panelCount} eşit cam × ${formatMillimeters(geometry.glassHeightMm)} mm + ${geometry.mullionCount} yatay ara profil × ${formatMillimeters(geometry.mullionProfileWidthMm)} mm + ${formatMillimeters(geometry.topProfileMm + geometry.bottomProfileMm)} mm üst/alt profil + ${formatMillimeters(geometry.totalVerticalMountingGapMm)} mm montaj payı = ${formatMillimeters(geometry.calculatedHeightMm)} mm`;
    }
    return `Net cam yüksekliği ${formatMillimeters(geometry.glassHeightMm)} mm · üst profil ${formatMillimeters(geometry.topProfileMm)} mm · alt profil ${formatMillimeters(geometry.bottomProfileMm)} mm`;
  });
  readonly panelIndexes = computed(() =>
    Array.from({ length: this.panelCount() }, (_, index) => index),
  );
  readonly isMesh = computed(() => this.item().product_type === 'flyscreen');
  readonly isFacade = computed(() => this.geometry().kind === 'facade');
  readonly isHorizontalPanels = computed(
    () =>
      this.item().product_type === 'guillotine_glass' ||
      this.balconyGeometry()?.orientation === 'horizontal',
  );
  readonly emptyLabel = computed(() => {
    switch (this.geometry().kind) {
      case 'door':
        return 'Boş kapı açıklığı';
      case 'balcony':
        return 'Boş balkon açıklığı';
      case 'facade':
        return 'Boş cephe yüzeyi';
      default:
        return 'Boş pencere açıklığı';
    }
  });
  readonly ariaLabel = computed(() => {
    if (!this.geometry().ready) {
      return `${this.productLabel()} için ${this.emptyLabel().toLocaleLowerCase('tr-TR')}. Ölçüler girildiğinde ürün burada gösterilecek.`;
    }
    const balcony = this.balconyGeometry();
    const balconyDetails = balcony
      ? ` ${balcony.segmentLabel}, ${balcony.panelCount} eşit cam, her biri ${formatMillimeters(balcony.glassWidthMm)} milimetre net genişlik.`
      : '';
    const displayedWidthMm = balcony?.segmentWidthMm ?? this.item().width_mm;
    return `${this.productLabel()} yerleşim simülasyonu, ${displayedWidthMm} milimetre genişlik, ${this.item().height_mm} milimetre yükseklik.${balconyDetails}`;
  });

  private panelCount(): number {
    const item = this.item();
    if (item.product_type === 'guillotine_glass' && 'panel_count' in item) {
      return typeof item.panel_count === 'number' ? item.panel_count : 2;
    }
    if (item.product_type === 'pvc_window' && 'layout' in item) {
      return item.layout === 'double_sash' || item.layout === 'custom_grid' ? 2 : 1;
    }
    if (item.product_type === 'pvc_door' && 'layout' in item) {
      return item.layout === 'double' || item.layout === 'sliding' ? 2 : 1;
    }
    if (item.product_type === 'facade_cladding') {
      return 4;
    }
    return 1;
  }
}

function formatMillimeters(value: number): string {
  return new Intl.NumberFormat('tr-TR', {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value);
}
