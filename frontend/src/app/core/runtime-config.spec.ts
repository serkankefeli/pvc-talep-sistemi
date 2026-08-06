import { DEFAULT_RUNTIME_CONFIG, loadRuntimeConfig } from './runtime-config';

describe('runtime config', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('supports an empty API URL for same-origin Docker proxying', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ apiUrl: '' }),
      }),
    );

    await expect(loadRuntimeConfig()).resolves.toEqual({ apiUrl: '' });
  });

  it('normalizes an absolute API URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ apiUrl: 'https://api.example.test///' }),
      }),
    );

    await expect(loadRuntimeConfig()).resolves.toEqual({ apiUrl: 'https://api.example.test' });
  });

  it('uses the safe default when the runtime file is invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ apiUrl: '/unexpected-relative-path' }),
      }),
    );

    await expect(loadRuntimeConfig()).resolves.toEqual(DEFAULT_RUNTIME_CONFIG);
  });
});
