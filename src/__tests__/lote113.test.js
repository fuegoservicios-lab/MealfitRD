// [P1-PLAN-LOTE-113] El OTA se deja ver: revisa al volver a la app (no cada hora), avisa cuando hay un paquete
// preparado —una vez por paquete— y confirma cuando el paquete nuevo ya corre.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const http = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../config/platform', () => ({ isNativeApp: () => true, nativeHttpGet: (o) => http.get(o) }));
vi.mock('../utils/observability', () => ({ captureException: vi.fn() }));
const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
const plugin = vi.hoisted(() => ({
    ready: vi.fn(), getVersionCode: vi.fn(), getCurrentBundle: vi.fn(), getNextBundle: vi.fn(),
    getBundles: vi.fn(), downloadBundle: vi.fn(), setNextBundle: vi.fn(), reset: vi.fn(),
}));
vi.mock('@capawesome/capacitor-live-update', () => ({ LiveUpdate: plugin }));

import { revisarOta, iniciarOtaNativa, OTA_BASE_URL } from '../native/liveUpdate';

const ID = '20260919-090000';
const manifest = { schema: 1, enabled: true, reset: false, bundleId: ID, url: `${OTA_BASE_URL}${ID}.zip`, checksum: 'a'.repeat(64), minNativeBuild: 13 };

beforeEach(() => {
    Object.values(plugin).forEach((f) => f.mockReset());
    toast.mockReset(); toast.success.mockReset();
    localStorage.clear();
    vi.stubGlobal('__OTA_BUNDLE_ID__', '20260919-080000');
    plugin.getVersionCode.mockResolvedValue({ versionCode: '13' });
    plugin.getCurrentBundle.mockResolvedValue({ bundleId: '20260919-080000' });
    plugin.getNextBundle.mockResolvedValue({ bundleId: null });
    plugin.getBundles.mockResolvedValue({ bundleIds: [] });
    http.get.mockResolvedValue({ status: 200, data: manifest });
});

describe('el OTA se deja ver', () => {
    it('avisa UNA vez por paquete preparado', async () => {
        expect(await revisarOta(plugin)).toBe('preparado');
        expect(toast).toHaveBeenCalledTimes(1);
        expect(toast.mock.calls[0][0]).toBe('Actualización lista');
        expect(toast.mock.calls[0][1].description).toBe('Cierra la app del todo y vuelve a abrirla para aplicarla.');
        expect(await revisarOta(plugin)).toBe('preparado');
        expect(toast).toHaveBeenCalledTimes(1);
    });

    it('confirma la primera vez que corre un paquete nuevo, y solo esa', async () => {
        plugin.ready.mockResolvedValue({ rollback: false });
        iniciarOtaNativa();
        window.dispatchEvent(new Event('mealfit:app-ready'));
        await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith('App actualizada', { duration: 4000 }));
        expect(localStorage.getItem('mf_ota_visto')).toBe('20260919-080000');
    });

    it('revisa al volver a la app con un minuto de calma, no con una hora', () => {
        const src = readFileSync(join(__dirname, '..', 'native', 'liveUpdate.js'), 'utf8');
        expect(src).toContain('const REVISAR_CADA_MS = 60 * 1000;');
        expect(src).not.toContain('60 * 60 * 1000');
    });
});
