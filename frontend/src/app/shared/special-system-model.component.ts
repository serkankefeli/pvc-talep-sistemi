import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

type PanelKind = 'fixed' | 'slide-left' | 'slide-right' | 'pivot' | 'fold-left' | 'fold-right';

interface SystemTopology {
  readonly family: 'sliding' | 'pivot' | 'folding';
  readonly panels: readonly PanelKind[];
  readonly fanlight?: boolean;
  readonly tracks?: 1 | 2 | 3;
}

interface SectionLeaf {
  readonly kind: PanelKind;
  readonly lane: number;
  readonly leftPercent: number;
  readonly widthPercent: number;
}

const MODELS: Readonly<Record<string, SystemTopology>> = {
  vw_two_left: { family: 'sliding', tracks: 2, panels: ['slide-left', 'fixed'] },
  vw_two_right: { family: 'sliding', tracks: 2, panels: ['fixed', 'slide-right'] },
  vw_three_left: { family: 'sliding', tracks: 2, panels: ['slide-left', 'slide-left', 'fixed'] },
  vw_three_right: { family: 'sliding', tracks: 2, panels: ['fixed', 'slide-right', 'slide-right'] },
  vw_four_center: {
    family: 'sliding', tracks: 2, panels: ['fixed', 'slide-left', 'slide-right', 'fixed'],
  },
  hs_one_track: { family: 'sliding', tracks: 1, panels: ['slide-right', 'fixed'] },
  hs_two: { family: 'sliding', tracks: 2, panels: ['slide-right', 'slide-left'] },
  hs_fixed_left: { family: 'sliding', tracks: 2, panels: ['fixed', 'slide-left'] },
  hs_fixed_right: { family: 'sliding', tracks: 2, panels: ['slide-right', 'fixed'] },
  hs_three: { family: 'sliding', tracks: 2, panels: ['slide-right', 'slide-right', 'fixed'] },
  hs_three_sides: {
    family: 'sliding', tracks: 2, panels: ['slide-right', 'fixed', 'slide-left'],
  },
  hs_four_center: {
    family: 'sliding', tracks: 2, panels: ['fixed', 'slide-right', 'slide-left', 'fixed'],
  },
  hs_four_all: {
    family: 'sliding', tracks: 2, panels: ['slide-right', 'slide-right', 'slide-left', 'slide-left'],
  },
  hs_six: {
    family: 'sliding', tracks: 3,
    panels: ['fixed', 'slide-right', 'slide-right', 'slide-left', 'slide-left', 'fixed'],
  },
  hs_corner: { family: 'sliding', tracks: 2, panels: ['slide-right', 'slide-left', 'slide-left'] },
  pivot_single: { family: 'pivot', panels: ['pivot'] },
  pivot_double: { family: 'pivot', panels: ['pivot', 'pivot'] },
  pivot_fixed_left: { family: 'pivot', panels: ['fixed', 'pivot'] },
  pivot_fixed_right: { family: 'pivot', panels: ['pivot', 'fixed'] },
  pivot_fanlight: { family: 'pivot', panels: ['pivot'], fanlight: true },
  pivot_fixed_fanlight: { family: 'pivot', panels: ['fixed', 'pivot'], fanlight: true },
  pivot_glass: { family: 'pivot', panels: ['pivot'] },
  fold_three: { family: 'folding', panels: ['fold-left', 'fold-right', 'fold-left'] },
  fold_four: { family: 'folding', panels: ['fold-left', 'fold-right', 'fold-left', 'fold-right'] },
  fold_five: { family: 'folding', panels: ['fold-left', 'fold-right', 'fold-left', 'fold-right', 'fold-left'] },
  fold_six: { family: 'folding', panels: ['fold-left', 'fold-right', 'fold-left', 'fold-right', 'fold-left', 'fold-right'] },
  fold_seven: { family: 'folding', panels: ['fold-left', 'fold-right', 'fold-left', 'fold-right', 'fold-left', 'fold-right', 'fold-left'] },
  fold_eight: { family: 'folding', panels: ['fold-left', 'fold-right', 'fold-left', 'fold-right', 'fold-left', 'fold-right', 'fold-left', 'fold-right'] },
  fold_nine: { family: 'folding', panels: ['fold-left', 'fold-right', 'fold-left', 'fold-right', 'fold-left', 'fold-right', 'fold-left', 'fold-right', 'fold-left'] },
  fold_fixed_sides: {
    family: 'folding', panels: ['fixed', 'fold-left', 'fold-right', 'fold-left', 'fold-right', 'fixed'],
  },
};

export function specialSystemPanelCount(model: string): number {
  return MODELS[model]?.panels.length ?? 0;
}

export function isSpecialSystemModel(model: string): boolean {
  return Object.hasOwn(MODELS, model);
}

@Component({
  selector: 'app-special-system-model',
  template: `
    <div
      class="system-model"
      [class.compact]="compact()"
      [class.lift-slide]="isLiftSlide()"
      [style.--profile-color]="profileColor()"
      [style.--outer-frame-width]="outerFrameStroke() + 'px'"
      [style.--pivot-sash-stroke]="sashStroke()"
      [style.--pivot-glazing-bar-stroke]="glazingBarStroke()"
      [attr.data-family]="topology().family"
      [attr.data-motion]="isLiftSlide() ? 'lift-slide' : topology().family"
      [attr.data-model]="model()"
      [attr.data-panel-count]="topology().panels.length"
      [attr.data-infill]="infillType()"
      [attr.data-pivot-opening]="topology().family === 'pivot' ? pivotOpeningDirection() : null"
      role="img"
      [attr.aria-label]="label() || 'Sistem model şeması'"
    >
      @if (topology().fanlight) {
        <span class="fanlight"><i></i></span>
      }
      <span class="panel-row">
        @for (panel of topology().panels; track $index) {
          <span class="model-panel" [attr.data-kind]="panel">
            <i class="sash-profile" aria-hidden="true"></i>
            @if (panel === 'fixed') {
              <b class="fixed-mark">+</b>
            } @else if (panel === 'pivot') {
              <svg
                class="pivot-drawing"
                data-testid="pivot-drawing"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <rect
                  class="pivot-sash"
                  [attr.x]="sashX()"
                  [attr.y]="sashY()"
                  [attr.width]="sashWidth()"
                  [attr.height]="sashHeight()"
                  rx="1"
                />
                <g class="pivot-glazing-bars">
                  @for (record of verticalMullions(); track record) {
                    <line
                      class="pivot-glazing-bar vertical"
                      [attr.x1]="record"
                      [attr.y1]="glazingTop()"
                      [attr.x2]="record"
                      [attr.y2]="glazingBottom()"
                    />
                  }
                  @for (record of horizontalMullions(); track record) {
                    <line
                      class="pivot-glazing-bar horizontal"
                      [attr.x1]="glazingLeft()"
                      [attr.y1]="record"
                      [attr.x2]="glazingRight()"
                      [attr.y2]="record"
                    />
                  }
                </g>

                @if (pivotOpeningDirection() === 'side') {
                  <g class="pivot-opening-marker side-opening">
                    <line class="pivot-axis" [attr.x1]="axisX()" y1="12" [attr.x2]="axisX()" y2="88" />
                    <circle class="pivot-axis-point" [attr.cx]="axisX()" cy="12" r="1.8" />
                    <circle class="pivot-axis-point" [attr.cx]="axisX()" cy="88" r="1.8" />
                    <path
                      class="pivot-direction-arrow"
                      d="M28 50H72M36 42L28 50L36 58M64 42L72 50L64 58"
                    />
                  </g>
                } @else if (pivotOpeningDirection() === 'up') {
                  <g class="pivot-opening-marker up-opening">
                    <line class="pivot-axis" x1="12" [attr.y1]="axisY()" x2="88" [attr.y2]="axisY()" />
                    <circle class="pivot-axis-point" cx="12" [attr.cy]="axisY()" r="1.8" />
                    <circle class="pivot-axis-point" cx="88" [attr.cy]="axisY()" r="1.8" />
                    <path class="pivot-direction-arrow" d="M50 72V28M42 36L50 28L58 36" />
                  </g>
                } @else {
                  <g class="pivot-neutral-marker">
                    <circle class="pivot-axis-point" cx="50" cy="13" r="1.8" />
                    <circle class="pivot-axis-point" cx="50" cy="87" r="1.8" />
                  </g>
                }
                @if (showHingeHardware()) {
                  <g class="pivot-hardware" [attr.data-hinge-type]="hingeType()">
                    @if (pivotOpeningDirection() === 'up') {
                      <rect class="pivot-hinge" x="14" [attr.y]="axisY() - 1.5" width="7" height="3" rx="1" />
                      <rect class="pivot-hinge" x="79" [attr.y]="axisY() - 1.5" width="7" height="3" rx="1" />
                    } @else {
                      <rect class="pivot-hinge" [attr.x]="axisX() - 1.5" y="14" width="3" height="7" rx="1" />
                      <rect class="pivot-hinge" [attr.x]="axisX() - 1.5" y="79" width="3" height="7" rx="1" />
                    }
                  </g>
                }
                @if (showLockHardware()) {
                  <g class="pivot-hardware" [attr.data-lock-type]="lockType()">
                    <rect class="pivot-lock" x="83" [attr.y]="lockY() - 4" width="2.6" height="8" rx="1" />
                    @if (lockType() === 'multipoint' || lockType() === 'security') {
                      <circle class="pivot-lock-point" cx="84.3" [attr.cy]="lockY() - 13" r="1.2" />
                      <circle class="pivot-lock-point" cx="84.3" [attr.cy]="lockY() + 13" r="1.2" />
                    }
                  </g>
                }
              </svg>
            } @else if (panel === 'slide-left' || panel === 'slide-right') {
              <b class="movement-arrow">{{ panel === 'slide-left' ? '←' : '→' }}</b>
            } @else {
              <i class="fold-leaf"></i>
            }
          </span>
        }
      </span>
      @if (topology().family === 'folding') {
        <span class="fold-path" aria-hidden="true"></span>
      }
      @if (topology().family === 'sliding') {
        <span class="section-view" [attr.data-lanes]="topology().tracks ?? 2" aria-hidden="true">
          @for (leaf of sectionLeaves(); track $index) {
            <i
              class="section-leaf"
              [attr.data-kind]="leaf.kind"
              [attr.data-lane]="leaf.lane"
              [style.--section-left]="leaf.leftPercent + '%'"
              [style.--section-width]="leaf.widthPercent + '%'"
              [style.--section-lane]="leaf.lane"
            ></i>
          }
        </span>
        <span class="movement-guides" aria-hidden="true">
          @for (panel of topology().panels; track $index) {
            <i [attr.data-kind]="panel">
              @if (panel === 'slide-left') { <b>←</b> }
              @if (panel === 'slide-right') { <b>→</b> }
            </i>
          }
        </span>
      }
    </div>
  `,
  styleUrl: './special-system-model.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpecialSystemModelComponent {
  readonly model = input.required<string>();
  readonly label = input('');
  readonly compact = input(false);
  readonly profileColor = input('#f7f7f3');
  readonly stackDirection = input<'left' | 'right' | 'both'>('left');
  readonly pivotOpeningDirection = input<'none' | 'side' | 'up'>('none');
  readonly infillType = input<'glass' | 'panel' | 'mixed'>('glass');
  readonly verticalMullionCount = input(0);
  readonly horizontalMullionCount = input(0);
  readonly widthMm = input(1000);
  readonly heightMm = input(1000);
  readonly frameProfileWidthMm = input(60);
  readonly mullionProfileWidthMm = input(45);
  readonly glazingBarWidthMm = input(20);
  readonly pivotAxisOffsetMm = input<number | null>(null);
  readonly hingeType = input('');
  readonly lockType = input('');
  readonly lockHeightMm = input<number | null>(null);
  readonly panelWidthMm = computed(() =>
    positive(this.widthMm()) / Math.max(this.topology().panels.length, 1),
  );
  readonly frameInsetX = computed(() =>
    clamp((positive(this.frameProfileWidthMm()) / this.panelWidthMm()) * 100, 3, 18),
  );
  readonly frameInsetY = computed(() =>
    clamp((positive(this.frameProfileWidthMm()) / positive(this.heightMm())) * 100, 3, 18),
  );
  readonly sashX = computed(() => this.frameInsetX());
  readonly sashY = computed(() => this.frameInsetY());
  readonly sashWidth = computed(() => Math.max(100 - this.sashX() * 2, 20));
  readonly sashHeight = computed(() => Math.max(100 - this.sashY() * 2, 20));
  readonly glazingLeft = computed(() => this.sashX() + 2);
  readonly glazingRight = computed(() => 100 - this.sashX() - 2);
  readonly glazingTop = computed(() => this.sashY() + 2);
  readonly glazingBottom = computed(() =>
    this.infillType() === 'mixed'
      ? Math.max(54, this.glazingTop() + 4)
      : 100 - this.sashY() - 2,
  );
  readonly verticalMullions = computed(() =>
    recordPositions(this.verticalMullionCount(), this.glazingLeft(), this.glazingRight()),
  );
  readonly horizontalMullions = computed(() =>
    recordPositions(this.horizontalMullionCount(), this.glazingTop(), this.glazingBottom()),
  );
  readonly outerFrameStroke = computed(() =>
    clamp((positive(this.frameProfileWidthMm()) / Math.min(this.panelWidthMm(), positive(this.heightMm()))) * 90, 2, 10),
  );
  readonly sashStroke = computed(() =>
    clamp((positive(this.mullionProfileWidthMm()) / Math.min(this.panelWidthMm(), positive(this.heightMm()))) * 70, 1.4, 7),
  );
  readonly glazingBarStroke = computed(() =>
    clamp((positive(this.glazingBarWidthMm()) / Math.min(this.panelWidthMm(), positive(this.heightMm()))) * 70, 0.8, 5),
  );
  readonly axisX = computed(() => {
    const requested = this.pivotAxisOffsetMm();
    return requested && requested > 0
      ? clamp((requested / this.panelWidthMm()) * 100, this.glazingLeft(), this.glazingRight())
      : 50;
  });
  readonly axisY = computed(() => {
    const requested = this.pivotAxisOffsetMm();
    return requested && requested > 0
      ? clamp((requested / positive(this.heightMm())) * 100, this.glazingTop(), this.glazingBottom())
      : 50;
  });
  readonly lockY = computed(() => {
    const requested = this.lockHeightMm();
    return requested && requested > 0
      ? clamp(100 - (requested / positive(this.heightMm())) * 100, this.glazingTop() + 6, this.glazingBottom() - 6)
      : 52;
  });
  readonly showHingeHardware = computed(() =>
    Boolean(this.hingeType() && this.hingeType() !== 'advisor'),
  );
  readonly showLockHardware = computed(() =>
    Boolean(this.lockType() && this.lockType() !== 'advisor'),
  );
  readonly isLiftSlide = computed(() => this.model().startsWith('hs_'));
  readonly topology = computed<SystemTopology>(() => {
    const selected = MODELS[this.model()];
    if (!selected) {
      return { family: 'sliding', tracks: 2, panels: ['slide-right', 'fixed'] };
    }
    if (selected.family !== 'folding') {
      return selected;
    }
    const direction = this.stackDirection();
    return {
      ...selected,
      panels: selected.panels.map((_panel, index) =>
        direction === 'right'
          ? index % 2 === 0 ? 'fold-right' : 'fold-left'
          : direction === 'both' && index >= selected.panels.length / 2
            ? index % 2 === 0 ? 'fold-right' : 'fold-left'
            : index % 2 === 0 ? 'fold-left' : 'fold-right',
      ),
    };
  });
  readonly sectionLeaves = computed<readonly SectionLeaf[]>(() => {
    const topology = this.topology();
    const laneCount = topology.tracks ?? 1;
    const panelWidth = 100 / topology.panels.length;
    const hasFixedPanel = topology.panels.includes('fixed');
    let movingIndex = 0;
    return topology.panels.map((kind, index) => {
      const lane =
        laneCount === 1
          ? 0
          : kind === 'fixed'
            ? 0
            : hasFixedPanel
              ? 1 + movingIndex++ % (laneCount - 1)
              : movingIndex++ % laneCount;
      return {
        kind,
        lane,
        leftPercent: Math.max(0, index * panelWidth - (index === 0 ? 0 : panelWidth * 0.08)),
        widthPercent: Math.min(panelWidth * 1.16, 100),
      };
    });
  });
}

function recordPositions(rawCount: number, start = 0, end = 100): readonly number[] {
  const count = Math.min(Math.max(Math.trunc(Number(rawCount) || 0), 0), 8);
  const length = end - start;
  return Array.from(
    { length: count },
    (_value, index) => start + ((index + 1) * length) / (count + 1),
  );
}

function positive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
