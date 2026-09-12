import { CatalogMeasurement } from '../core/catalog.models';

export type InstallationSceneKind = 'window' | 'door' | 'wide-system' | 'balcony' | 'facade';

export interface InstallationReference {
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface InstallationSceneGeometry {
  readonly kind: InstallationSceneKind;
  readonly ready: boolean;
  readonly openingWidthPercent: number;
  readonly openingHeightPercent: number;
  readonly anchorBottomPercent: number;
  readonly standardWidthMm: number;
  readonly standardHeightMm: number;
  readonly fittedToScene: boolean;
}

interface InstallationSceneInput {
  readonly productType: string;
  readonly measurementVariant: CatalogMeasurement['variant'];
  readonly usagePrimary?: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly measurementReady: boolean;
}

interface SceneProfile {
  readonly baseHeightPercent: number;
  readonly maxWidthPercent: number;
  readonly maxHeightPercent: number;
  readonly anchorBottomPercent: number;
}

const SCENE_ASPECT_RATIO = 16 / 10;

const SCENE_PROFILES: Readonly<Record<InstallationSceneKind, SceneProfile>> = {
  window: {
    baseHeightPercent: 58,
    maxWidthPercent: 72,
    maxHeightPercent: 70,
    anchorBottomPercent: 22,
  },
  door: {
    baseHeightPercent: 76,
    maxWidthPercent: 64,
    maxHeightPercent: 82,
    anchorBottomPercent: 8,
  },
  'wide-system': {
    baseHeightPercent: 72,
    maxWidthPercent: 90,
    maxHeightPercent: 78,
    anchorBottomPercent: 8,
  },
  balcony: {
    baseHeightPercent: 58,
    maxWidthPercent: 88,
    maxHeightPercent: 68,
    anchorBottomPercent: 18,
  },
  facade: {
    baseHeightPercent: 64,
    maxWidthPercent: 88,
    maxHeightPercent: 74,
    anchorBottomPercent: 12,
  },
};

const PRODUCT_REFERENCES: Readonly<Record<string, InstallationReference>> = {
  pvc_window: { widthMm: 1200, heightMm: 1400 },
  pvc_door: { widthMm: 900, heightMm: 2100 },
  flyscreen: { widthMm: 900, heightMm: 1200 },
  guillotine_glass: { widthMm: 3000, heightMm: 2400 },
  facade_cladding: { widthMm: 6000, heightMm: 3500 },
  balcony_enclosure: { widthMm: 4000, heightMm: 1600 },
  volkswagen_sliding_door: { widthMm: 3000, heightMm: 2200 },
  hebeschiebe_system: { widthMm: 4000, heightMm: 2400 },
  pivot_system: { widthMm: 1600, heightMm: 2400 },
  folding_system: { widthMm: 4500, heightMm: 2400 },
};

const GENERIC_REFERENCES: Readonly<Record<CatalogMeasurement['variant'], InstallationReference>> = {
  opening: { widthMm: 1000, heightMm: 1000 },
  balcony: { widthMm: 3000, heightMm: 1600 },
  facade: { widthMm: 5000, heightMm: 3000 },
};

export function resolveInstallationSceneKind(
  productType: string,
  measurementVariant: CatalogMeasurement['variant'],
  usagePrimary = '',
): InstallationSceneKind {
  if (
    productType === 'volkswagen_sliding_door' ||
    productType === 'hebeschiebe_system' ||
    productType === 'pivot_system' ||
    productType === 'folding_system'
  ) {
    return 'wide-system';
  }
  if (productType === 'pvc_door') {
    return 'door';
  }
  if (productType === 'balcony_enclosure' || productType === 'guillotine_glass') {
    return 'balcony';
  }
  if (productType === 'facade_cladding') {
    return 'facade';
  }
  if (productType === 'flyscreen') {
    if (usagePrimary === 'door') {
      return 'door';
    }
    if (usagePrimary === 'balcony') {
      return 'balcony';
    }
    return 'window';
  }
  if (productType === 'pvc_window') {
    return 'window';
  }
  if (measurementVariant === 'balcony') {
    return 'balcony';
  }
  if (measurementVariant === 'facade') {
    return 'facade';
  }
  return 'window';
}

export function installationReferenceFor(
  productType: string,
  measurementVariant: CatalogMeasurement['variant'],
): InstallationReference {
  return PRODUCT_REFERENCES[productType] ?? GENERIC_REFERENCES[measurementVariant];
}

export function calculateInstallationSceneGeometry(
  input: InstallationSceneInput,
): InstallationSceneGeometry {
  const kind = resolveInstallationSceneKind(
    input.productType,
    input.measurementVariant,
    input.usagePrimary,
  );
  const profile = SCENE_PROFILES[kind];
  const reference = installationReferenceFor(input.productType, input.measurementVariant);
  const ready =
    input.measurementReady &&
    Number.isFinite(input.widthMm) &&
    Number.isFinite(input.heightMm) &&
    input.widthMm > 0 &&
    input.heightMm > 0;
  const widthMm = ready ? input.widthMm : reference.widthMm;
  const heightMm = ready ? input.heightMm : reference.heightMm;

  const standardWidthPercent =
    (profile.baseHeightPercent * (reference.widthMm / reference.heightMm)) / SCENE_ASPECT_RATIO;
  const rawWidthPercent = standardWidthPercent * (widthMm / reference.widthMm);
  const rawHeightPercent = profile.baseHeightPercent * (heightMm / reference.heightMm);
  const fitScale = Math.min(
    1,
    profile.maxWidthPercent / rawWidthPercent,
    profile.maxHeightPercent / rawHeightPercent,
  );

  return {
    kind,
    ready,
    openingWidthPercent: round(rawWidthPercent * fitScale),
    openingHeightPercent: round(rawHeightPercent * fitScale),
    anchorBottomPercent: profile.anchorBottomPercent,
    standardWidthMm: reference.widthMm,
    standardHeightMm: reference.heightMm,
    fittedToScene: fitScale < 1,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
