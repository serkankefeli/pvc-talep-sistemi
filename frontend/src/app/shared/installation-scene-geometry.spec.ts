import { describe, expect, it } from 'vitest';
import {
  calculateInstallationSceneGeometry,
  installationReferenceFor,
  resolveInstallationSceneKind,
} from './installation-scene-geometry';

describe('installation scene geometry', () => {
  it('keeps the opening empty and uses the standard reference without measurements', () => {
    const geometry = calculateInstallationSceneGeometry({
      productType: 'pvc_window',
      measurementVariant: 'opening',
      widthMm: 0,
      heightMm: 0,
      measurementReady: false,
    });

    expect(geometry.ready).toBe(false);
    expect(geometry.standardWidthMm).toBe(1200);
    expect(geometry.standardHeightMm).toBe(1400);
    expect(geometry.openingWidthPercent).toBeGreaterThan(0);
    expect(geometry.openingHeightPercent).toBeGreaterThan(0);
  });

  it('scales each dimension against the same physical standard', () => {
    const standard = calculateInstallationSceneGeometry({
      productType: 'pvc_window',
      measurementVariant: 'opening',
      widthMm: 1200,
      heightMm: 1400,
      measurementReady: true,
    });
    const wider = calculateInstallationSceneGeometry({
      productType: 'pvc_window',
      measurementVariant: 'opening',
      widthMm: 1800,
      heightMm: 1400,
      measurementReady: true,
    });

    expect(wider.openingWidthPercent).toBeCloseTo(standard.openingWidthPercent * 1.5, 2);
    expect(wider.openingHeightPercent).toBe(standard.openingHeightPercent);
  });

  it('fits very large products into the scene without changing their aspect ratio', () => {
    const geometry = calculateInstallationSceneGeometry({
      productType: 'pvc_window',
      measurementVariant: 'opening',
      widthMm: 6000,
      heightMm: 4000,
      measurementReady: true,
    });
    const renderedPixelRatio = (geometry.openingWidthPercent * 1.6) / geometry.openingHeightPercent;

    expect(geometry.fittedToScene).toBe(true);
    expect(geometry.openingWidthPercent).toBeLessThanOrEqual(72);
    expect(geometry.openingHeightPercent).toBeLessThanOrEqual(70);
    expect(renderedPixelRatio).toBeCloseTo(6000 / 4000, 2);
  });

  it('anchors doors lower than windows', () => {
    const door = calculateInstallationSceneGeometry({
      productType: 'pvc_door',
      measurementVariant: 'opening',
      widthMm: 900,
      heightMm: 2100,
      measurementReady: true,
    });
    const window = calculateInstallationSceneGeometry({
      productType: 'pvc_window',
      measurementVariant: 'opening',
      widthMm: 1200,
      heightMm: 1400,
      measurementReady: true,
    });

    expect(door.kind).toBe('door');
    expect(door.anchorBottomPercent).toBeLessThan(window.anchorBottomPercent);
  });

  it('gives wide special systems a larger ground-level drawing area', () => {
    const geometry = calculateInstallationSceneGeometry({
      productType: 'hebeschiebe_system',
      measurementVariant: 'opening',
      widthMm: 6000,
      heightMm: 2000,
      measurementReady: true,
    });
    const renderedPixelRatio = (geometry.openingWidthPercent * 1.6) / geometry.openingHeightPercent;

    expect(geometry.kind).toBe('wide-system');
    expect(geometry.openingWidthPercent).toBe(90);
    expect(geometry.anchorBottomPercent).toBe(8);
    expect(renderedPixelRatio).toBeCloseTo(3, 2);
    expect(geometry.standardWidthMm).toBe(4000);
    expect(geometry.standardHeightMm).toBe(2400);
  });

  it('uses the flyscreen usage and custom product measurement variant for the scene', () => {
    expect(resolveInstallationSceneKind('flyscreen', 'opening', 'door')).toBe('door');
    expect(resolveInstallationSceneKind('flyscreen', 'opening', 'balcony')).toBe('balcony');
    expect(resolveInstallationSceneKind('pergola', 'balcony')).toBe('balcony');
    expect(resolveInstallationSceneKind('composite', 'facade')).toBe('facade');
  });

  it('returns safe generic standard references', () => {
    expect(installationReferenceFor('custom-opening', 'opening')).toEqual({
      widthMm: 1000,
      heightMm: 1000,
    });
  });
});
