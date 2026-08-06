import { BalconySegment } from '../core/request.models';
import { calculateBalconyPlanGeometry } from './balcony-plan-geometry';

describe('calculateBalconyPlanGeometry', () => {
  const front: BalconySegment = {
    label: 'A · Ana cephe',
    width_mm: 4000,
    turn_degrees: 0,
  };

  it('creates two perpendicular measured lines for an L-shaped balcony', () => {
    const geometry = calculateBalconyPlanGeometry(
      [
        front,
        {
          label: 'B · Yan cephe',
          width_mm: 1800,
          turn_degrees: 90,
        },
      ],
      'l_shape',
    );

    expect(geometry.lines).toHaveLength(2);
    expect(geometry.lines[0]?.angleDegrees).toBe(0);
    expect(geometry.lines[1]?.angleDegrees).toBe(90);
    expect(geometry.totalWidthMm).toBe(5800);
    expect(geometry.lines.every((line) => Number.isFinite(line.xPercent))).toBe(true);
  });

  it('places both side faces at opposite ends of the front face for a U plan', () => {
    const geometry = calculateBalconyPlanGeometry(
      [
        front,
        {
          label: 'B · Sağ yan',
          width_mm: 1600,
          turn_degrees: 90,
        },
        {
          label: 'C · Sol yan',
          width_mm: 1400,
          turn_degrees: 90,
        },
      ],
      'u_shape',
    );

    expect(geometry.lines).toHaveLength(3);
    expect(geometry.lines[1]?.xPercent).not.toBe(geometry.lines[2]?.xPercent);
    expect(geometry.totalWidthMm).toBe(7000);
  });

  it('returns an empty bounded plan for missing measurements', () => {
    expect(calculateBalconyPlanGeometry([], 'custom')).toEqual({
      lines: [],
      totalWidthMm: 0,
    });
  });
});
