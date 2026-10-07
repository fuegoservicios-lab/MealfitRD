import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
const rows = [{ id: 'arroz', name: 'Arroz', market_container: 'libra', default_unit: 'lb' }];
const response = items => ({ ok: true, json: async () => ({ items }) });

beforeEach(() => { vi.resetModules(); localStorage.clear(); vi.clearAllMocks(); });

describe('catálogo de la Nevera', () => {
    it('precarga y buscador comparten una petición', async () => {
        const { fetchWithAuth } = await import('../config/api');
        let resolve;
        fetchWithAuth.mockReturnValue(new Promise(r => { resolve = r; }));
        const { cargarCatalogoDeNevera } = await import('../utils/catalogoDeNevera');
        const warm = cargarCatalogoDeNevera();
        const opened = cargarCatalogoDeNevera();
        expect(fetchWithAuth).toHaveBeenCalledTimes(1);
        resolve(response(rows));
        expect(await warm).toEqual(rows);
        expect(await opened).toEqual(rows);
    });

    it('tras cerrar y abrir la app busca sin esperar a la red', async () => {
        const first = await import('../utils/pantryCache');
        first.setCachedMasterList(rows);
        vi.resetModules();
        const { fetchWithAuth } = await import('../config/api');
        const { cargarCatalogoDeNevera } = await import('../utils/catalogoDeNevera');
        expect(await cargarCatalogoDeNevera()).toEqual(rows);
        expect(fetchWithAuth).not.toHaveBeenCalled();
    });

    it('el catálogo público de nombres no sustituye las unidades del catálogo de cuenta', async () => {
        const cache = await import('../utils/pantryCache');
        cache.setCachedMasterList([{ id: 'arroz', name: 'Arroz' }]);
        const { fetchWithAuth } = await import('../config/api');
        fetchWithAuth.mockResolvedValue(response(rows));
        const { cargarCatalogoDeNevera } = await import('../utils/catalogoDeNevera');
        expect(await cargarCatalogoDeNevera()).toEqual(rows);
        expect(fetchWithAuth).toHaveBeenCalledTimes(1);
    });

    it('una copia caducada se actualiza y una dañada no bloquea la búsqueda', async () => {
        const cache = await import('../utils/pantryCache');
        cache.setCachedMasterList(rows, 1);
        vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10);
        expect(cache.getCachedMasterList()).toBeUndefined();
        vi.restoreAllMocks();
        localStorage.setItem(cache.MASTER_LIST_LS_KEY, 'roto');
        const { fetchWithAuth } = await import('../config/api');
        fetchWithAuth.mockResolvedValue(response(rows));
        const { cargarCatalogoDeNevera } = await import('../utils/catalogoDeNevera');
        expect(await cargarCatalogoDeNevera()).toEqual(rows);
    });

    it.each(['offline', 'empty'])('permite reintentar después de %s', async mode => {
        const { fetchWithAuth } = await import('../config/api');
        if (mode === 'offline') fetchWithAuth.mockRejectedValueOnce(new Error('offline'));
        else fetchWithAuth.mockResolvedValueOnce(response([]));
        fetchWithAuth.mockResolvedValueOnce(response(rows));
        const { cargarCatalogoDeNevera } = await import('../utils/catalogoDeNevera');
        await expect(cargarCatalogoDeNevera()).rejects.toThrow();
        expect(await cargarCatalogoDeNevera()).toEqual(rows);
    });
});
