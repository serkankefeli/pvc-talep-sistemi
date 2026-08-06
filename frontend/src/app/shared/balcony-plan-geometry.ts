import { BalconySegment } from '../core/request.models';

export interface BalconyPlanLine {
  readonly label: string;
  readonly widthMm: number;
  readonly xPercent: number;
  readonly yPercent: number;
  readonly lengthPercent: number;
  readonly angleDegrees: number;
}

export interface BalconyPlanGeometry {
  readonly lines: readonly BalconyPlanLine[];
  readonly totalWidthMm: number;
}

interface RawLine {
  readonly label: string;
  readonly widthMm: number;
  readonly x: number;
  readonly y: number;
  readonly length: number;
  readonly angle: number;
}

const PLAN_WIDTH = 100;
const PLAN_HEIGHT = 62;
const HORIZONTAL_PADDING = 8;
const VERTICAL_PADDING = 8;

export function calculateBalconyPlanGeometry(
  segments: readonly BalconySegment[],
  shape: string,
): BalconyPlanGeometry {
  const safeSegments = segments
    .slice(0, 8)
    .filter(
      (segment) =>
        Number.isFinite(segment.width_mm) && segment.width_mm >= 300 && segment.width_mm <= 30_000,
    );
  if (safeSegments.length === 0) {
    return { lines: [], totalWidthMm: 0 };
  }

  const rawLines =
    shape === 'u_shape' && safeSegments.length >= 3
      ? uShapeLines(safeSegments)
      : connectedLines(safeSegments);
  const points = rawLines.flatMap((line) => {
    const radians = (line.angle * Math.PI) / 180;
    return [
      { x: line.x, y: line.y },
      {
        x: line.x + Math.cos(radians) * line.length,
        y: line.y + Math.sin(radians) * line.length,
      },
    ];
  });
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const rawWidth = Math.max(maxX - minX, 1);
  const rawHeight = Math.max(maxY - minY, 1);
  const availableWidth = PLAN_WIDTH - HORIZONTAL_PADDING * 2;
  const availableHeight = PLAN_HEIGHT - VERTICAL_PADDING * 2;
  const scale = Math.min(availableWidth / rawWidth, availableHeight / rawHeight);
  const usedWidth = rawWidth * scale;
  const usedHeight = rawHeight * scale;
  const offsetX = (PLAN_WIDTH - usedWidth) / 2 - minX * scale;
  const offsetY = (PLAN_HEIGHT - usedHeight) / 2 - minY * scale;

  return {
    lines: rawLines.map((line) => ({
      label: line.label,
      widthMm: line.widthMm,
      xPercent: round(offsetX + line.x * scale),
      yPercent: round(offsetY + line.y * scale),
      lengthPercent: round(line.length * scale),
      angleDegrees: line.angle,
    })),
    totalWidthMm: safeSegments.reduce((total, segment) => total + segment.width_mm, 0),
  };
}

function connectedLines(segments: readonly BalconySegment[]): readonly RawLine[] {
  const lines: RawLine[] = [];
  let x = 0;
  let y = 0;
  let angle = 0;
  segments.forEach((segment, index) => {
    if (index > 0) {
      angle += safeTurn(segment.turn_degrees);
    }
    lines.push({
      label: segment.label,
      widthMm: segment.width_mm,
      x,
      y,
      length: segment.width_mm,
      angle,
    });
    const radians = (angle * Math.PI) / 180;
    x += Math.cos(radians) * segment.width_mm;
    y += Math.sin(radians) * segment.width_mm;
  });
  return lines;
}

function uShapeLines(segments: readonly BalconySegment[]): readonly RawLine[] {
  const front = segments[0]!;
  const right = segments[1]!;
  const left = segments[2]!;
  const direction = safeTurn(right.turn_degrees) || 90;
  return [
    {
      label: front.label,
      widthMm: front.width_mm,
      x: 0,
      y: 0,
      length: front.width_mm,
      angle: 0,
    },
    {
      label: right.label,
      widthMm: right.width_mm,
      x: front.width_mm,
      y: 0,
      length: right.width_mm,
      angle: direction,
    },
    {
      label: left.label,
      widthMm: left.width_mm,
      x: 0,
      y: 0,
      length: left.width_mm,
      angle: direction,
    },
  ];
}

function safeTurn(value: number): -90 | 0 | 90 {
  return value === -90 || value === 90 ? value : 0;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
