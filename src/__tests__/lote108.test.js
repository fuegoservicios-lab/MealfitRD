// [P1-PLAN-LOTE-108] OTA de la app nativa: la decisión, el contrato productor↔consumidor
// del manifiesto, el zip hecho a mano y el candado de las dependencias nativas.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { join } from 'node:path';

const platform = vi.hoisted(() => ({ nativo: false }));
const http = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../config/platform', () => ({ isNativeApp: () => platform.nativo, nativeHttpGet: (o) => http.get(o) }));
vi.mock('../utils/observability', () => ({ captureException: vi.fn() }));

const plugin = vi.hoisted(() => ({
    ready: vi.fn(),
    getVersionCode: vi.fn(),
    getCurrentBundle: vi.fn(),
    getNextBundle: vi.fn(),
    getBundles: vi.fn(),
    downloadBundle: vi.fn(),
    setNextBundle: vi.fn(),
    reset: vi.fn(),
    reload: vi.fn(),
}));
vi.mock('@capawesome/capacitor-live-update', () => ({ LiveUpdate: plugin }));

import { decidirOta, revisarOta, iniciarOtaNativa, OTA_BASE_URL } from '../native/liveUpdate';
import { crearZip } from '../../scripts/lib/zipWriter.mjs';
import { construirManifiesto, otaStamp, OTA_BASE_URL as BASE_PRODUCTOR } from '../../scripts/build-ota-bundle.mjs';

const RAIZ = join(__dirname, '..', '..');
const SHA = 'a'.repeat(64);
const ID = '20260919-050000';
const manifest = (extra = {}) => ({
    schema: 1, enabled: true, reset: false, bundleId: ID, url: `${OTA_BASE_URL}${ID}.zip`,
    checksum: SHA, minNativeBuild: 13, ...extra,
});
const ctx = (extra = {}) => ({ manifest: manifest(), ownId: '20260918-000000', versionCode: '13', ...extra });

describe('decidirOta', () => {
    it('descarga un paquete posterior al que corre', () => {
        expect(decidirOta(ctx())).toEqual({ accion: 'descargar', motivo: 'paquete_nuevo' });
    });
    it.each([
        ['al_dia', { ownId: ID }],
        ['al_dia', { ownId: '20260920-000000' }],
        ['binario_antiguo', { versionCode: '12' }],
        ['build_desconocido', { versionCode: '' }],
        ['sin_id_propio', { ownId: '' }],
        ['bloqueado', { bloqueados: [ID] }],
        ['ya_preparado', { nextBundleId: ID }],
        ['apagado', { manifest: manifest({ enabled: false }) }],
        ['manifiesto_invalido', { manifest: manifest({ schema: 2 }) }],
        ['manifiesto_invalido', { manifest: null }],
        ['id_invalido', { manifest: manifest({ bundleId: '../x' }) }],
        ['url_ajena', { manifest: manifest({ url: `https://evil.example/ota/${ID}.zip` }) }],
        ['url_ajena', { manifest: manifest({ url: `${OTA_BASE_URL}otro.zip` }) }],
        ['checksum_invalido', { manifest: manifest({ checksum: 'abc' }) }],
        ['min_build_invalido', { manifest: manifest({ minNativeBuild: '13' }) }],
    ])('no hace nada: %s', (motivo, extra) => {
        expect(decidirOta(ctx(extra))).toEqual({ accion: 'nada', motivo });
    });
    it('el pánico solo deshace si hay un paquete OTA puesto', () => {
        const m = manifest({ reset: true });
        expect(decidirOta(ctx({ manifest: m, currentBundleId: ID }))).toEqual({ accion: 'reset', motivo: 'reset_pedido' });
        expect(decidirOta(ctx({ manifest: m, currentBundleId: null })).accion).toBe('nada');
    });
});

describe('contrato productor ↔ consumidor', () => {
    it('lo que escribe el script lo acepta la app', () => {
        const zip = crearZip([{ name: 'index.html', data: Buffer.from('<html></html>') }]);
        const bundleId = otaStamp(new Date(Date.UTC(2026, 8, 19, 5, 0, 0)));
        expect(bundleId).toBe(ID);
        const m = construirManifiesto({ cfg: { enabled: true, reset: false, minNativeBuild: 13 }, bundleId, zip });
        expect(BASE_PRODUCTOR).toBe(OTA_BASE_URL);
        expect(decidirOta(ctx({ manifest: m })).accion).toBe('descargar');
    });
    it('las dependencias nativas de package.json son las que ota.config.json fotografió', () => {
        // Si esto falla: añadiste/actualizaste un plugin nativo. Un paquete OTA que lo use
        // rompería los binarios ya instalados. Actualiza `nativeDeps`, SUBE `minNativeBuild`
        // al número del próximo build de Codemagic y lanza ese build.
        const pkg = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8'));
        const cfg = JSON.parse(readFileSync(join(RAIZ, 'ota.config.json'), 'utf8'));
        const nativas = Object.fromEntries(Object.entries(pkg.dependencies)
            .filter(([k]) => (k.startsWith('@capacitor/') && k !== '@capacitor/cli') || k.startsWith('@capawesome/') || k.startsWith('@capacitor-community/')));
        expect(cfg.nativeDeps).toEqual(nativas);
        expect(Number.isInteger(cfg.minNativeBuild)).toBe(true);
    });
});

describe('crearZip', () => {
    it('ida y vuelta con un lector independiente', () => {
        const grande = Buffer.from('bioboros '.repeat(500));
        const entradas = [
            { name: 'index.html', data: Buffer.from('<html>ñ</html>') },
            { name: 'assets/a.js', data: grande },
            { name: 'vacio.txt', data: Buffer.alloc(0) },
        ];
        const zip = crearZip(entradas);
        const fin = zip.length - 22;
        expect(zip.readUInt32LE(fin)).toBe(0x06054b50);
        expect(zip.readUInt16LE(fin + 10)).toBe(3);
        let p = zip.readUInt32LE(fin + 16);
        const leidas = [];
        for (let i = 0; i < 3; i++) {
            expect(zip.readUInt32LE(p)).toBe(0x02014b50);
            const metodo = zip.readUInt16LE(p + 10);
            const comp = zip.readUInt32LE(p + 20);
            const nLen = zip.readUInt16LE(p + 28);
            const off = zip.readUInt32LE(p + 42);
            const name = zip.subarray(p + 46, p + 46 + nLen).toString('utf8');
            const lNameLen = zip.readUInt16LE(off + 26);
            const cuerpo = zip.subarray(off + 30 + lNameLen, off + 30 + lNameLen + comp);
            leidas.push({ name, data: metodo === 8 ? inflateRawSync(cuerpo) : Buffer.from(cuerpo) });
            p += 46 + nLen;
        }
        expect(leidas.map((e) => e.name)).toEqual(entradas.map((e) => e.name));
        leidas.forEach((e, i) => expect(e.data.equals(entradas[i].data)).toBe(true));
        expect(zip.length).toBeLessThan(grande.length);
    });
    it('rechaza nombres que escapan del paquete', () => {
        expect(() => crearZip([{ name: '../x', data: Buffer.alloc(0) }])).toThrow();
        expect(() => crearZip([{ name: '/x', data: Buffer.alloc(0) }])).toThrow();
    });
});

describe('revisarOta', () => {
    beforeEach(() => {
        Object.values(plugin).forEach((f) => f.mockReset());
        http.get.mockReset();
        localStorage.clear();
        vi.stubGlobal('__OTA_BUNDLE_ID__', '20260918-000000');
        plugin.getVersionCode.mockResolvedValue({ versionCode: '13' });
        plugin.getCurrentBundle.mockResolvedValue({ bundleId: null });
        plugin.getNextBundle.mockResolvedValue({ bundleId: null });
        plugin.getBundles.mockResolvedValue({ bundleIds: [] });
    });

    it('descarga con checksum, prepara y NO recarga', async () => {
        http.get.mockResolvedValue({ status: 200, data: JSON.stringify(manifest()) });
        expect(await revisarOta(plugin)).toBe('preparado');
        expect(plugin.downloadBundle).toHaveBeenCalledWith({ bundleId: ID, url: `${OTA_BASE_URL}${ID}.zip`, checksum: SHA });
        expect(plugin.setNextBundle).toHaveBeenCalledWith({ bundleId: ID });
        expect(plugin.reload).not.toHaveBeenCalled();
    });
    it('no vuelve a descargar lo ya descargado', async () => {
        http.get.mockResolvedValue({ status: 200, data: manifest() });
        plugin.getBundles.mockResolvedValue({ bundleIds: [ID] });
        expect(await revisarOta(plugin)).toBe('preparado');
        expect(plugin.downloadBundle).not.toHaveBeenCalled();
    });
    it('un 404 o un fallo de red no tocan nada', async () => {
        http.get.mockResolvedValue({ status: 404, data: '' });
        expect(await revisarOta(plugin)).toBe('sin_manifiesto');
        http.get.mockRejectedValue(new Error('sin red'));
        expect(await revisarOta(plugin)).toBe('error');
        expect(plugin.setNextBundle).not.toHaveBeenCalled();
    });
    it('el pánico llama a reset()', async () => {
        http.get.mockResolvedValue({ status: 200, data: manifest({ reset: true }) });
        plugin.getCurrentBundle.mockResolvedValue({ bundleId: '20260918-000000' });
        expect(await revisarOta(plugin)).toBe('reset');
        expect(plugin.reset).toHaveBeenCalled();
    });
});

describe('iniciarOtaNativa', () => {
    it('en la web no engancha nada', () => {
        platform.nativo = false;
        const spy = vi.spyOn(window, 'addEventListener');
        iniciarOtaNativa();
        expect(spy.mock.calls.filter(([e]) => e === 'mealfit:app-ready')).toHaveLength(0);
        spy.mockRestore();
    });
    it('en nativo confirma el paquete cuando la app pintó y bloquea el que provocó la vuelta atrás', async () => {
        platform.nativo = true;
        vi.stubGlobal('__OTA_BUNDLE_ID__', '20260918-000000');
        plugin.ready.mockResolvedValue({ rollback: true, previousBundleId: ID, currentBundleId: null });
        iniciarOtaNativa();
        expect(plugin.ready).not.toHaveBeenCalled();
        window.dispatchEvent(new Event('mealfit:app-ready'));
        await vi.waitFor(() => expect(plugin.ready).toHaveBeenCalledTimes(1));
        await vi.waitFor(() => expect(JSON.parse(localStorage.getItem('mf_ota_bloqueados'))).toEqual([ID]));
    });
});
