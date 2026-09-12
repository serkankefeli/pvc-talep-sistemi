import {
  BalconyProfileSpec,
  DoorItem,
  JoineryPanel,
  JoineryPanelHinge,
  JoineryPanelOpening,
  PublicRequestItem,
  WindowItem,
} from '../core/request.models';

export type JoineryProductType = WindowItem['product_type'] | DoorItem['product_type'];
export type JoineryLayout = WindowItem['layout'] | DoorItem['layout'];

export const JOINERY_PANEL_OPENINGS = [
  'fixed',
  'turn',
  'tilt',
  'tilt_turn',
  'sliding',
] as const satisfies readonly JoineryPanelOpening[];

export const JOINERY_PANEL_HINGES = [
  'none',
  'left',
  'right',
] as const satisfies readonly JoineryPanelHinge[];

export interface JoineryBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface JoineryLine {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export type JoineryMarkerKind = 'fixed' | 'turn' | 'tilt' | 'sliding';
export type JoinerySurfaceKind = 'glass' | 'panel';

export interface JoineryMarkerLine extends JoineryLine {
  readonly kind: JoineryMarkerKind;
}

export interface JoineryRecordGeometry extends JoineryBounds {
  readonly axis: 'horizontal' | 'vertical';
}

export interface JoineryPanelGeometry {
  readonly panel: JoineryPanel;
  readonly frame: JoineryBounds;
  readonly glass: JoineryBounds;
  readonly glazingBead: JoineryBounds & { readonly strokeWidth: number };
  readonly markers: readonly JoineryMarkerLine[];
  readonly handle: JoineryLine | null;
  readonly hardware: readonly JoineryHardwareGeometry[];
}

export interface JoineryHardwareGeometry extends JoineryBounds {
  readonly kind: 'hinge' | 'lock' | 'lock-point';
  readonly variant: string;
}

export interface JoineryGeometry {
  readonly panels: readonly JoineryPanelGeometry[];
  readonly records: readonly JoineryRecordGeometry[];
}

const OPENING_SET = new Set<string>(JOINERY_PANEL_OPENINGS);
const HINGE_SET = new Set<string>(JOINERY_PANEL_HINGES);
const MAX_PANELS = 16;
const MIN_PANEL_PERCENT = 4;
const EPSILON = 0.001;
const MIXED_LAYOUTS = new Set<JoineryLayout>(['window_door', 'door_window', 'window_door_window']);
const OPENING_LABELS: Readonly<Record<JoineryPanelOpening, string>> = {
  fixed: 'Sabit',
  turn: 'Tek açılım',
  tilt: 'Vasistas',
  tilt_turn: 'Çift açılım',
  sliding: 'Sürme',
};

export function isJoineryPanelOpening(value: unknown): value is JoineryPanelOpening {
  return typeof value === 'string' && OPENING_SET.has(value);
}

export function isJoineryPanelHinge(value: unknown): value is JoineryPanelHinge {
  return typeof value === 'string' && HINGE_SET.has(value);
}

export function isJoineryItem(item: PublicRequestItem): item is WindowItem | DoorItem {
  return (
    (item.product_type === 'pvc_window' || item.product_type === 'pvc_door') && 'layout' in item
  );
}

export function isMixedJoineryLayout(layout: unknown): layout is JoineryLayout {
  return typeof layout === 'string' && MIXED_LAYOUTS.has(layout as JoineryLayout);
}

export function joineryPanelDescription(panelSource: JoineryPanel): string {
  const openingLabel = OPENING_LABELS[panelSource.opening];
  if (
    (panelSource.opening === 'turn' || panelSource.opening === 'tilt_turn') &&
    panelSource.hinge !== 'none'
  ) {
    return `${openingLabel} · ${panelSource.hinge === 'left' ? 'Sol' : 'Sağ'} menteşe`;
  }
  return openingLabel;
}

/** Returns the visible infill treatment for a managed glazing/panel choice. */
export function joinerySurfaceKind(item: WindowItem | DoorItem): JoinerySurfaceKind {
  const glazing = typeof item.glazing === 'string' ? item.glazing.toLocaleLowerCase('tr-TR') : '';
  return /panel|dolgu|sandviç|sandwich|opaque/.test(glazing) ? 'panel' : 'glass';
}

export function buildJoineryPanels(
  productType: JoineryProductType,
  layout: JoineryLayout,
  opening: JoineryPanelOpening = 'turn',
  hinge: JoineryPanelHinge = 'right',
): readonly JoineryPanel[] {
  const requestedOpening = isJoineryPanelOpening(opening) ? opening : 'turn';
  const requestedHinge = activeHinge(requestedOpening, hinge);

  if (layout === 'window_door') {
    return [
      panel(
        'left_window',
        'Sol pencere',
        'window',
        0,
        0,
        38,
        100,
        requestedOpening,
        requestedHinge,
      ),
      panel(
        'right_door',
        'Sağ kapı',
        'door',
        38,
        0,
        62,
        100,
        requestedOpening,
        oppositeHinge(requestedHinge),
      ),
    ];
  }
  if (layout === 'door_window') {
    return [
      panel('left_door', 'Sol kapı', 'door', 0, 0, 62, 100, requestedOpening, requestedHinge),
      panel(
        'right_window',
        'Sağ pencere',
        'window',
        62,
        0,
        38,
        100,
        requestedOpening,
        oppositeHinge(requestedHinge),
      ),
    ];
  }
  if (layout === 'window_door_window') {
    return [
      panel('left_window', 'Sol pencere', 'window', 0, 0, 28, 100, requestedOpening, 'left'),
      panel('center_door', 'Orta kapı', 'door', 28, 0, 44, 100, requestedOpening, requestedHinge),
      panel('right_window', 'Sağ pencere', 'window', 72, 0, 28, 100, requestedOpening, 'right'),
    ];
  }

  if (productType === 'pvc_door') {
    if (layout === 'double') {
      return [
        panel('left_door', 'Sol kapı', 'door', 0, 0, 50, 100, requestedOpening, 'left'),
        panel('right_door', 'Sağ kapı', 'door', 50, 0, 50, 100, requestedOpening, 'right'),
      ];
    }
    if (layout === 'sliding') {
      return [
        panel('left_door', 'Sol sürme kanat', 'door', 0, 0, 50, 100, 'sliding', 'none'),
        panel('right_door', 'Sağ sürme kanat', 'door', 50, 0, 50, 100, 'sliding', 'none'),
      ];
    }
    return [
      panel(
        'door',
        layout === 'balcony' ? 'Balkon kapısı' : 'Kapı',
        'door',
        0,
        0,
        100,
        100,
        requestedOpening,
        requestedHinge,
      ),
    ];
  }

  if (layout === 'fixed') {
    return [panel('window', 'Sabit pencere', 'window', 0, 0, 100, 100, 'fixed', 'none')];
  }
  if (layout === 'double_sash') {
    return [
      panel('left_window', 'Sol kanat', 'window', 0, 0, 50, 100, requestedOpening, 'left'),
      panel('right_window', 'Sağ kanat', 'window', 50, 0, 50, 100, requestedOpening, 'right'),
    ];
  }
  if (layout === 'transom') {
    return [
      panel('top_window', 'Üst sabit', 'window', 0, 0, 100, 28, 'fixed', 'none'),
      panel(
        'bottom_window',
        'Alt kanat',
        'window',
        0,
        28,
        100,
        72,
        requestedOpening,
        requestedHinge,
      ),
    ];
  }
  if (layout === 'custom_grid') {
    return [
      panel('top_left_window', 'Sol üst sabit', 'window', 0, 0, 50, 28, 'fixed', 'none'),
      panel('top_right_window', 'Sağ üst sabit', 'window', 50, 0, 50, 28, 'fixed', 'none'),
      panel(
        'bottom_left_window',
        'Sol alt kanat',
        'window',
        0,
        28,
        50,
        72,
        requestedOpening,
        'left',
      ),
      panel(
        'bottom_right_window',
        'Sağ alt kanat',
        'window',
        50,
        28,
        50,
        72,
        requestedOpening,
        'right',
      ),
    ];
  }
  return [
    panel(
      'window',
      layout === 'tilt_turn' ? 'Çift açılım pencere' : 'Pencere kanadı',
      'window',
      0,
      0,
      100,
      100,
      layout === 'tilt_turn' ? 'tilt_turn' : requestedOpening,
      requestedHinge,
    ),
  ];
}

export function resolveJoineryPanels(item: WindowItem | DoorItem): readonly JoineryPanel[] {
  const supplied = normalizeSuppliedPanels(item.panels);
  if (supplied) {
    return supplied;
  }

  const hinge = legacyHinge(item.opening_direction);
  const opening = legacyOpening(item);
  return buildJoineryPanels(item.product_type, item.layout, opening, hinge);
}

export function calculateJoineryGeometry(
  item: WindowItem | DoorItem,
  bounds: JoineryBounds,
): JoineryGeometry {
  const safeBounds = normalizeBounds(bounds);
  const profileSpec = itemProfileSpec(item);
  const sideProfileWidthMm = catalogMeasurement(
    item,
    'frame_profile_width_mm',
    profileSpec?.edge_profile_mm,
  );
  const topProfileWidthMm = catalogMeasurement(
    item,
    'frame_profile_width_mm',
    profileSpec?.top_profile_mm,
  );
  const bottomProfileWidthMm = catalogMeasurement(
    item,
    'frame_profile_width_mm',
    profileSpec?.bottom_profile_mm,
  );
  const mullionProfileWidthMm = catalogMeasurement(
    item,
    'mullion_profile_width_mm',
    profileSpec?.mullion_profile_mm,
  );
  const glazingBarWidthMm = catalogMeasurement(item, 'glazing_bar_width_mm', 20) ?? 20;
  const horizontalScale = safeBounds.width / positiveMeasurement(item.width_mm);
  const verticalScale = safeBounds.height / positiveMeasurement(item.height_mm);
  const panels = resolveJoineryPanels(item).map((source) => {
    const frame = mapPanelToBounds(source, safeBounds);
    const legacyInset = Math.min(
      clamp(Math.min(frame.width, frame.height) * 0.07, 2, 8),
      Math.max(frame.width * 0.22, 0.25),
      Math.max(frame.height * 0.22, 0.25),
    );
    const leftInset = sideProfileWidthMm !== null
      ? boundedPhysicalInset(sideProfileWidthMm * horizontalScale, frame.width)
      : legacyInset;
    const rightInset = leftInset;
    const topInset = topProfileWidthMm !== null
      ? boundedPhysicalInset(topProfileWidthMm * verticalScale, frame.height)
      : legacyInset;
    const bottomInset = bottomProfileWidthMm !== null
      ? boundedPhysicalInset(bottomProfileWidthMm * verticalScale, frame.height)
      : legacyInset;
    const glass: JoineryBounds = {
      x: frame.x + leftInset,
      y: frame.y + topInset,
      width: Math.max(frame.width - leftInset - rightInset, 0.5),
      height: Math.max(frame.height - topInset - bottomInset, 0.5),
    };
    const glazingBeadStroke = clamp(
      glazingBarWidthMm * ((horizontalScale + verticalScale) / 2),
      0.5,
      Math.max(Math.min(frame.width, frame.height) * 0.12, 0.5),
    );
    return {
      panel: source,
      frame,
      glass,
      glazingBead: { ...glass, strokeWidth: glazingBeadStroke },
      markers: markerLines(source, glass),
      handle: handleLine(source, glass),
      hardware: hardwareGeometry(item, source, frame),
    } satisfies JoineryPanelGeometry;
  });

  const legacyRecordThickness = clamp(
    Math.min(safeBounds.width, safeBounds.height) * 0.025,
    2.5,
    8,
  );
  const verticalRecordThickness = mullionProfileWidthMm !== null
    ? boundedRecordThickness(mullionProfileWidthMm * horizontalScale, safeBounds.width)
    : legacyRecordThickness;
  const horizontalRecordThickness = mullionProfileWidthMm !== null
    ? boundedRecordThickness(mullionProfileWidthMm * verticalScale, safeBounds.height)
    : legacyRecordThickness;
  return {
    panels,
    records: sharedRecords(panels, verticalRecordThickness, horizontalRecordThickness),
  };
}

function hardwareGeometry(
  item: WindowItem | DoorItem,
  panelSource: JoineryPanel,
  frame: JoineryBounds,
): readonly JoineryHardwareGeometry[] {
  if (panelSource.opening === 'fixed' || panelSource.opening === 'sliding') {
    return [];
  }

  const markers: JoineryHardwareGeometry[] = [];
  const hingeType = catalogText(item, 'hinge_type');
  if (hingeType && hingeType !== 'advisor' && panelSource.hinge !== 'none') {
    const count = hingeType === 'heavy_duty' ? 4 : 3;
    const hingeWidth = clamp(frame.width * 0.025, 0.8, 2.5);
    const hingeHeight = clamp(frame.height * 0.045, 1.6, 4.5);
    const x = panelSource.hinge === 'left'
      ? frame.x + hingeWidth * 0.5
      : frame.x + frame.width - hingeWidth * 1.5;
    for (let index = 0; index < count; index += 1) {
      const centerY = frame.y + (frame.height * (index + 1)) / (count + 1);
      markers.push({
        kind: 'hinge',
        variant: hingeType,
        x,
        y: centerY - hingeHeight / 2,
        width: hingeWidth,
        height: hingeHeight,
      });
    }
  }

  const lockType = catalogText(item, 'lock_type');
  if (lockType && lockType !== 'advisor') {
    const lockWidth = clamp(frame.width * 0.025, 0.8, 2.4);
    const lockHeight = clamp(frame.height * 0.075, 2.5, 7);
    const lockOnLeft = panelSource.hinge === 'right';
    const x = lockOnLeft
      ? frame.x + lockWidth * 0.75
      : frame.x + frame.width - lockWidth * 1.75;
    const requestedHeight = catalogMeasurement(item, 'lock_height_mm', undefined);
    const ratio = requestedHeight === null
      ? 0.5
      : clamp(requestedHeight / positiveMeasurement(item.height_mm), 0.12, 0.88);
    const centerY = frame.y + frame.height * (1 - ratio);
    markers.push({
      kind: 'lock',
      variant: lockType,
      x,
      y: centerY - lockHeight / 2,
      width: lockWidth,
      height: lockHeight,
    });
    if (lockType === 'multipoint' || lockType === 'security') {
      for (const offset of [-0.28, 0.28]) {
        const size = clamp(Math.min(frame.width, frame.height) * 0.018, 0.8, 2.2);
        markers.push({
          kind: 'lock-point',
          variant: lockType,
          x: x + (lockWidth - size) / 2,
          y: centerY + frame.height * offset - size / 2,
          width: size,
          height: size,
        });
      }
    }
  }
  return markers;
}

function panel(
  slot: string,
  label: string,
  role: JoineryPanel['role'],
  xPercent: number,
  yPercent: number,
  widthPercent: number,
  heightPercent: number,
  opening: JoineryPanelOpening,
  hinge: JoineryPanelHinge,
): JoineryPanel {
  return {
    slot,
    label,
    role,
    x_percent: xPercent,
    y_percent: yPercent,
    width_percent: widthPercent,
    height_percent: heightPercent,
    opening,
    hinge: activeHinge(opening, hinge),
  };
}

function activeHinge(opening: JoineryPanelOpening, hinge: JoineryPanelHinge): JoineryPanelHinge {
  if (opening === 'fixed' || opening === 'tilt' || opening === 'sliding') {
    return 'none';
  }
  return hinge === 'left' ? 'left' : 'right';
}

function oppositeHinge(hinge: JoineryPanelHinge): JoineryPanelHinge {
  return hinge === 'left' ? 'right' : 'left';
}

function legacyHinge(
  direction: WindowItem['opening_direction'] | DoorItem['opening_direction'],
): JoineryPanelHinge {
  if (direction === 'left' || direction === 'right') {
    return direction;
  }
  return direction === 'sliding' ? 'none' : 'right';
}

function legacyOpening(item: WindowItem | DoorItem): JoineryPanelOpening {
  if (item.product_type === 'pvc_door' && item.layout === 'sliding') {
    return 'sliding';
  }
  if (item.product_type === 'pvc_window') {
    if (item.layout === 'fixed' || item.opening_direction === 'none') {
      return 'fixed';
    }
    if (item.layout === 'tilt_turn') {
      return 'tilt_turn';
    }
  }
  return 'turn';
}

function normalizeSuppliedPanels(
  value: readonly JoineryPanel[] | undefined,
): readonly JoineryPanel[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PANELS) {
    return null;
  }

  const normalized: JoineryPanel[] = [];
  const slots = new Set<string>();
  for (const source of value) {
    if (!source || typeof source !== 'object') {
      return null;
    }
    const slot = typeof source.slot === 'string' ? source.slot.trim() : '';
    const label = typeof source.label === 'string' ? source.label.trim() : '';
    if (
      !/^[a-z0-9][a-z0-9_-]{0,31}$/i.test(slot) ||
      slots.has(slot) ||
      !label ||
      label.length > 40 ||
      (source.role !== 'window' && source.role !== 'door') ||
      !isJoineryPanelOpening(source.opening) ||
      !isJoineryPanelHinge(source.hinge) ||
      !validPercentRect(source)
    ) {
      return null;
    }
    slots.add(slot);
    normalized.push({
      slot,
      label,
      role: source.role,
      x_percent: source.x_percent,
      y_percent: source.y_percent,
      width_percent: source.width_percent,
      height_percent: source.height_percent,
      opening: source.opening,
      hinge: activeHinge(source.opening, source.hinge),
    });
  }

  for (let leftIndex = 0; leftIndex < normalized.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < normalized.length; rightIndex += 1) {
      if (panelsOverlap(normalized[leftIndex], normalized[rightIndex])) {
        return null;
      }
    }
  }
  return normalized;
}

function validPercentRect(value: JoineryPanel): boolean {
  const coordinates = [value.x_percent, value.y_percent, value.width_percent, value.height_percent];
  return (
    coordinates.every(Number.isFinite) &&
    value.x_percent >= 0 &&
    value.y_percent >= 0 &&
    value.width_percent >= MIN_PANEL_PERCENT &&
    value.height_percent >= MIN_PANEL_PERCENT &&
    value.x_percent + value.width_percent <= 100 + EPSILON &&
    value.y_percent + value.height_percent <= 100 + EPSILON
  );
}

function panelsOverlap(left: JoineryPanel, right: JoineryPanel): boolean {
  const horizontal =
    Math.min(left.x_percent + left.width_percent, right.x_percent + right.width_percent) -
    Math.max(left.x_percent, right.x_percent);
  const vertical =
    Math.min(left.y_percent + left.height_percent, right.y_percent + right.height_percent) -
    Math.max(left.y_percent, right.y_percent);
  return horizontal > EPSILON && vertical > EPSILON;
}

function normalizeBounds(bounds: JoineryBounds): JoineryBounds {
  return {
    x: Number.isFinite(bounds.x) ? bounds.x : 0,
    y: Number.isFinite(bounds.y) ? bounds.y : 0,
    width: Number.isFinite(bounds.width) ? Math.max(bounds.width, 1) : 100,
    height: Number.isFinite(bounds.height) ? Math.max(bounds.height, 1) : 100,
  };
}

function mapPanelToBounds(panelSource: JoineryPanel, bounds: JoineryBounds): JoineryBounds {
  return {
    x: bounds.x + (bounds.width * panelSource.x_percent) / 100,
    y: bounds.y + (bounds.height * panelSource.y_percent) / 100,
    width: (bounds.width * panelSource.width_percent) / 100,
    height: (bounds.height * panelSource.height_percent) / 100,
  };
}

function markerLines(
  panelSource: JoineryPanel,
  glass: JoineryBounds,
): readonly JoineryMarkerLine[] {
  if (panelSource.opening === 'fixed') {
    return fixedMarker(glass);
  }
  if (panelSource.opening === 'sliding') {
    return slidingMarker(glass);
  }

  const result: JoineryMarkerLine[] = [];
  if (panelSource.opening === 'turn' || panelSource.opening === 'tilt_turn') {
    result.push(...turnMarker(glass, panelSource.hinge));
  }
  if (panelSource.opening === 'tilt' || panelSource.opening === 'tilt_turn') {
    result.push(...tiltMarker(glass));
  }
  return result;
}

function fixedMarker(glass: JoineryBounds): readonly JoineryMarkerLine[] {
  const centerX = glass.x + glass.width / 2;
  const centerY = glass.y + glass.height / 2;
  const size = clamp(Math.min(glass.width, glass.height) * 0.09, 2, 7);
  return [
    { kind: 'fixed', x1: centerX - size, y1: centerY, x2: centerX + size, y2: centerY },
    { kind: 'fixed', x1: centerX, y1: centerY - size, x2: centerX, y2: centerY + size },
  ];
}

function turnMarker(glass: JoineryBounds, hinge: JoineryPanelHinge): readonly JoineryMarkerLine[] {
  const left = glass.x;
  const right = glass.x + glass.width;
  const top = glass.y;
  const bottom = glass.y + glass.height;
  const centerY = glass.y + glass.height / 2;
  const hingeX = hinge === 'left' ? left : right;
  const closingX = hinge === 'left' ? right : left;
  return [
    { kind: 'turn', x1: closingX, y1: top, x2: hingeX, y2: centerY },
    { kind: 'turn', x1: hingeX, y1: centerY, x2: closingX, y2: bottom },
  ];
}

function tiltMarker(glass: JoineryBounds): readonly JoineryMarkerLine[] {
  const centerBottom = glass.x + glass.width / 2;
  const bottom = glass.y + glass.height;
  return [
    { kind: 'tilt', x1: glass.x, y1: glass.y, x2: centerBottom, y2: bottom },
    {
      kind: 'tilt',
      x1: glass.x + glass.width,
      y1: glass.y,
      x2: centerBottom,
      y2: bottom,
    },
  ];
}

function slidingMarker(glass: JoineryBounds): readonly JoineryMarkerLine[] {
  const startX = glass.x + glass.width * 0.22;
  const endX = glass.x + glass.width * 0.78;
  const y = glass.y + glass.height / 2;
  const arrow = clamp(Math.min(glass.width, glass.height) * 0.08, 2, 6);
  return [
    { kind: 'sliding', x1: startX, y1: y, x2: endX, y2: y },
    { kind: 'sliding', x1: endX - arrow, y1: y - arrow, x2: endX, y2: y },
    { kind: 'sliding', x1: endX - arrow, y1: y + arrow, x2: endX, y2: y },
  ];
}

function handleLine(panelSource: JoineryPanel, glass: JoineryBounds): JoineryLine | null {
  if (panelSource.opening === 'fixed') {
    return null;
  }

  const length = clamp(
    Math.min(glass.width, glass.height) * (panelSource.role === 'door' ? 0.12 : 0.09),
    2.5,
    8,
  );
  if (panelSource.opening === 'tilt') {
    const centerX = glass.x + glass.width / 2;
    const y = glass.y + Math.min(glass.height * 0.08, 5);
    return { x1: centerX - length / 2, y1: y, x2: centerX + length / 2, y2: y };
  }

  const effectiveHinge = panelSource.hinge === 'left' ? 'left' : 'right';
  const x =
    effectiveHinge === 'left'
      ? glass.x + glass.width - Math.min(glass.width * 0.08, 5)
      : glass.x + Math.min(glass.width * 0.08, 5);
  const y = glass.y + glass.height * (panelSource.role === 'door' ? 0.55 : 0.5);
  return { x1: x, y1: y - length / 2, x2: x, y2: y + length / 2 };
}

function sharedRecords(
  panels: readonly JoineryPanelGeometry[],
  verticalThickness: number,
  horizontalThickness: number,
): readonly JoineryRecordGeometry[] {
  const records: JoineryRecordGeometry[] = [];
  const seen = new Set<string>();
  for (let leftIndex = 0; leftIndex < panels.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < panels.length; rightIndex += 1) {
      const left = panels[leftIndex].frame;
      const right = panels[rightIndex].frame;
      const sharedX = sharedEdge(left.x + left.width, right.x, right.x + right.width, left.x);
      const yStart = Math.max(left.y, right.y);
      const yEnd = Math.min(left.y + left.height, right.y + right.height);
      if (sharedX !== null && yEnd - yStart > EPSILON) {
        addRecord(records, seen, {
          axis: 'vertical',
          x: sharedX - verticalThickness / 2,
          y: yStart,
          width: verticalThickness,
          height: yEnd - yStart,
        });
      }

      const sharedY = sharedEdge(left.y + left.height, right.y, right.y + right.height, left.y);
      const xStart = Math.max(left.x, right.x);
      const xEnd = Math.min(left.x + left.width, right.x + right.width);
      if (sharedY !== null && xEnd - xStart > EPSILON) {
        addRecord(records, seen, {
          axis: 'horizontal',
          x: xStart,
          y: sharedY - horizontalThickness / 2,
          width: xEnd - xStart,
          height: horizontalThickness,
        });
      }
    }
  }
  return records;
}

function sharedEdge(
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
  firstStart: number,
): number | null {
  if (Math.abs(firstEnd - secondStart) <= EPSILON) {
    return (firstEnd + secondStart) / 2;
  }
  if (Math.abs(secondEnd - firstStart) <= EPSILON) {
    return (secondEnd + firstStart) / 2;
  }
  return null;
}

function addRecord(
  records: JoineryRecordGeometry[],
  seen: Set<string>,
  record: JoineryRecordGeometry,
): void {
  const key = `${record.axis}:${round(record.x)}:${round(record.y)}:${round(record.width)}:${round(record.height)}`;
  if (!seen.has(key)) {
    seen.add(key);
    records.push(record);
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function itemProfileSpec(item: WindowItem | DoorItem): BalconyProfileSpec | null {
  const candidate = item.profile_spec;
  if (
    !candidate ||
    !Number.isFinite(candidate.edge_profile_mm) ||
    !Number.isFinite(candidate.mullion_profile_mm) ||
    !Number.isFinite(candidate.top_profile_mm) ||
    !Number.isFinite(candidate.bottom_profile_mm)
  ) {
    return null;
  }
  return candidate;
}

function catalogMeasurement(
  item: WindowItem | DoorItem,
  key: string,
  fallback: number | undefined,
): number | null {
  const answer = item.catalog_answers[key];
  if (typeof answer === 'number' && Number.isFinite(answer) && answer > 0) {
    return answer;
  }
  return typeof fallback === 'number' && Number.isFinite(fallback) && fallback >= 0
    ? fallback
    : null;
}

function catalogText(item: WindowItem | DoorItem, key: string): string {
  const answer = item.catalog_answers[key];
  return typeof answer === 'string' ? answer.trim() : '';
}

function positiveMeasurement(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function boundedPhysicalInset(value: number, panelSize: number): number {
  return clamp(value, 0, Math.max(panelSize * 0.22, 0));
}

function boundedRecordThickness(value: number, axisSize: number): number {
  return clamp(value, 0, Math.max(axisSize * 0.2, 0));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
