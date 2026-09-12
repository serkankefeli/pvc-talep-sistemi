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
import {
  specialSystemPanelCount,
  SpecialSystemModelComponent,
} from './special-system-model.component';

@Component({
  selector: 'app-product-preview',
  imports: [BalconyPlanPreviewComponent, SpecialSystemModelComponent],
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
  readonly joineryPanelSummaries = computed(() => {
    const item = this.item();
    return (
      this.joineryGeometry()?.panels.map(({ panel }) => ({
        slot: panel.slot,
        label: panel.label,
        detail: `${formatMillimetres((item.width_mm * panel.width_percent) / 100)} × ${formatMillimetres((item.height_mm * panel.height_percent) / 100)} mm · ${joineryPanelDescription(panel)}`,
      })) ?? []
    );
  });
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
    const count = specialSystemPanelCount(this.specialModel());
    if (!count) {
      return '';
    }
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
    return `${opening ? `${opening} · ` : ''}${count} bölüm${mullions ? ` · ${mullions}` : ''} · yaklaşık bölüm eni ${formatMillimetres(this.item().width_mm / count)} mm`;
  });
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
