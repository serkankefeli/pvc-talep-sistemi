import {
  BalconyEnclosureItem,
  DivisionLine,
  DoorItem,
  FacadeCladdingItem,
  FlyscreenItem,
  GuillotineGlassItem,
  PublicRequestItem,
  WindowItem,
} from '../core/request.models';
import {
  BalconyElevationGeometry,
  calculateBalconyElevationGeometry,
} from './balcony-elevation-geometry';

export interface PreviewLine {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface PreviewRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PreviewGeometry {
  readonly frame: PreviewRect;
  readonly inner: PreviewRect;
  readonly divisions: readonly PreviewLine[];
  readonly opening: readonly PreviewLine[];
  readonly surfaceLines: readonly PreviewLine[];
}

interface PreviewInsets {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

const DRAWING_AREA = {
  x: 82,
  y: 52,
  width: 316,
  height: 242,
} as const;

function clampMeasurement(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(Math.max(value, 1), 50_000);
}

function lineFromDivision(frame: PreviewRect, division: DivisionLine): PreviewLine {
  const position = Math.min(Math.max(division.position_percent, 1), 99) / 100;
  if (division.axis === 'vertical') {
    const x = frame.x + frame.width * position;
    return { x1: x, y1: frame.y, x2: x, y2: frame.y + frame.height };
  }
  const y = frame.y + frame.height * position;
  return { x1: frame.x, y1: y, x2: frame.x + frame.width, y2: y };
}

function facadeDivisions(item: FacadeCladdingItem): readonly DivisionLine[] {
  if (item.panel_orientation === 'horizontal') {
    return [
      { axis: 'horizontal', position_percent: 33.333 },
      { axis: 'horizontal', position_percent: 66.667 },
    ];
  }
  if (item.panel_orientation === 'vertical') {
    return [
      { axis: 'vertical', position_percent: 33.333 },
      { axis: 'vertical', position_percent: 66.667 },
    ];
  }
  return [
    { axis: 'horizontal', position_percent: 50 },
    { axis: 'vertical', position_percent: 50 },
  ];
}

function balconyDivisions(elevation: BalconyElevationGeometry): readonly DivisionLine[] {
  return elevation.cells
    .filter((cell) => cell.kind === 'mullion-profile')
    .map((cell) => ({
      axis: elevation.primaryAxis === 'x' ? ('vertical' as const) : ('horizontal' as const),
      position_percent: cell.startPercent + cell.widthPercent / 2,
    }));
}

function itemDivisions(
  item: PublicRequestItem,
  balconyElevation: BalconyElevationGeometry | null,
): readonly DivisionLine[] {
  if (item.product_type === 'pvc_window' || item.product_type === 'pvc_door') {
    const joinery = item as WindowItem | DoorItem;
    return Array.isArray(joinery.divisions) ? joinery.divisions : [];
  }
  if (item.product_type === 'guillotine_glass') {
    const guillotine = item as GuillotineGlassItem;
    const panelCount = [2, 3, 4].includes(guillotine.panel_count) ? guillotine.panel_count : 2;
    return Array.from({ length: panelCount - 1 }, (_value, index) => ({
      axis: 'horizontal' as const,
      position_percent: ((index + 1) * 100) / panelCount,
    }));
  }
  if (item.product_type === 'facade_cladding') {
    const facade = item as FacadeCladdingItem;
    return ['horizontal', 'vertical', 'mixed'].includes(facade.panel_orientation)
      ? facadeDivisions(facade)
      : [];
  }
  if (item.product_type === 'balcony_enclosure') {
    return balconyElevation ? balconyDivisions(balconyElevation) : [];
  }
  if (item.product_type !== 'flyscreen') {
    return [];
  }
  const flyscreen = item as FlyscreenItem;
  if (flyscreen.screen_type === 'sliding') {
    return [{ axis: 'vertical', position_percent: 50 }];
  }
  if (flyscreen.screen_type === 'roller') {
    return [{ axis: 'horizontal', position_percent: 14 }];
  }
  return [];
}

function openingLines(item: PublicRequestItem, inner: PreviewRect): readonly PreviewLine[] {
  if (item.product_type !== 'pvc_window' && item.product_type !== 'pvc_door') {
    return [];
  }

  const direction = (item as WindowItem | DoorItem).opening_direction;
  if (direction === 'none') {
    return [];
  }

  const left = inner.x;
  const right = inner.x + inner.width;
  const top = inner.y;
  const bottom = inner.y + inner.height;
  const midY = inner.y + inner.height / 2;

  if (direction === 'left') {
    return [
      { x1: right, y1: top, x2: left, y2: midY },
      { x1: left, y1: midY, x2: right, y2: bottom },
    ];
  }
  if (direction === 'right') {
    return [
      { x1: left, y1: top, x2: right, y2: midY },
      { x1: right, y1: midY, x2: left, y2: bottom },
    ];
  }
  if (direction === 'sliding') {
    return [
      { x1: left + inner.width * 0.2, y1: midY, x2: right - inner.width * 0.2, y2: midY },
      { x1: right - inner.width * 0.32, y1: midY - 8, x2: right - inner.width * 0.2, y2: midY },
      { x1: right - inner.width * 0.32, y1: midY + 8, x2: right - inner.width * 0.2, y2: midY },
    ];
  }
  return [
    { x1: left, y1: top, x2: right, y2: bottom },
    { x1: right, y1: top, x2: left, y2: bottom },
  ];
}

function meshLines(item: PublicRequestItem, inner: PreviewRect): readonly PreviewLine[] {
  if (item.product_type !== 'flyscreen') {
    return [];
  }
  const flyscreen = item as FlyscreenItem;
  const result: PreviewLine[] = [];
  const count = flyscreen.screen_type === 'pleated' ? 8 : 5;
  for (let index = 1; index < count; index += 1) {
    const x = inner.x + (inner.width * index) / count;
    result.push({ x1: x, y1: inner.y, x2: x, y2: inner.y + inner.height });
  }
  if (flyscreen.screen_type !== 'pleated') {
    for (let index = 1; index < 5; index += 1) {
      const y = inner.y + (inner.height * index) / 5;
      result.push({ x1: inner.x, y1: y, x2: inner.x + inner.width, y2: y });
    }
  }
  return result;
}

export function calculatePreviewGeometry(
  item: PublicRequestItem,
  balconySegmentIndex = 0,
): PreviewGeometry {
  const balconyElevation =
    item.product_type === 'balcony_enclosure'
      ? calculateBalconyElevationGeometry(item as BalconyEnclosureItem, balconySegmentIndex)
      : null;
  const width = clampMeasurement(balconyElevation?.segmentWidthMm ?? item.width_mm);
  const height = clampMeasurement(item.height_mm);
  const scale = Math.min(DRAWING_AREA.width / width, DRAWING_AREA.height / height);
  const frameWidth = width * scale;
  const frameHeight = height * scale;
  const frame: PreviewRect = {
    x: DRAWING_AREA.x + (DRAWING_AREA.width - frameWidth) / 2,
    y: DRAWING_AREA.y + (DRAWING_AREA.height - frameHeight) / 2,
    width: frameWidth,
    height: frameHeight,
  };
  const insets = previewInsets(item, frame, width, height);
  const inner: PreviewRect = {
    x: frame.x + insets.left,
    y: frame.y + insets.top,
    width: Math.max(frame.width - insets.left - insets.right, 1),
    height: Math.max(frame.height - insets.top - insets.bottom, 1),
  };

  return {
    frame,
    inner,
    divisions: itemDivisions(item, balconyElevation).map((line) => lineFromDivision(frame, line)),
    opening: openingLines(item, inner),
    surfaceLines: meshLines(item, inner),
  };
}

function previewInsets(
  item: PublicRequestItem,
  frame: PreviewRect,
  widthMm: number,
  heightMm: number,
): PreviewInsets {
  if (item.product_type === 'pvc_window' || item.product_type === 'pvc_door') {
    const profileSpec = item.profile_spec;
    if (profileSpec) {
      const horizontalScale = frame.width / widthMm;
      const verticalScale = frame.height / heightMm;
      const edge = boundedInset(profileSpec.edge_profile_mm * horizontalScale, frame.width);
      return {
        left: edge,
        right: edge,
        top: boundedInset(profileSpec.top_profile_mm * verticalScale, frame.height),
        bottom: boundedInset(profileSpec.bottom_profile_mm * verticalScale, frame.height),
      };
    }
  }
  const inset = Math.min(13, frame.width * 0.12, frame.height * 0.12);
  return { left: inset, right: inset, top: inset, bottom: inset };
}

function boundedInset(value: number, axisSize: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.min(value, axisSize * 0.22);
}

export function frameColor(color: string): string {
  const palette: Readonly<Record<string, string>> = {
    white: '#f7f7f3',
    anthracite: '#3c4547',
    golden_oak: '#a96937',
    walnut: '#684a38',
    black: '#242827',
    grey: '#777f81',
    natural: '#d7d2c7',
  };
  return palette[color] ?? palette['white'];
}
