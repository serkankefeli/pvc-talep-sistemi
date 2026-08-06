import { describe, expect, it } from 'vitest';
import { BalconyEnclosureItem, BalconyProfileSpec } from '../core/request.models';
import {
  calculateBalconyElevationGeometry,
  DEFAULT_BALCONY_PROFILE_SPEC,
} from './balcony-elevation-geometry';

const PROFILE: BalconyProfileSpec = {
  edge_profile_mm: 50,
  mullion_profile_mm: 35,
  corner_profile_mm: 100,
  top_profile_mm: 45,
  bottom_profile_mm: 55,
  mounting_gap_mm: 5,
  min_glass_width_mm: 300,
  target_glass_width_mm: 850,
  max_glass_width_mm: 1050,
  min_panel_count: 1,
  max_panel_count: 20,
};

function balcony(
  shape: string,
  widths: readonly number[],
  overrides: Partial<BalconyEnclosureItem> = {},
): BalconyEnclosureItem {
  return {
    product_type: 'balcony_enclosure',
    width_mm: widths[0] ?? 1000,
    height_mm: 1700,
    quantity: 1,
    color: 'white',
    profile_series: 'Test seri',
    notes: null,
    drawing_version: '1',
    catalog_answers: {},
    system_type: 'folding',
    enclosure_shape: shape,
    roof_required: false,
    parapet_type: 'masonry',
    segments: widths.map((width, index) => ({
      label: `${String.fromCharCode(65 + index)} · Cephe`,
      width_mm: width,
      turn_degrees: index === 0 ? 0 : 90,
    })),
    profile_spec: PROFILE,
    ...overrides,
  };
}

describe('calculateBalconyElevationGeometry', () => {
  it('makes every clear glass equal and closes the exact width and height equations', () => {
    const geometry = calculateBalconyElevationGeometry(balcony('straight', [4000]));
    const glasses = geometry.cells.filter((cell) => cell.kind === 'glass');

    expect(glasses).toHaveLength(geometry.panelCount);
    expect(new Set(glasses.map((cell) => cell.widthMm))).toHaveLength(1);
    expect(
      geometry.totalMountingGapMm + geometry.totalProfileWidthMm + geometry.totalGlassWidthMm,
    ).toBeCloseTo(4000, 8);
    expect(geometry.calculatedWidthMm).toBeCloseTo(4000, 8);
    expect(geometry.equationErrorMm).toBeCloseTo(0, 8);
    expect(geometry.calculatedHeightMm).toBeCloseTo(1700, 8);
    expect(geometry.heightEquationErrorMm).toBeCloseTo(0, 8);
  });

  it('assigns wall and corner profiles to both faces of an L balcony', () => {
    const item = balcony('l_shape', [4000, 1800]);
    const faceA = calculateBalconyElevationGeometry(item, 0);
    const faceB = calculateBalconyElevationGeometry(item, 1);

    expect([faceA.startRole, faceA.endRole]).toEqual(['edge', 'corner']);
    expect([faceB.startRole, faceB.endRole]).toEqual(['corner', 'edge']);
    expect(faceA.startMountingGapMm).toBe(5);
    expect(faceA.endMountingGapMm).toBe(0);
    expect(faceB.startMountingGapMm).toBe(0);
    expect(faceB.endMountingGapMm).toBe(5);
    expect(faceA.endProfileWidthMm).toBe(100);
    expect(faceB.startProfileWidthMm).toBe(100);
    expect(faceA.calculatedWidthMm).toBeCloseTo(4000, 8);
    expect(faceB.calculatedWidthMm).toBeCloseTo(1800, 8);
  });

  it('uses two corner profiles on the front and one on each side of a U balcony', () => {
    const item = balcony('u_shape', [4200, 1600, 2100]);
    const front = calculateBalconyElevationGeometry(item, 0);
    const right = calculateBalconyElevationGeometry(item, 1);
    const left = calculateBalconyElevationGeometry(item, 2);

    expect([front.startRole, front.endRole]).toEqual(['corner', 'corner']);
    expect([right.startRole, right.endRole]).toEqual(['corner', 'edge']);
    expect([left.startRole, left.endRole]).toEqual(['corner', 'edge']);
    expect(front.totalMountingGapMm).toBe(0);
    expect(right.totalMountingGapMm).toBe(5);
    expect(left.totalMountingGapMm).toBe(5);
  });

  it('chooses the allowed panel count nearest the target clear glass width without a six-panel cap', () => {
    const geometry = calculateBalconyElevationGeometry(balcony('straight', [10_000]));

    expect(geometry.panelCount).toBeGreaterThan(6);
    expect(geometry.panelCount).toBeGreaterThanOrEqual(PROFILE.min_panel_count);
    expect(geometry.panelCount).toBeLessThanOrEqual(PROFILE.max_panel_count);
    expect(geometry.glassWidthMm).toBeGreaterThanOrEqual(PROFILE.min_glass_width_mm);
    expect(geometry.glassWidthMm).toBeLessThanOrEqual(PROFILE.max_glass_width_mm);
  });

  it('marks balcony guillotine glazing as horizontal', () => {
    const geometry = calculateBalconyElevationGeometry(
      balcony('straight', [3000], { system_type: 'guillotine' }),
    );
    const glassRows = geometry.cells.filter((cell) => cell.kind === 'glass');

    expect(geometry.orientation).toBe('horizontal');
    expect(geometry.primaryAxis).toBe('y');
    expect(glassRows).toHaveLength(geometry.panelCount);
    expect(new Set(glassRows.map((cell) => cell.widthMm))).toHaveLength(1);
    expect(geometry.glassWidthMm).toBeCloseTo(2890, 8);
    expect(geometry.calculatedWidthMm).toBeCloseTo(3000, 8);
    expect(geometry.calculatedHeightMm).toBeCloseTo(1700, 8);
    expect(
      geometry.totalVerticalMountingGapMm +
        geometry.totalProfileHeightMm +
        geometry.totalGlassHeightMm,
    ).toBeCloseTo(1700, 8);
  });

  it('uses a safe exported default when an old request has no profile snapshot', () => {
    const geometry = calculateBalconyElevationGeometry(
      balcony('straight', [3000], { profile_spec: null }),
    );

    expect(geometry.profileSpec).toEqual(DEFAULT_BALCONY_PROFILE_SPEC);
    expect(geometry.calculatedWidthMm).toBeCloseTo(3000, 8);
    expect(geometry.glassWidthMm).toBeGreaterThan(0);
    expect(geometry.usedFallback).toBe(true);
  });

  it('keeps the equation finite when configured profiles cannot physically fit', () => {
    const oversized: BalconyProfileSpec = {
      ...PROFILE,
      edge_profile_mm: 900,
      corner_profile_mm: 900,
      mullion_profile_mm: 900,
      min_panel_count: 3,
      max_panel_count: 3,
    };
    const geometry = calculateBalconyElevationGeometry(
      balcony('straight', [1000], { profile_spec: oversized }),
    );

    expect(geometry.panelCount).toBe(3);
    expect(geometry.glassWidthMm).toBeGreaterThanOrEqual(1);
    expect(geometry.calculatedWidthMm).toBeCloseTo(1000, 8);
    expect(geometry.usedFallback).toBe(true);
    expect(geometry.cells.every((cell) => Number.isFinite(cell.widthPercent))).toBe(true);
  });
});
