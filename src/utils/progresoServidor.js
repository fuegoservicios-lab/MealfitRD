// [P1-PLAN-LOTE-1059 · plan 1030/1035 · 2026-11-17] El juego de las semanas, según el SERVIDOR.
//
// El servidor es la fuente de la verdad (D-F): el día 1 vive en Neon (`user_journey`), así que un teléfono recién
// instalado cuenta la misma «Semana N» que el viejo. La app pinta al instante desde lo guardado y corrige con lo que
// diga `/api/progress/summary`. Lo guardado es caché: sin red, se pinta con eso.
import { fetchWithAuth } from '../config/api';
import { safeLocalStorageGet, safeLocalStorageSet } from './safeLocalStorage';

export const claveResumen = (userId) => `mealfit_progreso_resumen_${userId}`;
// La misma clave que ya usaban la tarjeta y el calendario para el día 1 (ahora la escribe el servidor).
export const claveInicio = (userId) => `mealfit_semana_inicio_${userId}`;
export const claveSemanas = (userId) => `mealfit_progreso_semanas_${userId}`;

const SEMANAS_CACHE_TTL_MS = 30_000;
const _enVueloSemanas = new Map();

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function _leerRegistroSemanas(userId) {
    if (!userId) return null;
    try {
        const crudo = safeLocalStorageGet(claveSemanas(userId), null);
        if (!crudo) return null;
        const parsed = JSON.parse(crudo);
        const raw = Array.isArray(parsed)
            ? { ts: 0, semanas: parsed }
            : (parsed && typeof parsed === 'object' ? parsed : null);
        if (!raw || !Array.isArray(raw.semanas)) return null;
        const validas = raw.semanas.filter((s) => s && typeof s === 'object' && Number.isFinite(Number(s.numero)));
        if (!validas.length && raw.semanas.length) return null;
        return { ts: Number(raw.ts) || 0, semanas: validas };
    } catch {
        return null;
    }
}

export function leerSemanasGuardadas(userId) {
    return _leerRegistroSemanas(userId)?.semanas || null;
}

export function semanasGuardadasSonFrescas(userId, ahora = Date.now()) {
    const reg = _leerRegistroSemanas(userId);
    return Boolean(reg && reg.ts > 0 && ahora - reg.ts < SEMANAS_CACHE_TTL_MS);
}

export function invalidarCacheSemanas(userId) {
    const reg = _leerRegistroSemanas(userId);
    if (!reg) return;
    safeLocalStorageSet(claveSemanas(userId), JSON.stringify({ ts: 0, semanas: reg.semanas }));
}

export function leerResumenGuardado(userId) {
    if (!userId) return null;
    try {
        const crudo = safeLocalStorageGet(claveResumen(userId), null);
        const r = crudo ? JSON.parse(crudo) : null;
        return r && typeof r === 'object' && ISO.test(String(r.dia_1 || '')) ? r : null;
    } catch {
        return null;
    }
}

/** El día 1 que manda: el del servidor si lo hay; si no, null (quien llama cae a lo que deduzca localmente). */
export function diaUnoDelServidor(userId) {
    return leerResumenGuardado(userId)?.dia_1 || null;
}

export async function pedirResumen(userId, tzOffset = new Date().getTimezoneOffset()) {
    if (!userId || userId === 'guest') return null;
    const res = await fetchWithAuth(`/api/progress/summary/${userId}?tzOffset=${tzOffset}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !ISO.test(String(data.dia_1 || ''))) return null;
    safeLocalStorageSet(claveResumen(userId), JSON.stringify(data));
    safeLocalStorageSet(claveInicio(userId), data.dia_1);
    return data;
}

export async function pedirSemanas(userId, tzOffset = new Date().getTimezoneOffset(), { force = false } = {}) {
    if (!userId || userId === 'guest') return [];
    if (!force && semanasGuardadasSonFrescas(userId)) {
        return leerSemanasGuardadas(userId) || [];
    }
    const key = `${userId}:${tzOffset}`;
    if (_enVueloSemanas.has(key)) return _enVueloSemanas.get(key);
    const tarea = (async () => {
        const res = await fetchWithAuth(`/api/progress/weeks/${userId}?tzOffset=${tzOffset}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (!Array.isArray(data?.semanas)) return null;
        safeLocalStorageSet(claveSemanas(userId), JSON.stringify({ ts: Date.now(), semanas: data.semanas }));
        return data.semanas;
    })().finally(() => {
        _enVueloSemanas.delete(key);
    });
    _enVueloSemanas.set(key, tarea);
    return tarea;
}

export async function marcarEventosVistos(userId, claves) {
    const lista = (claves || []).filter(Boolean);
    if (!userId || userId === 'guest' || !lista.length) return;
    try {
        await fetchWithAuth(`/api/progress/events/seen/${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ claves: lista }),
        });
    } catch { /* se volverá a mostrar la próxima vez: mejor eso que perderlo */ }
}

/** bronce → plata → oro → platino → diamante. Los umbrales los pone el servidor (`progreso_semanas.RANGOS`). */
export const RANGOS = ['bronce', 'plata', 'oro', 'platino', 'diamante'];

const CLASIFICATORIA_CACHE_TTL_MS = 20_000;
const _enVueloClasificatoria = new Map();
const _CLASIF_TABS = ['semanal', 'general', 'rachas'];
const _CLASIF_SCOPES = ['global', 'pais'];

export const claveClasificatoria = (userId, tab = 'semanal', scope = 'global') =>
    `mealfit_clasificatoria_${userId}_${tab}_${scope}`;

function _leerRegistroClasificatoria(userId, tab = 'semanal', scope = 'global') {
    if (!userId || userId === 'guest') return null;
    try {
        const crudo = safeLocalStorageGet(claveClasificatoria(userId, tab, scope), null);
        if (!crudo) return null;
        const parsed = JSON.parse(crudo);
        if (!parsed || typeof parsed !== 'object' || !parsed.data || typeof parsed.data !== 'object') return null;
        if (!Array.isArray(parsed.data.tabla)) return null;
        return { ts: Number(parsed.ts) || 0, data: parsed.data };
    } catch {
        return null;
    }
}

export function leerClasificatoriaGuardada(userId, tab = 'semanal', scope = 'global') {
    return _leerRegistroClasificatoria(userId, tab, scope)?.data || null;
}

export function clasificatoriaGuardadaEsFresca(userId, tab = 'semanal', scope = 'global', ahora = Date.now()) {
    const reg = _leerRegistroClasificatoria(userId, tab, scope);
    return Boolean(reg && reg.ts > 0 && ahora - reg.ts < CLASIFICATORIA_CACHE_TTL_MS);
}

export function invalidarCacheClasificatoria(userId) {
    if (!userId || userId === 'guest') return;
    for (const tab of _CLASIF_TABS) {
        for (const scope of _CLASIF_SCOPES) {
            const reg = _leerRegistroClasificatoria(userId, tab, scope);
            if (!reg) continue;
            safeLocalStorageSet(claveClasificatoria(userId, tab, scope), JSON.stringify({ ts: 0, data: reg.data }));
        }
    }
}

/** Clasificatoria global / país / rachas + posición del jugador + misiones e insignias. */
export async function pedirClasificatoria(userId, { tab = 'semanal', scope = 'global', tzOffset = new Date().getTimezoneOffset(), force = false } = {}) {
    if (!userId || userId === 'guest') return null;
    if (!force && clasificatoriaGuardadaEsFresca(userId, tab, scope)) {
        return leerClasificatoriaGuardada(userId, tab, scope);
    }
    const key = `${userId}:${tab}:${scope}:${tzOffset}`;
    if (_enVueloClasificatoria.has(key)) return _enVueloClasificatoria.get(key);
    const params = new URLSearchParams({ tab, scope, tzOffset: String(tzOffset) });
    const tarea = (async () => {
        const res = await fetchWithAuth(`/api/progress/leaderboard/${userId}?${params.toString()}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (data && Array.isArray(data.tabla)) {
            safeLocalStorageSet(claveClasificatoria(userId, tab, scope), JSON.stringify({ ts: Date.now(), data }));
        }
        return data;
    })().finally(() => {
        _enVueloClasificatoria.delete(key);
    });
    _enVueloClasificatoria.set(key, tarea);
    return tarea;
}

/** Precarga silenciosa de la vista principal de Liga para que la primera apertura sea instantánea. */
export function precargarClasificatoria(userId) {
    if (!userId || userId === 'guest') return Promise.resolve(null);
    return pedirClasificatoria(userId, { tab: 'semanal', scope: 'global' }).catch(() => null);
}

/** Comparación Cara a Cara entre el jugador y un rival público (cero datos clínicos). */
export async function compararConRival(userId, rivalId) {
    if (!userId || !rivalId || userId === 'guest') return null;
    const res = await fetchWithAuth(`/api/progress/compare/${userId}/${rivalId}`);
    if (!res.ok) return null;
    return res.json();
}

/** Actualiza el alias público o el modo incógnito del jugador en Clasificatoria. */
export async function guardarPerfilJuego(userId, { display_alias = null, opt_in = null, limpiar_apodo = false } = {}) {
    if (!userId || userId === 'guest') return null;
    const res = await fetchWithAuth(`/api/progress/profile/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_alias, opt_in, limpiar_apodo }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        const msg = data?.detail || 'No pudimos guardar tu identidad.';
        const err = new Error(typeof msg === 'string' ? msg : 'Error');
        err.status = res.status;
        throw err;
    }
    return data;
}
