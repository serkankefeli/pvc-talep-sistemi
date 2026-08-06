import { InjectionToken } from '@angular/core';

export interface RuntimeConfig {
  readonly apiUrl: string;
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  apiUrl: 'http://localhost:8000',
};

export const RUNTIME_CONFIG = new InjectionToken<RuntimeConfig>('runtime.config', {
  providedIn: 'root',
  factory: () => DEFAULT_RUNTIME_CONFIG,
});

function normalizeConfig(value: unknown): RuntimeConfig {
  if (typeof value === 'object' && value !== null && 'apiUrl' in value) {
    const apiUrl = typeof value.apiUrl === 'string' ? value.apiUrl.trim() : null;

    // An empty URL deliberately selects the browser's current origin. This is
    // used by the Docker image, where Nginx proxies /api/ to the API service.
    if (apiUrl === '') {
      return { apiUrl: '' };
    }

    if (apiUrl !== null && /^https?:\/\//i.test(apiUrl)) {
      return { apiUrl: apiUrl.replace(/\/+$/, '') };
    }
  }
  return DEFAULT_RUNTIME_CONFIG;
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    const response = await fetch('/config.json', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) {
      return DEFAULT_RUNTIME_CONFIG;
    }
    return normalizeConfig(await response.json());
  } catch {
    return DEFAULT_RUNTIME_CONFIG;
  }
}
