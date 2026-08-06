import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { BalconyEnclosureItem, WindowItem } from '../core/request.models';
import { buildJoineryPanels } from './joinery-geometry';
import { ProductPreviewComponent } from './product-preview.component';

const WINDOW_ITEM: WindowItem = {
  product_type: 'pvc_window',
  width_mm: 3000,
  height_mm: 2200,
  quantity: 1,
  color: 'anthracite',
  profile_series: null,
  notes: null,
  drawing_version: '2',
  catalog_answers: {},
  layout: 'window_door_window',
  opening_direction: 'right',
  glazing: 'double_glazing',
  divisions: [],
  panels: buildJoineryPanels('pvc_window', 'window_door_window', 'tilt_turn', 'right'),
};

describe('ProductPreviewComponent joinery drawing', () => {
  function createFixture(
    item: WindowItem = WINDOW_ITEM,
  ): ComponentFixture<ProductPreviewComponent> {
    const fixture = TestBed.createComponent(ProductPreviewComponent);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('productName', 'PVC pencere');
    fixture.detectChanges();
    return fixture;
  }

  it('renders mixed window and door panels in one measured drawing', () => {
    const element = createFixture().nativeElement as HTMLElement;

    expect(element.querySelectorAll('.joinery-panel')).toHaveLength(3);
    expect(element.querySelectorAll('[data-panel-role="door"]')).toHaveLength(1);
    expect(element.querySelectorAll('[data-record-axis="vertical"]')).toHaveLength(2);
    expect(element.querySelectorAll('[data-marker-kind="turn"]')).toHaveLength(6);
    expect(element.querySelectorAll('[data-marker-kind="tilt"]')).toHaveLength(6);
    expect(element.querySelectorAll('.joinery-handle')).toHaveLength(3);
    expect(element.querySelector('svg')?.getAttribute('aria-label')).toContain(
      'PVC kapı + pencere',
    );
    expect(element.querySelector('.joinery-legend')?.textContent).toContain('Çift açılım');
    expect(element.querySelector('.joinery-legend')?.textContent).toContain('Sağ menteşe');
  });

  it('derives a visible mullion and opening symbols for legacy double-sash items', () => {
    const item: WindowItem = {
      ...WINDOW_ITEM,
      drawing_version: '1',
      layout: 'double_sash',
      panels: undefined,
    };
    const element = createFixture(item).nativeElement as HTMLElement;

    expect(element.querySelectorAll('.joinery-panel')).toHaveLength(2);
    expect(element.querySelectorAll('[data-record-axis="vertical"]')).toHaveLength(1);
    expect(element.querySelectorAll('[data-marker-kind="turn"]')).toHaveLength(4);
  });

  it('renders a selected panel as opaque panel infill', () => {
    const item: WindowItem = {
      ...WINDOW_ITEM,
      layout: 'single_sash',
      glazing: 'panel',
      panels: buildJoineryPanels('pvc_window', 'single_sash', 'turn', 'right'),
    };
    const element = createFixture(item).nativeElement as HTMLElement;

    expect(element.querySelector('.joinery-glass')?.getAttribute('data-surface')).toBe('panel');
  });

  it('renders physical profiles and an equal-glass summary for every L facade', () => {
    const balcony: BalconyEnclosureItem = {
      product_type: 'balcony_enclosure',
      width_mm: 4000,
      height_mm: 1700,
      quantity: 1,
      color: 'anthracite',
      profile_series: 'Test seri',
      notes: null,
      drawing_version: '2',
      catalog_answers: {},
      system_type: 'folding',
      enclosure_shape: 'l_shape',
      roof_required: false,
      parapet_type: 'masonry',
      segments: [
        { label: 'A · Ana cephe', width_mm: 4000, turn_degrees: 0 },
        { label: 'B · Yan cephe', width_mm: 1800, turn_degrees: 90 },
      ],
      profile_spec: {
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
      },
    };
    const fixture = TestBed.createComponent(ProductPreviewComponent);
    fixture.componentRef.setInput('item', balcony);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelectorAll('.balcony-axis-cell[data-kind="glass"]')).toHaveLength(4);
    expect(element.querySelectorAll('.balcony-axis-cell[data-kind="corner-profile"]')).toHaveLength(
      1,
    );
    expect(element.querySelectorAll('.balcony-elevation-summary article')).toHaveLength(2);
    expect(element.querySelector('.balcony-elevation-summary')?.textContent).toContain(
      'A · Ana cephe',
    );
    expect(element.querySelector('.balcony-elevation-summary')?.textContent).toContain(
      '4 eşit cam',
    );
    expect(element.querySelector('.balcony-elevation-summary')?.textContent).toContain(
      '2 eşit cam',
    );
  });
});
