// [P1-PLAN-LOTE-103 · 2026-09-18] Las comidas registradas HOY, para quien no monta «Tus macros y micros de hoy».
//
// Hasta este lote, «Tu Menú» (Dashboard.jsx, modo plan) sabía qué se comió hoy porque `TrackingProgress` vivía en
// la misma pantalla y emitía `mealfit:today-consumed-updated` con cada cambio de su estado (fetch, refetch, borrado
// optimista): una sola fuente de verdad. Al mudar el contador a la pestaña «Progreso», el dashboard del plan se
// quedaba sordo — y con él la atenuación del plato ya comido y el candado de «Cambiar plato».
//
// Este hook conserva la doctrina «una fuente cuando conviven»: si `TrackingProgress` está montado, ADOPTA lo que
// emite; y como en la pantalla donde se usa (el dashboard del plan) ya no lo está, pide él mismo el diario con las
// MISMAS señales de refresco (registrar, borrar, volver a la pestaña). Al volver de «Progreso» el dashboard se
// vuelve a montar y pide de nuevo: lo borrado allí se ve aquí.
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '../config/api';

const _hoyUrl = (userId) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `/api/diary/consumed/${userId}?date=${y}-${m}-${d}&tzOffset=${now.getTimezoneOffset()}`;
};

/** Las comidas de hoy, o null si no hay usuario / no hay red (se conserva lo último visto). */
const _pedirHoy = async (userId) => {
    if (!userId || userId === 'guest') return null;
    try {
        const r = await fetchWithAuth(_hoyUrl(userId));
        const d = await r.json().catch(() => null);
        return Array.isArray(d?.meals) ? d.meals : null;
    } catch {
        return null;
    }
};

export function useTodaysConsumedMeals(userId) {
    const [meals, setMeals] = useState([]);
    // Época: un evento adoptado invalida los fetches propios que estaban en vuelo. Sin esto, el fetch del montaje
    // (que llega tarde y vacío) pisaría lo que `TrackingProgress` acaba de emitir.
    const epocaRef = useRef(0);

    const cargar = useCallback(async () => {
        const mia = epocaRef.current;
        const m = await _pedirHoy(userId);
        if (m && mia === epocaRef.current) setMeals(m);
    }, [userId]);

    // [P1-PLAN-LOTE-105] el fetch del montaje va en un async propio del efecto (no en `cargar()` síncrono): es lo
    // que la regla `set-state-in-effect` acepta, y además desmonta limpio (`vivo`).
    useEffect(() => {
        let vivo = true;
        const mia = epocaRef.current;
        (async () => {
            const m = await _pedirHoy(userId);
            if (vivo && m && mia === epocaRef.current) setMeals(m);
        })();
        return () => { vivo = false; };
    }, [userId]);

    useEffect(() => {
        const adoptar = (event) => {
            const m = event?.detail?.meals;
            if (Array.isArray(m)) { epocaRef.current += 1; setMeals(m); }
        };
        const alVolver = () => { if (document.visibilityState === 'visible') cargar(); };
        window.addEventListener('mealfit:today-consumed-updated', adoptar);
        window.addEventListener('mealfit:refresh-inventory', cargar);
        window.addEventListener('mealfit:diary-changed', cargar);
        document.addEventListener('visibilitychange', alVolver);
        return () => {
            window.removeEventListener('mealfit:today-consumed-updated', adoptar);
            window.removeEventListener('mealfit:refresh-inventory', cargar);
            window.removeEventListener('mealfit:diary-changed', cargar);
            document.removeEventListener('visibilitychange', alVolver);
        };
    }, [cargar]);

    return meals;
}

export default useTodaysConsumedMeals;
