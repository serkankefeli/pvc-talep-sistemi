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
import {
  specialSystemPanelCount,
  SpecialSystemModelComponent,
} from './special-system-model.component';

@Component({
  selector: 'app-installation-scene',
  imports: [SpecialSystemModelComponent],
  templateUrl: './installation-scene.component.html',
  styleUrl: './installation-scene.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstallationSceneComponent {
  readonly item = input.required<PublicRequestItem>();
  readonly productName = input<string>();
  readonly specialModelName = input<string>();
  readonly measurementVariant = input<CatalogMeasurement['variant']>('opening');
  readonly measurementReady = input(false);
  readonly joinerySelectionReady = input(true);
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
  readonly specialModel = computed(() => {
    const value = this.item().catalog_answers['system_model'];
    return typeof value === 'string' ? value : '';
  });
  readonly specialStackDirection = computed<'left' | 'right' | 'both'>(() => {
    const value = this.item().catalog_answers['stack_direction'];
    return value === 'right' || value === 'both' ? value : 'left';
  });
  readonly pivotOpeningDirection = computed<'none' | 'side' | 'up'>(() => {
    const value = this.item().catalog_answers['pivot_opening_direction'];
    return value === 'side' || value === 'up' ? value : 'none';
  });
  readonly pivotInfillType = computed<'glass' | 'panel' | 'mixed'>(() => {
    const value = this.item().catalog_answers['infill_type'];
    return value === 'panel' || value === 'mixed' ? value : 'glass';
  });
  readonly pivotVerticalMullionCount = computed(() =>
    catalogCount(this.item().catalog_answers['pivot_vertical_mullion_count']),
  );
  readonly pivotHorizontalMullionCount = computed(() =>
    catalogCount(this.item().catalog_answers['pivot_horizontal_mullion_count']),
  );
  readonly frameProfileWidthMm = computed(() =>
    catalogNumber(
      this.item().catalog_answers['frame_profile_width_mm'],
      this.item().profile_spec?.edge_profile_mm ?? 60,
    ),
  );
  readonly mullionProfileWidthMm = computed(() =>
    catalogNumber(
      this.item().catalog_answers['mullion_profile_width_mm'],
      this.item().profile_spec?.mullion_profile_mm ?? 45,
    ),
  );
  readonly glazingBarWidthMm = computed(() =>
    catalogNumber(this.item().catalog_answers['glazing_bar_width_mm'], 20),
  );
  readonly pivotAxisOffsetMm = computed(() =>
    optionalCatalogNumber(this.item().catalog_answers['pivot_axis_offset_mm']),
  );
  readonly lockHeightMm = computed(() =>
    optionalCatalogNumber(this.item().catalog_answers['lock_height_mm']),
  );
  readonly hingeType = computed(() => catalogText(this.item().catalog_answers['hinge_type']));
  readonly lockType = computed(() => catalogText(this.item().catalog_answers['lock_type']));
  readonly specialModelSummary = computed(() => {
    const model = this.specialModel();
    const count = specialSystemPanelCount(model);
    if (!model || !count) {
      return '';
    }
    const name = this.specialModelName()?.trim() || 'Seçilen model';
    const sectionWidth = this.item().width_mm > 0 ? formatMillimeters(this.item().width_mm / count) : '';
    const opening =
      this.item().product_type === 'pivot_system'
        ? this.pivotOpeningDirection() === 'up'
          ? 'Yukarı açılır'
          : this.pivotOpeningDirection() === 'side'
            ? 'Yana açılır'
            : ''
        : '';
    const mullions = pivotMullionSummary(
      this.pivotVerticalMullionCount(),
      this.pivotHorizontalMullionCount(),
    );
    return `${name}${opening ? ` · ${opening}` : ''} · ${count} bölüm${mullions ? ` · ${mullions}` : ''}${sectionWidth ? ` · yaklaşık bölüm eni ${sectionWidth} mm` : ''}`;
  });
  readonly specialModelWarning = computed(() => {
    const count = specialSystemPanelCount(this.specialModel());
    if (!count || this.item().product_type !== 'pivot_system') {
      return '';
    }
    const sectionWidth = this.item().width_mm / count;
    return sectionWidth > 1800
      ? `Her pivot bölümü yaklaşık ${formatMillimeters(sectionWidth)} mm. Kesin uygulanabilirlik seçilecek profil serisine göre kontrol edilmelidir.`
      : '';
  });
  readonly joineryGeometry = computed(() => {
    const item = this.item();
    return isJoineryItem(item)
      ? calculateJoineryGeometry(item, { x: 0, y: 0, width: 100, height: 100 })
      : null;
  });
  readonly joinerySummary = computed(() =>
    this.joinerySelectionReady() ? this.joinerySummaryText() : '',
  );
  private readonly joinerySummaryText = computed(
    () => {
      const item = this.item();
      return (
        this.joineryGeometry()
          ?.panels.map(
            ({ panel }) =>
              `${panel.label}: ${formatMillimeters((item.width_mm * panel.width_percent) / 100)} × ${formatMillimeters((item.height_mm * panel.height_percent) / 100)} mm · ${joineryPanelDescription(panel)}`,
          )
          .join(' · ') ?? ''
      );
    },
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
      case 'wide-system':
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

function catalogCount(value: string | boolean | number | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 0), 8) : 0;
}

function optionalCatalogNumber(value: string | boolean | number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function catalogNumber(value: string | boolean | number | undefined, fallback: number): number {
  return optionalCatalogNumber(value) ?? fallback;
}

function catalogText(value: string | boolean | number | undefined): string {
  return typeof value === 'string' ? value : '';
}

function pivotMullionSummary(vertical: number, horizontal: number): string {
  return [vertical ? `${vertical} dikey cam çıtası` : '', horizontal ? `${horizontal} yatay cam çıtası` : '']
    .filter(Boolean)
    .join(' + ');
}
