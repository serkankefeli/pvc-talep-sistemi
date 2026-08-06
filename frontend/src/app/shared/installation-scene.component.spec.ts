import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import {
  BalconyEnclosureItem,
  BalconyProfileSpec,
  PublicRequestItem,
  WindowItem,
} from '../core/request.models';
import { buildJoineryPanels } from './joinery-geometry';
import { InstallationSceneComponent } from './installation-scene.component';

const WINDOW_ITEM: WindowItem = {
  product_type: 'pvc_window',
  width_mm: 0,
  height_mm: 0,
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

const BALCONY_PROFILE: BalconyProfileSpec = {
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

const BALCONY_ITEM: BalconyEnclosureItem = {
  product_type: 'balcony_enclosure',
  width_mm: 4000,
  height_mm: 1700,
  quantity: 1,
  color: 'white',
  profile_series: 'Test seri',
  notes: null,
  drawing_version: '1',
  catalog_answers: {},
  system_type: 'folding',
  enclosure_shape: 'l_shape',
  roof_required: false,
  parapet_type: 'masonry',
  segments: [
    { label: 'A · Ana cephe', width_mm: 4000, turn_degrees: 0 },
    { label: 'B · Yan cephe', width_mm: 1800, turn_degrees: 90 },
  ],
  profile_spec: BALCONY_PROFILE,
};

describe('InstallationSceneComponent', () => {
  function createFixture(
    item: PublicRequestItem = WINDOW_ITEM,
    measurementReady = false,
    balconySegmentIndex = 0,
  ): ComponentFixture<InstallationSceneComponent> {
    const fixture = TestBed.createComponent(InstallationSceneComponent);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('productName', 'PVC pencere');
    fixture.componentRef.setInput('measurementVariant', 'opening');
    fixture.componentRef.setInput('measurementReady', measurementReady);
    fixture.componentRef.setInput('balconySegmentIndex', balconySegmentIndex);
    fixture.detectChanges();
    return fixture;
  }

  it('shows an empty architectural opening before both measurements are ready', () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.mounting-opening')).toBeTruthy();
    expect(element.querySelector('[data-testid="installed-unit"]')).toBeNull();
    expect(element.textContent).toContain('Boş pencere açıklığı');
    expect(element.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain(
      'Ölçüler girildiğinde',
    );
  }, 30_000);

  it('places the product and dimension labels after valid measurements', () => {
    const fixture = createFixture({ ...WINDOW_ITEM, width_mm: 1200, height_mm: 1400 }, true);
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('[data-testid="installed-unit"]')).toBeTruthy();
    expect(element.textContent).toContain('1200 × 1400 mm');
    expect(element.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain(
      '1200 milimetre genişlik',
    );
  });

  it('uses the detailed joinery drawing for a combined window and door', () => {
    const item: WindowItem = {
      ...WINDOW_ITEM,
      width_mm: 3200,
      height_mm: 2200,
      drawing_version: '2',
      layout: 'window_door_window',
      panels: buildJoineryPanels('pvc_window', 'window_door_window', 'tilt_turn', 'right'),
    };
    const fixture = createFixture(item, true);
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('[data-testid="joinery-drawing"]')).toBeTruthy();
    expect(element.querySelectorAll('[data-panel-role="window"]')).toHaveLength(2);
    expect(element.querySelectorAll('[data-panel-role="door"]')).toHaveLength(1);
    expect(element.querySelectorAll('[data-record-axis="vertical"]')).toHaveLength(2);
    expect(element.querySelectorAll('[data-marker-kind="tilt"]')).toHaveLength(6);
    expect(element.querySelectorAll('.joinery-handle')).toHaveLength(3);
    expect(element.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain(
      'PVC kapı + pencere',
    );
    expect(element.querySelector('.joinery-summary')?.textContent).toContain('Çift açılım');
  });

  it('renders the selected L face with separate millimetre-based glass and profile cells', () => {
    const fixture = createFixture({ ...BALCONY_ITEM, width_mm: 1800 }, true, 1);
    const component = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;
    const geometry = component.balconyGeometry()!;
    const glasses = [...element.querySelectorAll<HTMLElement>('.balcony-glass')];

    expect(element.querySelector('[data-testid="balcony-profile-drawing"]')).toBeTruthy();
    expect(geometry.segmentLabel).toBe('B · Yan cephe');
    expect(geometry.startRole).toBe('corner');
    expect(geometry.endRole).toBe('edge');
    expect(glasses).toHaveLength(geometry.panelCount);
    expect(new Set(glasses.map((glass) => glass.dataset['widthMm']))).toHaveLength(1);
    expect(element.querySelectorAll('.balcony-mullion')).toHaveLength(geometry.panelCount - 1);
    expect(geometry.calculatedWidthMm).toBeCloseTo(1800, 8);
    expect(element.querySelector('[data-testid="balcony-width-equation"]')?.textContent).toContain(
      '= 1.800 mm',
    );
  });

  it('renders balcony guillotine glass with horizontal divisions', () => {
    const fixture = createFixture(
      { ...BALCONY_ITEM, system_type: 'guillotine', enclosure_shape: 'straight' },
      true,
    );
    const element = fixture.nativeElement as HTMLElement;
    const drawing = element.querySelector('[data-testid="balcony-profile-drawing"]');

    expect(drawing?.getAttribute('data-orientation')).toBe('horizontal');
    expect(drawing?.classList.contains('is-guillotine')).toBe(true);
    expect(element.querySelectorAll('.guillotine-glass').length).toBeGreaterThan(0);
  });
});
