import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { BalconySegment } from '../core/request.models';
import { calculateBalconyPlanGeometry } from './balcony-plan-geometry';

@Component({
  selector: 'app-balcony-plan-preview',
  templateUrl: './balcony-plan-preview.component.html',
  styleUrl: './balcony-plan-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BalconyPlanPreviewComponent {
  readonly segments = input<readonly BalconySegment[]>([]);
  readonly shape = input('straight');
  readonly shapeLabel = input('Balkon planı');
  readonly ready = input(false);
  readonly selectable = input(false);
  readonly selectedIndex = input(0);
  readonly segmentSelected = output<number>();

  readonly geometry = computed(() => calculateBalconyPlanGeometry(this.segments(), this.shape()));
  readonly ariaLabel = computed(() => {
    if (!this.ready() || this.geometry().lines.length === 0) {
      return `${this.shapeLabel()} için cephe ölçüleri bekleniyor.`;
    }
    const measures = this.geometry()
      .lines.map((line) => `${line.label} ${line.widthMm} milimetre`)
      .join(', ');
    const baseLabel = `${this.shapeLabel()} üstten planı: ${measures}.`;
    if (!this.selectable()) {
      return baseLabel;
    }

    const selectedLine = this.geometry().lines[this.selectedIndex()];
    const selectedLabel = selectedLine
      ? ` Seçili cephe ${selectedLine.label}, ${selectedLine.widthMm} milimetre.`
      : '';
    return `${baseLabel}${selectedLabel} Panel dağılımını görmek için bir cephe seçebilirsiniz.`;
  });

  lineTransform(angleDegrees: number): string {
    return `translateY(-50%) rotate(${angleDegrees}deg)`;
  }

  segmentAriaLabel(index: number): string {
    const line = this.geometry().lines[index];
    if (!line) {
      return 'Cepheyi seç';
    }
    return `${line.label}, ${line.widthMm} milimetre. Panel dağılımını göster.`;
  }

  selectSegment(index: number): void {
    if (!this.selectable() || !this.ready() || !this.geometry().lines[index]) {
      return;
    }
    this.segmentSelected.emit(index);
  }
}
