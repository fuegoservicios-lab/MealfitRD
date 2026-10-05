import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithAuth } from '../config/api';
import { borrarCacheDeInventario } from '../utils/inventarioEnMemoria';
import { getCachedInventory, invalidateInventoryCache, setCachedInventory } from '../utils/pantryCache';
import { cargarInventarioDeNevera, precargarInventarioDeNevera } from '../utils/inventarioDeNevera';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
const deferred = () => {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
};
const response = (items, status = 200) => ({ ok: status === 200, status, json: async () => ({ items }) });
const rows = [{ id: 'pollo', ingredient_name: 'Pollo', quantity: 2 }];

beforeEach(() => {
    borrarCacheDeInventario();
    vi.clearAllMocks();
});

describe('precarga de inventario de la Nevera', () => {
    it('abrir mientras se precarga comparte la petición y conserva suplementos', async () => {
        const network = deferred();
        fetchWithAuth.mockReturnValueOnce(network.promise);
        const warm = precargarInventarioDeNevera();
        const open = cargarInventarioDeNevera();
        expect(warm).toBe(open);
        expect(fetchWithAuth).toHaveBeenCalledExactlyOnceWith('/api/inventory?incluir_suplementos=1');
        network.resolve(response(rows));
        expect(await open).toEqual(rows);
        expect(getCachedInventory()).toEqual(rows);
    });

    it('una caché fresca evita tráfico de precarga; un refresco explícito sí consulta', async () => {
        setCachedInventory(rows);
        expect(await precargarInventarioDeNevera()).toEqual(rows);
        expect(fetchWithAuth).not.toHaveBeenCalled();
        fetchWithAuth.mockResolvedValueOnce(response([]));
        expect(await cargarInventarioDeNevera()).toEqual([]);
        expect(getCachedInventory()).toEqual([]);
    });

    it.each(['logout', 'mutation'])('descarta respuestas anteriores a %s sin pisar los datos nuevos', async (change) => {
        const old = deferred();
        fetchWithAuth.mockReturnValueOnce(old.promise);
        const oldRequest = cargarInventarioDeNevera();
        const rejected = expect(oldRequest).rejects.toMatchObject({ name: 'AbortError' });
        if (change === 'logout') borrarCacheDeInventario();
        else invalidateInventoryCache();
        fetchWithAuth.mockResolvedValueOnce(response([]));
        expect(await cargarInventarioDeNevera()).toEqual([]);
        old.resolve(response(rows));
        await rejected;
        expect(getCachedInventory()).toEqual([]);
    });

    it('un fallo de red no bloquea el siguiente intento', async () => {
        fetchWithAuth.mockRejectedValueOnce(new Error('offline'));
        await expect(precargarInventarioDeNevera()).rejects.toThrow('offline');
        expect(getCachedInventory()).toBeUndefined();
        fetchWithAuth.mockResolvedValueOnce(response(rows));
        expect(await cargarInventarioDeNevera()).toEqual(rows);
    });

    it('mantiene el estado de sesión expirada y no cachea errores', async () => {
        fetchWithAuth.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ detail: 'expired' }) });
        await expect(cargarInventarioDeNevera()).rejects.toMatchObject({ status: 401 });
        expect(getCachedInventory()).toBeUndefined();
    });
});
