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

const ISO = /^\d{4}-\d{2}-\d{2}$/;

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

export async function pedirSemanas(userId, tzOffset = new Date().getTimezoneOffset()) {
    if (!userId || userId === 'guest') return [];
    const res = await fetchWithAuth(`/api/progress/weeks/${userId}?tzOffset=${tzOffset}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.semanas) ? data.semanas : [];
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
