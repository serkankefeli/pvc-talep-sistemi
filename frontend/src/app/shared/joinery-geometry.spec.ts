import { describe, expect, it } from 'vitest';
import { JoineryPanel, WindowItem } from '../core/request.models';
import {
  buildJoineryPanels,
  calculateJoineryGeometry,
  joinerySurfaceKind,
  resolveJoineryPanels,
} from './joinery-geometry';

const BASE_WINDOW: WindowItem = {
  product_type: 'pvc_window',
  width_mm: 2400,
  height_mm: 2100,
  quantity: 1,
  color: 'white',
  profile_series: null,
  notes: null,
  drawing_version: '1',
  catalog_answers: {},
  layout: 'single_sash',
  opening_direction: 'right',
  glazing: 'double_glazing',
  divisions: [],
};

describe('joinery geometry', () => {
  it('distinguishes managed panel infill from glass infill', () => {
    expect(joinerySurfaceKind({ ...BASE_WINDOW, glazing: 'double_glazing' })).toBe('glass');
    expect(joinerySurfaceKind({ ...BASE_WINDOW, glazing: 'panel' })).toBe('panel');
    expect(joinerySurfaceKind({ ...BASE_WINDOW, glazing: 'sandwich_panel' })).toBe('panel');
  });

  it('builds a window-door-window composition with stable roles and records', () => {
    const panels = buildJoineryPanels('pvc_window', 'window_door_window', 'tilt_turn', 'right');
    const item: WindowItem = {
      ...BASE_WINDOW,
      drawing_version: '2',
      layout: 'window_door_window',
      panels,
    };
    const geometry = calculateJoineryGeometry(item, { x: 10, y: 20, width: 300, height: 220 });

    expect(panels.map((entry) => entry.role)).toEqual(['window', 'door', 'window']);
    expect(panels.map((entry) => entry.width_percent)).toEqual([28, 44, 28]);
    expect(geometry.panels).toHaveLength(3);
    expect(geometry.records.filter((record) => record.axis === 'vertical')).toHaveLength(2);
    expect(geometry.panels[1].handle).not.toBeNull();
  });

  it('uses separate turn and tilt symbols for a tilt-turn sash', () => {
    const item: WindowItem = {
      ...BASE_WINDOW,
      layout: 'tilt_turn',
    };
    const panel = calculateJoineryGeometry(item, { x: 0, y: 0, width: 100, height: 100 }).panels[0];

    expect(panel.markers.filter((marker) => marker.kind === 'turn')).toHaveLength(2);
    expect(panel.markers.filter((marker) => marker.kind === 'tilt')).toHaveLength(2);
    expect(panel.handle).not.toBeNull();
  });

  it('marks fixed glazing with a plus and omits its handle', () => {
    const item: WindowItem = {
      ...BASE_WINDOW,
      layout: 'fixed',
      opening_direction: 'none',
    };
    const panel = calculateJoineryGeometry(item, { x: 0, y: 0, width: 100, height: 100 }).panels[0];

    expect(panel.markers).toHaveLength(2);
    expect(panel.markers.every((marker) => marker.kind === 'fixed')).toBe(true);
    expect(panel.handle).toBeNull();
  });

  it('derives four independently rendered cells for a legacy grid item', () => {
    const panels = resolveJoineryPanels({ ...BASE_WINDOW, layout: 'custom_grid' });

    expect(panels).toHaveLength(4);
    expect(panels.slice(0, 2).every((entry) => entry.opening === 'fixed')).toBe(true);
    expect(panels.slice(2).map((entry) => entry.hinge)).toEqual(['left', 'right']);
  });

  it('falls back to the selected template when supplied panels overlap', () => {
    const invalidPanels: readonly JoineryPanel[] = [
      {
        slot: 'left',
        label: 'Sol',
        role: 'window',
        x_percent: 0,
        y_percent: 0,
        width_percent: 70,
        height_percent: 100,
        opening: 'turn',
        hinge: 'left',
      },
      {
        slot: 'right',
        label: 'Sağ',
        role: 'window',
        x_percent: 50,
        y_percent: 0,
        width_percent: 50,
        height_percent: 100,
        opening: 'turn',
        hinge: 'right',
      },
    ];

    const panels = resolveJoineryPanels({
      ...BASE_WINDOW,
      layout: 'double_sash',
      panels: invalidPanels,
    });

    expect(panels).toHaveLength(2);
    expect(panels.map((entry) => entry.width_percent)).toEqual([50, 50]);
  });

  it('normalizes hinges that do not apply to fixed, tilt, or sliding panels', () => {
    expect(buildJoineryPanels('pvc_window', 'single_sash', 'tilt', 'left')[0].hinge).toBe('none');
    expect(buildJoineryPanels('pvc_door', 'sliding', 'turn', 'right')).toEqual(
      expect.arrayContaining([expect.objectContaining({ hinge: 'none' })]),
    );
  });

  it('uses the managed profile millimetres for glass insets and mullions', () => {
    const item = {
      ...BASE_WINDOW,
      drawing_version: '2' as const,
      layout: 'double_sash' as const,
      profile_spec: {
        edge_profile_mm: 50,
        mullion_profile_mm: 70,
        corner_profile_mm: 90,
        top_profile_mm: 40,
        bottom_profile_mm: 60,
        mounting_gap_mm: 10,
        min_glass_width_mm: 400,
        target_glass_width_mm: 800,
        max_glass_width_mm: 1000,
        min_panel_count: 1,
        max_panel_count: 10,
      },
    } satisfies WindowItem;

    const geometry = calculateJoineryGeometry(item, {
      x: 0,
      y: 0,
      width: 240,
      height: 210,
    });
    const first = geometry.panels[0]!;
    const mullion = geometry.records.find((record) => record.axis === 'vertical');

    expect(first.glass.x - first.frame.x).toBeCloseTo(5, 8);
    expect(first.glass.y - first.frame.y).toBeCloseTo(4, 8);
    expect(first.frame.y + first.frame.height - (first.glass.y + first.glass.height)).toBeCloseTo(
      6,
      8,
    );
    expect(mullion?.width).toBeCloseTo(7, 8);
  });
});
