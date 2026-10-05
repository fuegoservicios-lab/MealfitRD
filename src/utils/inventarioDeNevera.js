import { fetchWithAuth } from '../config/api';
import { INVENTARIO } from './inventarioEnMemoria';
import { getCachedInventory, setCachedInventory } from './pantryCache';

let pendiente = null;

// La precarga del panel y la apertura de la Nevera comparten la petición.
// Una invalidación o un cambio de cuenta descarta cualquier respuesta anterior.
export function cargarInventarioDeNevera() {
    const generacion = INVENTARIO.generacion;
    if (pendiente?.generacion === generacion) return pendiente.promesa;
    const peticion = { generacion, promesa: null };
    peticion.promesa = (async () => {
        try {
            const response = await fetchWithAuth('/api/inventory?incluir_suplementos=1');
            let json = null;
            try { json = await response.json(); } catch { /* cuerpo vacío o no JSON */ }
            if (generacion !== INVENTARIO.generacion) {
                throw new DOMException('El inventario cambió durante la carga', 'AbortError');
            }
            if (!response.ok) {
                const error = new Error(json?.detail || 'No se pudo cargar la Nevera');
                error.status = response.status;
                error.detail = json?.detail;
                throw error;
            }
            if (!Array.isArray(json?.items)) throw new Error('Inventario incompleto');
            setCachedInventory(json.items);
            return json.items;
        } finally {
            if (pendiente === peticion) pendiente = null;
        }
    })();
    pendiente = peticion;
    return peticion.promesa;
}

export function precargarInventarioDeNevera() {
    const cache = getCachedInventory();
    return cache ? Promise.resolve(cache) : cargarInventarioDeNevera();
}
