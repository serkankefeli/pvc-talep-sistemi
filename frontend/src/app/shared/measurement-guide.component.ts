import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CatalogMeasurement } from '../core/catalog.models';

@Component({
  selector: 'app-measurement-guide',
  templateUrl: './measurement-guide.component.html',
  styleUrl: './measurement-guide.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MeasurementGuideComponent {
  readonly measurement = input.required<CatalogMeasurement>();
  readonly guide = computed(() => this.measurement());
  readonly ariaLabel = computed(
    () =>
      `Örnek ölçüm: genişlik için ${this.guide().width_instruction} Yükseklik için ${this.guide().height_instruction}`,
  );
}
