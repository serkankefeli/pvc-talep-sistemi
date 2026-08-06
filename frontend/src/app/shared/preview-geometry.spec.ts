import {
  BalconyEnclosureItem,
  FacadeCladdingItem,
  GenericProductItem,
  GuillotineGlassItem,
  WindowItem,
} from '../core/request.models';
import { calculatePreviewGeometry, frameColor } from './preview-geometry';

const windowItem: WindowItem = {
  product_type: 'pvc_window',
  width_mm: 1200,
  height_mm: 1500,
  quantity: 1,
  color: 'white',
  profile_series: null,
  notes: null,
  drawing_version: '1',
  catalog_answers: {},
  layout: 'double_sash',
  opening_direction: 'right',
  glazing: 'double_glazing',
  divisions: [{ axis: 'vertical', position_percent: 50 }],
};

describe('calculatePreviewGeometry', () => {
  it('preserves millimetre proportions inside the drawing area', () => {
    const geometry = calculatePreviewGeometry(windowItem);

    expect(geometry.frame.width / geometry.frame.height).toBeCloseTo(1200 / 1500, 6);
    expect(geometry.frame.height).toBeCloseTo(242, 6);
    expect(geometry.frame.x).toBeGreaterThan(82);
  });

  it('places a percentage division on the calculated frame', () => {
    const geometry = calculatePreviewGeometry(windowItem);
    const division = geometry.divisions[0];

    expect(division).toBeDefined();
    expect(division?.x1).toBeCloseTo(geometry.frame.x + geometry.frame.width / 2, 6);
    expect(division?.y1).toBeCloseTo(geometry.frame.y, 6);
    expect(division?.y2).toBeCloseTo(geometry.frame.y + geometry.frame.height, 6);
  });

  it('uses managed PVC profile millimetres for the visible frame insets', () => {
    const geometry = calculatePreviewGeometry({
      ...windowItem,
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
    } satisfies WindowItem);
    const scale = geometry.frame.height / windowItem.height_mm;

    expect(geometry.inner.x - geometry.frame.x).toBeCloseTo(50 * scale, 6);
    expect(geometry.inner.y - geometry.frame.y).toBeCloseTo(40 * scale, 6);
    expect(
      geometry.frame.y + geometry.frame.height - (geometry.inner.y + geometry.inner.height),
    ).toBeCloseTo(60 * scale, 6);
  });

  it('derives facade panel lines from typed orientation', () => {
    const facade: FacadeCladdingItem = {
      product_type: 'facade_cladding',
      width_mm: 9000,
      height_mm: 4500,
      quantity: 1,
      color: 'grey',
      profile_series: null,
      notes: null,
      drawing_version: '1',
      catalog_answers: {},
      cladding_type: 'composite_panel',
      panel_orientation: 'horizontal',
      installation_system: 'concealed_fixing',
      insulation_required: true,
      substructure_material: 'aluminium',
    };

    const geometry = calculatePreviewGeometry(facade);
    expect(geometry.divisions).toHaveLength(2);
    expect(geometry.divisions.every((line) => line.y1 === line.y2)).toBe(true);
  });

  it('uses only allow-listed visual colors', () => {
    expect(frameColor('anthracite')).toBe('#3c4547');
    expect(frameColor('<script>alert(1)</script>')).toBe('#f7f7f3');
  });

  it('draws one horizontal division between each guillotine panel', () => {
    const guillotine: GuillotineGlassItem = {
      product_type: 'guillotine_glass',
      width_mm: 3000,
      height_mm: 2400,
      quantity: 1,
      color: 'anthracite',
      profile_series: null,
      notes: null,
      drawing_version: '1',
      catalog_answers: {},
      system_type: 'motorized',
      panel_count: 4,
      glass_type: 'tempered',
      bottom_fixed: true,
    };

    const geometry = calculatePreviewGeometry(guillotine);
    expect(geometry.divisions).toHaveLength(3);
    expect(geometry.divisions.every((line) => line.y1 === line.y2)).toBe(true);
  });

  it('derives each balcony facade division from its millimetre profile geometry', () => {
    const balcony: BalconyEnclosureItem = {
      product_type: 'balcony_enclosure',
      width_mm: 4500,
      height_mm: 1700,
      quantity: 1,
      color: 'white',
      profile_series: null,
      notes: null,
      drawing_version: '1',
      catalog_answers: {},
      system_type: 'folding',
      enclosure_shape: 'l_shape',
      roof_required: false,
      parapet_type: 'masonry',
      segments: [
        {
          label: 'A · Ana cephe',
          width_mm: 4500,
          turn_degrees: 0,
        },
        {
          label: 'B · Yan cephe',
          width_mm: 1700,
          turn_degrees: 90,
        },
      ],
    };

    const mainFacade = calculatePreviewGeometry(balcony, 0);
    const sideFacade = calculatePreviewGeometry(balcony, 1);

    expect(mainFacade.divisions).toHaveLength(4);
    expect(mainFacade.divisions.every((line) => line.x1 === line.x2)).toBe(true);
    expect(sideFacade.divisions).toHaveLength(1);
    expect(sideFacade.divisions.every((line) => line.x1 === line.x2)).toBe(true);
    expect(sideFacade.frame.width / sideFacade.frame.height).toBeCloseTo(1, 6);
  });

  it('uses a safe proportional frame for an admin-created generic product', () => {
    const pergola: GenericProductItem = {
      product_type: 'pergola',
      width_mm: 4200,
      height_mm: 2600,
      quantity: 1,
      color: 'anthracite',
      profile_series: null,
      notes: null,
      drawing_version: '1',
      catalog_answers: { roof_material: 'polycarbonate' },
    };

    const geometry = calculatePreviewGeometry(pergola);

    expect(geometry.frame.width / geometry.frame.height).toBeCloseTo(4200 / 2600, 6);
    expect(geometry.divisions).toEqual([]);
    expect(geometry.opening).toEqual([]);
    expect(geometry.surfaceLines).toEqual([]);
  });
});
