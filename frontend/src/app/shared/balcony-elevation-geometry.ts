import { BalconyEnclosureItem, BalconyProfileSpec, BalconySegment } from '../core/request.models';

export const DEFAULT_BALCONY_PROFILE_SPEC: BalconyProfileSpec = {
  edge_profile_mm: 45,
  mullion_profile_mm: 35,
  corner_profile_mm: 90,
  top_profile_mm: 45,
  bottom_profile_mm: 55,
  mounting_gap_mm: 5,
  min_glass_width_mm: 300,
  target_glass_width_mm: 800,
  max_glass_width_mm: 1100,
  min_panel_count: 1,
  max_panel_count: 40,
};

export type BalconyElevationOrientation = 'vertical' | 'horizontal';
export type BalconyProfileRole = 'edge' | 'corner';
export type BalconyElevationCellKind =
  | 'mounting-gap'
  | 'edge-profile'
  | 'corner-profile'
  | 'top-profile'
  | 'bottom-profile'
  | 'mullion-profile'
  | 'glass';

export interface BalconyElevationCell {
  readonly id: string;
  readonly kind: BalconyElevationCellKind;
  readonly startMm: number;
  readonly widthMm: number;
  readonly startPercent: number;
  readonly widthPercent: number;
  readonly panelIndex?: number;
}

export interface BalconyElevationGeometry {
  readonly segmentIndex: number;
  readonly segmentLabel: string;
  readonly segmentWidthMm: number;
  readonly heightMm: number;
  readonly orientation: BalconyElevationOrientation;
  readonly primaryAxis: 'x' | 'y';
  readonly startRole: BalconyProfileRole;
  readonly endRole: BalconyProfileRole;
  readonly panelCount: number;
  readonly mullionCount: number;
  readonly glassWidthMm: number;
  readonly glassHeightMm: number;
  readonly startProfileWidthMm: number;
  readonly endProfileWidthMm: number;
  readonly mullionProfileWidthMm: number;
  readonly startMountingGapMm: number;
  readonly endMountingGapMm: number;
  readonly totalMountingGapMm: number;
  readonly totalProfileWidthMm: number;
  readonly totalGlassWidthMm: number;
  readonly totalVerticalMountingGapMm: number;
  readonly totalProfileHeightMm: number;
  readonly totalGlassHeightMm: number;
  readonly calculatedWidthMm: number;
  readonly equationErrorMm: number;
  readonly calculatedHeightMm: number;
  readonly heightEquationErrorMm: number;
  readonly verticalMountingGapMm: number;
  readonly topProfileMm: number;
  readonly bottomProfileMm: number;
  readonly verticalSystemTopPercent: number;
  readonly verticalSystemHeightPercent: number;
  readonly glassTopPercent: number;
  readonly glassHeightPercent: number;
  readonly topProfileTopPercent: number;
  readonly topProfileHeightPercent: number;
  readonly bottomProfileTopPercent: number;
  readonly bottomProfileHeightPercent: number;
  readonly horizontalSystemLeftPercent: number;
  readonly horizontalSystemWidthPercent: number;
  readonly glassLeftPercent: number;
  readonly glassWidthPercent: number;
  readonly cells: readonly BalconyElevationCell[];
  readonly profileSpec: BalconyProfileSpec;
  readonly withinGlassLimits: boolean;
  readonly usedFallback: boolean;
}

interface CandidateLayout {
  readonly panelCount: number;
  readonly glassWidthMm: number;
  readonly withinGlassLimits: boolean;
  readonly limitDistanceMm: number;
}

interface NormalizedProfileSpec {
  readonly spec: BalconyProfileSpec;
  readonly usedFallback: boolean;
}

interface AxisDistribution {
  readonly panelCount: number;
  readonly glassSizeMm: number;
  readonly totalGlassSizeMm: number;
  readonly startGapMm: number;
  readonly endGapMm: number;
  readonly startProfileMm: number;
  readonly endProfileMm: number;
  readonly mullionMm: number;
  readonly totalGapMm: number;
  readonly totalProfileMm: number;
  readonly calculatedSizeMm: number;
  readonly cells: readonly BalconyElevationCell[];
  readonly withinGlassLimits: boolean;
  readonly usedFallback: boolean;
}

const MAX_SAFE_PANEL_COUNT = 64;
const MIN_RENDERABLE_GLASS_MM = 1;

export function calculateBalconyElevationGeometry(
  item: BalconyEnclosureItem,
  requestedSegmentIndex = 0,
): BalconyElevationGeometry {
  const segments = validSegments(item);
  const segmentIndex = clampInteger(requestedSegmentIndex, 0, segments.length - 1);
  const segment = segments[segmentIndex]!;
  const segmentWidthMm = positiveNumber(segment.width_mm, positiveNumber(item.width_mm, 1000));
  const heightMm = positiveNumber(item.height_mm, 1600);
  const normalized = normalizeProfileSpec(item.profile_spec);
  const spec = normalized.spec;
  const roles = resolveProfileRoles(segments, item.enclosure_shape, segmentIndex);
  const horizontalStartProfileMm =
    roles.start === 'corner' ? spec.corner_profile_mm : spec.edge_profile_mm;
  const horizontalEndProfileMm =
    roles.end === 'corner' ? spec.corner_profile_mm : spec.edge_profile_mm;
  const horizontalStartGapMm = roles.start === 'edge' ? spec.mounting_gap_mm : 0;
  const horizontalEndGapMm = roles.end === 'edge' ? spec.mounting_gap_mm : 0;
  const orientation: BalconyElevationOrientation =
    item.system_type === 'guillotine' ? 'horizontal' : 'vertical';

  const xAxis =
    orientation === 'vertical'
      ? calculateAxisDistribution({
          totalSizeMm: segmentWidthMm,
          startGapMm: horizontalStartGapMm,
          endGapMm: horizontalEndGapMm,
          startProfileMm: horizontalStartProfileMm,
          endProfileMm: horizontalEndProfileMm,
          mullionMm: spec.mullion_profile_mm,
          startKind: roles.start === 'corner' ? 'corner-profile' : 'edge-profile',
          endKind: roles.end === 'corner' ? 'corner-profile' : 'edge-profile',
          spec,
        })
      : calculateSingleOpeningAxis(
          segmentWidthMm,
          horizontalStartGapMm,
          horizontalEndGapMm,
          horizontalStartProfileMm,
          horizontalEndProfileMm,
        );
  const yAxis =
    orientation === 'horizontal'
      ? calculateAxisDistribution({
          totalSizeMm: heightMm,
          startGapMm: spec.mounting_gap_mm,
          endGapMm: spec.mounting_gap_mm,
          startProfileMm: spec.top_profile_mm,
          endProfileMm: spec.bottom_profile_mm,
          mullionMm: spec.mullion_profile_mm,
          startKind: 'top-profile',
          endKind: 'bottom-profile',
          spec,
        })
      : calculateSingleOpeningAxis(
          heightMm,
          spec.mounting_gap_mm,
          spec.mounting_gap_mm,
          spec.top_profile_mm,
          spec.bottom_profile_mm,
        );
  const primaryAxis = orientation === 'horizontal' ? yAxis : xAxis;

  return {
    segmentIndex,
    segmentLabel: segment.label,
    segmentWidthMm,
    heightMm,
    orientation,
    primaryAxis: orientation === 'horizontal' ? 'y' : 'x',
    startRole: roles.start,
    endRole: roles.end,
    panelCount: primaryAxis.panelCount,
    mullionCount: Math.max(primaryAxis.panelCount - 1, 0),
    glassWidthMm: xAxis.glassSizeMm,
    glassHeightMm: yAxis.glassSizeMm,
    startProfileWidthMm: xAxis.startProfileMm,
    endProfileWidthMm: xAxis.endProfileMm,
    mullionProfileWidthMm: primaryAxis.mullionMm,
    startMountingGapMm: xAxis.startGapMm,
    endMountingGapMm: xAxis.endGapMm,
    totalMountingGapMm: xAxis.totalGapMm,
    totalProfileWidthMm: xAxis.totalProfileMm,
    totalGlassWidthMm: xAxis.totalGlassSizeMm,
    totalVerticalMountingGapMm: yAxis.totalGapMm,
    totalProfileHeightMm: yAxis.totalProfileMm,
    totalGlassHeightMm: yAxis.totalGlassSizeMm,
    calculatedWidthMm: xAxis.calculatedSizeMm,
    equationErrorMm: segmentWidthMm - xAxis.calculatedSizeMm,
    calculatedHeightMm: yAxis.calculatedSizeMm,
    heightEquationErrorMm: heightMm - yAxis.calculatedSizeMm,
    verticalMountingGapMm: yAxis.startGapMm,
    topProfileMm: yAxis.startProfileMm,
    bottomProfileMm: yAxis.endProfileMm,
    verticalSystemTopPercent: percent(yAxis.startGapMm, heightMm),
    verticalSystemHeightPercent: percent(heightMm - yAxis.startGapMm - yAxis.endGapMm, heightMm),
    glassTopPercent: percent(yAxis.startGapMm + yAxis.startProfileMm, heightMm),
    glassHeightPercent: percent(yAxis.glassSizeMm, heightMm),
    topProfileTopPercent: percent(yAxis.startGapMm, heightMm),
    topProfileHeightPercent: percent(yAxis.startProfileMm, heightMm),
    bottomProfileTopPercent: percent(heightMm - yAxis.endGapMm - yAxis.endProfileMm, heightMm),
    bottomProfileHeightPercent: percent(yAxis.endProfileMm, heightMm),
    horizontalSystemLeftPercent: percent(xAxis.startGapMm, segmentWidthMm),
    horizontalSystemWidthPercent: percent(
      segmentWidthMm - xAxis.startGapMm - xAxis.endGapMm,
      segmentWidthMm,
    ),
    glassLeftPercent: percent(xAxis.startGapMm + xAxis.startProfileMm, segmentWidthMm),
    glassWidthPercent: percent(xAxis.glassSizeMm, segmentWidthMm),
    cells: primaryAxis.cells,
    profileSpec: spec,
    withinGlassLimits: primaryAxis.withinGlassLimits,
    usedFallback:
      normalized.usedFallback ||
      xAxis.usedFallback ||
      yAxis.usedFallback ||
      !primaryAxis.withinGlassLimits,
  };
}

function validSegments(item: BalconyEnclosureItem): readonly BalconySegment[] {
  const segments = Array.isArray(item.segments)
    ? item.segments.filter((segment) => Number.isFinite(segment.width_mm) && segment.width_mm > 0)
    : [];
  if (segments.length > 0) {
    return segments;
  }
  return [
    {
      label: 'A · Ana cephe',
      width_mm: positiveNumber(item.width_mm, 1000),
      turn_degrees: 0,
    },
  ];
}

function resolveProfileRoles(
  segments: readonly BalconySegment[],
  shape: string,
  index: number,
): { readonly start: BalconyProfileRole; readonly end: BalconyProfileRole } {
  if (shape === 'l_shape' && segments.length >= 2) {
    return index === 0 ? { start: 'edge', end: 'corner' } : { start: 'corner', end: 'edge' };
  }
  if (shape === 'u_shape' && segments.length >= 3) {
    return index === 0 ? { start: 'corner', end: 'corner' } : { start: 'corner', end: 'edge' };
  }
  const startsAtCorner = index > 0 && segments[index]?.turn_degrees !== 0;
  const endsAtCorner = index < segments.length - 1 && segments[index + 1]?.turn_degrees !== 0;
  return {
    start: startsAtCorner ? 'corner' : 'edge',
    end: endsAtCorner ? 'corner' : 'edge',
  };
}

function calculateAxisDistribution(values: {
  readonly totalSizeMm: number;
  readonly startGapMm: number;
  readonly endGapMm: number;
  readonly startProfileMm: number;
  readonly endProfileMm: number;
  readonly mullionMm: number;
  readonly startKind: BalconyElevationCellKind;
  readonly endKind: BalconyElevationCellKind;
  readonly spec: BalconyProfileSpec;
}): AxisDistribution {
  const candidates = createCandidates(
    values.totalSizeMm,
    values.startGapMm,
    values.endGapMm,
    values.startProfileMm,
    values.endProfileMm,
    values.spec,
  );
  const selected = selectCandidate(candidates, values.spec.target_glass_width_mm);
  const panelCount = selected?.panelCount ?? values.spec.min_panel_count;
  const configuredNonGlassMm =
    values.startGapMm +
    values.endGapMm +
    values.startProfileMm +
    values.endProfileMm +
    (panelCount - 1) * values.mullionMm;
  const usedDimensionalFallback = !selected;
  const scale = usedDimensionalFallback
    ? Math.max(values.totalSizeMm - panelCount * MIN_RENDERABLE_GLASS_MM, 0) /
      Math.max(configuredNonGlassMm, 1)
    : 1;
  const startGapMm = values.startGapMm * scale;
  const endGapMm = values.endGapMm * scale;
  const startProfileMm = values.startProfileMm * scale;
  const endProfileMm = values.endProfileMm * scale;
  const mullionMm = values.mullionMm * scale;
  const totalGapMm = startGapMm + endGapMm;
  const totalProfileMm = startProfileMm + endProfileMm + Math.max(panelCount - 1, 0) * mullionMm;
  const glassSizeMm = Math.max((values.totalSizeMm - totalGapMm - totalProfileMm) / panelCount, 0);
  const totalGlassSizeMm = panelCount * glassSizeMm;
  const calculatedSizeMm = totalGapMm + totalProfileMm + totalGlassSizeMm;
  return {
    panelCount,
    glassSizeMm,
    totalGlassSizeMm,
    startGapMm,
    endGapMm,
    startProfileMm,
    endProfileMm,
    mullionMm,
    totalGapMm,
    totalProfileMm,
    calculatedSizeMm,
    cells: createAxisCells({
      totalSizeMm: values.totalSizeMm,
      panelCount,
      glassSizeMm,
      startGapMm,
      endGapMm,
      startProfileMm,
      endProfileMm,
      mullionMm,
      startKind: values.startKind,
      endKind: values.endKind,
    }),
    withinGlassLimits: Boolean(selected?.withinGlassLimits),
    usedFallback: usedDimensionalFallback || !selected?.withinGlassLimits,
  };
}

function calculateSingleOpeningAxis(
  totalSizeMm: number,
  configuredStartGapMm: number,
  configuredEndGapMm: number,
  configuredStartProfileMm: number,
  configuredEndProfileMm: number,
): AxisDistribution {
  const configuredNonGlassMm =
    configuredStartGapMm + configuredEndGapMm + configuredStartProfileMm + configuredEndProfileMm;
  const usedFallback = configuredNonGlassMm >= totalSizeMm;
  const scale = usedFallback
    ? Math.max(totalSizeMm - MIN_RENDERABLE_GLASS_MM, 0) / Math.max(configuredNonGlassMm, 1)
    : 1;
  const startGapMm = configuredStartGapMm * scale;
  const endGapMm = configuredEndGapMm * scale;
  const startProfileMm = configuredStartProfileMm * scale;
  const endProfileMm = configuredEndProfileMm * scale;
  const totalGapMm = startGapMm + endGapMm;
  const totalProfileMm = startProfileMm + endProfileMm;
  const glassSizeMm = Math.max(totalSizeMm - totalGapMm - totalProfileMm, 0);
  const calculatedSizeMm = totalGapMm + totalProfileMm + glassSizeMm;
  return {
    panelCount: 1,
    glassSizeMm,
    totalGlassSizeMm: glassSizeMm,
    startGapMm,
    endGapMm,
    startProfileMm,
    endProfileMm,
    mullionMm: 0,
    totalGapMm,
    totalProfileMm,
    calculatedSizeMm,
    cells: [],
    withinGlassLimits: true,
    usedFallback,
  };
}

function createCandidates(
  widthMm: number,
  startGapMm: number,
  endGapMm: number,
  startProfileMm: number,
  endProfileMm: number,
  spec: BalconyProfileSpec,
): readonly CandidateLayout[] {
  const result: CandidateLayout[] = [];
  for (let panelCount = spec.min_panel_count; panelCount <= spec.max_panel_count; panelCount += 1) {
    const nonGlassMm =
      startGapMm +
      endGapMm +
      startProfileMm +
      endProfileMm +
      (panelCount - 1) * spec.mullion_profile_mm;
    const glassWidthMm = (widthMm - nonGlassMm) / panelCount;
    if (!Number.isFinite(glassWidthMm) || glassWidthMm <= 0) {
      continue;
    }
    const belowMinimum = Math.max(spec.min_glass_width_mm - glassWidthMm, 0);
    const aboveMaximum = Math.max(glassWidthMm - spec.max_glass_width_mm, 0);
    result.push({
      panelCount,
      glassWidthMm,
      withinGlassLimits: belowMinimum === 0 && aboveMaximum === 0,
      limitDistanceMm: belowMinimum + aboveMaximum,
    });
  }
  return result;
}

function selectCandidate(
  candidates: readonly CandidateLayout[],
  targetGlassWidthMm: number,
): CandidateLayout | null {
  if (candidates.length === 0) {
    return null;
  }
  const inRange = candidates.filter((candidate) => candidate.withinGlassLimits);
  const pool = inRange.length > 0 ? inRange : candidates;
  return [...pool].sort((left, right) => {
    if (left.limitDistanceMm !== right.limitDistanceMm) {
      return left.limitDistanceMm - right.limitDistanceMm;
    }
    const leftTargetDistance = Math.abs(left.glassWidthMm - targetGlassWidthMm);
    const rightTargetDistance = Math.abs(right.glassWidthMm - targetGlassWidthMm);
    if (leftTargetDistance !== rightTargetDistance) {
      return leftTargetDistance - rightTargetDistance;
    }
    return left.panelCount - right.panelCount;
  })[0]!;
}

function createAxisCells(values: {
  readonly totalSizeMm: number;
  readonly panelCount: number;
  readonly glassSizeMm: number;
  readonly startGapMm: number;
  readonly endGapMm: number;
  readonly startProfileMm: number;
  readonly endProfileMm: number;
  readonly mullionMm: number;
  readonly startKind: BalconyElevationCellKind;
  readonly endKind: BalconyElevationCellKind;
}): readonly BalconyElevationCell[] {
  const cells: BalconyElevationCell[] = [];
  let cursorMm = 0;
  const add = (
    id: string,
    kind: BalconyElevationCellKind,
    widthMm: number,
    panelIndex?: number,
  ): void => {
    if (widthMm <= 0) {
      return;
    }
    cells.push({
      id,
      kind,
      startMm: cursorMm,
      widthMm,
      startPercent: percent(cursorMm, values.totalSizeMm),
      widthPercent: percent(widthMm, values.totalSizeMm),
      ...(panelIndex === undefined ? {} : { panelIndex }),
    });
    cursorMm += widthMm;
  };

  add('mounting-start', 'mounting-gap', values.startGapMm);
  add('profile-start', values.startKind, values.startProfileMm);
  for (let index = 0; index < values.panelCount; index += 1) {
    add(`glass-${index}`, 'glass', values.glassSizeMm, index);
    if (index < values.panelCount - 1) {
      add(`mullion-${index}`, 'mullion-profile', values.mullionMm);
    }
  }
  add('profile-end', values.endKind, values.endProfileMm);
  add('mounting-end', 'mounting-gap', values.endGapMm);
  return cells;
}

function normalizeProfileSpec(input: BalconyProfileSpec | null | undefined): NormalizedProfileSpec {
  const source = input ?? DEFAULT_BALCONY_PROFILE_SPEC;
  let usedFallback = !input;
  const number = (value: number, fallback: number): number => {
    if (Number.isFinite(value) && value >= 0) {
      return value;
    }
    usedFallback = true;
    return fallback;
  };
  const strictlyPositive = (value: number, fallback: number): number => {
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
    usedFallback = true;
    return fallback;
  };

  const minGlassWidthMm = strictlyPositive(
    source.min_glass_width_mm,
    DEFAULT_BALCONY_PROFILE_SPEC.min_glass_width_mm,
  );
  let maxGlassWidthMm = strictlyPositive(
    source.max_glass_width_mm,
    DEFAULT_BALCONY_PROFILE_SPEC.max_glass_width_mm,
  );
  if (maxGlassWidthMm < minGlassWidthMm) {
    maxGlassWidthMm = Math.max(minGlassWidthMm, DEFAULT_BALCONY_PROFILE_SPEC.max_glass_width_mm);
    usedFallback = true;
  }
  const targetGlassWidthMm = Math.min(
    Math.max(
      strictlyPositive(
        source.target_glass_width_mm,
        DEFAULT_BALCONY_PROFILE_SPEC.target_glass_width_mm,
      ),
      minGlassWidthMm,
    ),
    maxGlassWidthMm,
  );
  const minPanelCount = clampInteger(source.min_panel_count, 1, MAX_SAFE_PANEL_COUNT);
  const requestedMaxPanelCount = clampInteger(source.max_panel_count, 1, MAX_SAFE_PANEL_COUNT);
  const maxPanelCount = Math.max(minPanelCount, requestedMaxPanelCount);
  if (
    minPanelCount !== source.min_panel_count ||
    maxPanelCount !== source.max_panel_count ||
    targetGlassWidthMm !== source.target_glass_width_mm
  ) {
    usedFallback = true;
  }

  return {
    usedFallback,
    spec: {
      edge_profile_mm: number(source.edge_profile_mm, DEFAULT_BALCONY_PROFILE_SPEC.edge_profile_mm),
      mullion_profile_mm: number(
        source.mullion_profile_mm,
        DEFAULT_BALCONY_PROFILE_SPEC.mullion_profile_mm,
      ),
      corner_profile_mm: number(
        source.corner_profile_mm,
        DEFAULT_BALCONY_PROFILE_SPEC.corner_profile_mm,
      ),
      top_profile_mm: number(source.top_profile_mm, DEFAULT_BALCONY_PROFILE_SPEC.top_profile_mm),
      bottom_profile_mm: number(
        source.bottom_profile_mm,
        DEFAULT_BALCONY_PROFILE_SPEC.bottom_profile_mm,
      ),
      mounting_gap_mm: number(source.mounting_gap_mm, DEFAULT_BALCONY_PROFILE_SPEC.mounting_gap_mm),
      min_glass_width_mm: minGlassWidthMm,
      target_glass_width_mm: targetGlassWidthMm,
      max_glass_width_mm: maxGlassWidthMm,
      min_panel_count: minPanelCount,
      max_panel_count: maxPanelCount,
    },
  };
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }
  return Math.min(Math.max(Math.round(value), minimum), maximum);
}

function positiveNumber(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function percent(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}
