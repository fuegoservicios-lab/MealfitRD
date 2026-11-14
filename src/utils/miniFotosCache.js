// Caché síncrono en localStorage de las miniaturas ('mini') más recientes por usuario.
// Permite que MiniaturaDeComida pinte en el primer fotograma sin esperar a la apertura async de IndexedDB.
import { safeLocalStorageGet, safeLocalStorageRemove, safeLocalStorageSet } from './safeLocalStorage';

export const MAX_MINI_FOTOS_CACHE = 16;
export const MINI_FOTOS_LS_PREFIX = 'mealfit_mini_fotos:';

const _valido = (v) => typeof v === 'string' && v.length > 0 && v !== 'guest';
const _key = (userId) => `${MINI_FOTOS_LS_PREFIX}${userId}`;

function _leerMapa(userId) {
    if (!_valido(userId)) return [];
    try {
        const raw = safeLocalStorageGet(_key(userId), null);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (par) => Array.isArray(par) && typeof par[0] === 'string' && par[0].length > 0 && Array.isArray(par[1]),
        );
    } catch {
        return [];
    }
}

function _escribirMapa(userId, entries) {
    if (!_valido(userId)) return;
    if (!entries.length) {
        safeLocalStorageRemove(_key(userId));
        return;
    }
    safeLocalStorageSet(_key(userId), JSON.stringify(entries.slice(-MAX_MINI_FOTOS_CACHE)));
}

export function leerMiniFotosCache(userId, mealId) {
    if (!_valido(userId) || typeof mealId !== 'string' || !mealId) return null;
    const entries = _leerMapa(userId);
    const hit = entries.find(([id]) => id === mealId);
    if (!hit) return null;
    const fotos = hit[1].filter(
        (f) => f && typeof f.url === 'string' && f.url.startsWith('data:image/'),
    ).map((f) => ({ id: f.id ?? null, url: f.url }));
    return fotos.length ? fotos : null;
}

export function guardarMiniFotosCache(userId, mealId, fotos) {
    if (!_valido(userId) || typeof mealId !== 'string' || !mealId || !Array.isArray(fotos)) return;
    const limpias = fotos
        .filter((f) => f && typeof f.url === 'string' && f.url.startsWith('data:image/'))
        .map((f) => ({ id: f.id ?? null, url: f.url }));
    if (!limpias.length) {
        borrarMiniFotoCache(userId, mealId);
        return;
    }
    const entries = _leerMapa(userId).filter(([id]) => id !== mealId);
    entries.push([mealId, limpias]);
    _escribirMapa(userId, entries);
}

export function borrarMiniFotoCache(userId, mealId) {
    if (!_valido(userId) || typeof mealId !== 'string' || !mealId) return;
    const entries = _leerMapa(userId);
    if (!entries.some(([id]) => id === mealId)) return;
    _escribirMapa(userId, entries.filter(([id]) => id !== mealId));
}

export function borrarMiniFotosUsuarioCache(userId) {
    if (!_valido(userId)) return;
    safeLocalStorageRemove(_key(userId));
}
