import { fetchWithAuth } from '../config/api';
import { getCachedMasterList, setCachedMasterList } from './pantryCache';

let pendiente = null;

export function getCachedCatalogoDeNevera() {
    const rows = getCachedMasterList();
    // El catálogo del formulario público sólo tiene nombres. Al entrar con una
    // cuenta necesitamos también las unidades y tamaños para añadir alimentos.
    return rows?.some(row => Object.hasOwn(row, 'market_container')) ? rows : undefined;
}

export function cargarCatalogoDeNevera() {
    const cached = getCachedCatalogoDeNevera();
    if (cached?.length) return Promise.resolve(cached);
    if (pendiente) return pendiente;
    const request = (async () => {
        const response = await fetchWithAuth('/api/catalog', { timeout: 15000 });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        const rows = json?.items;
        if (!Array.isArray(rows) || !rows.length) throw new Error('Catálogo no disponible');
        setCachedMasterList(rows);
        return rows;
    })();
    pendiente = request;
    request.finally(() => { if (pendiente === request) pendiente = null; }).catch(() => {});
    return request;
}
