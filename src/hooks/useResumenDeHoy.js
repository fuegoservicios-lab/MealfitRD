// [P1-PLAN-LOTE-411 · 2026-09-27] Lo que llevas hoy y tus metas, para los atajos del chat. Las mismas lecturas que la
// pestaña de Progreso (`/api/diary/consumed/{id}` y `/api/nutrition/targets`): cero IA, fuera de la cuota del coach.
// Se pide solo mientras los atajos se ven (`activo`) y se refresca con el mismo evento que el resto de la app
// (`mealfit:refresh-inventory`, que emiten el escáner, el componedor y el coach al registrar).
import { useEffect, useState } from 'react';
import { fetchWithAuth } from '../config/api';
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/safeLocalStorage';

const _hoy = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// [P1-PLAN-LOTE-412] el último resumen del día, para que el saludo del coach lo use al instante (sin esperar la red).
// Por usuario y por fecha: otro usuario u otro día no lo ven.
const CLAVE = 'mealfit_resumen_hoy';
export function leerResumenDeHoy(userId) {
    if (!userId || userId === 'guest') return null;
    try {
        const d = JSON.parse(safeLocalStorageGet(CLAVE, 'null'));
        return d && d.uid === userId && d.fecha === _hoy() ? d.resumen : null;
    } catch {
        return null;
    }
}
// sin almacenamiento (modo privado de iOS, cuota) el saludo sale sin números: no pasa nada
const _guardar = (userId, resumen) => safeLocalStorageSet(CLAVE, { uid: userId, fecha: _hoy(), resumen });

export function useResumenDeHoy(userId, activo) {
    const [resumen, setResumen] = useState({ totales: null, comidas: null, metas: null });
    useEffect(() => {
        if (!activo || !userId || userId === 'guest') return undefined;
        let vivo = true;
        const cargar = async () => {
            try {
                const tz = new Date().getTimezoneOffset();
                const [rc, rt] = await Promise.all([
                    fetchWithAuth(`/api/diary/consumed/${userId}?date=${_hoy()}&tzOffset=${tz}`),
                    fetchWithAuth('/api/nutrition/targets'),
                ]);
                const c = await rc.json().catch(() => null);
                const m = await rt.json().catch(() => null);
                if (!vivo) return;
                const tot = c?.totals;
                const nuevo = {
                    totales: tot ? { calories: tot.calories, protein: tot.protein, carbs: tot.carbs, fats: tot.healthy_fats ?? tot.fats } : null,
                    comidas: Array.isArray(c?.meals) ? c.meals.map((x) => String(x.meal_type || '').toLowerCase()) : null,
                    // solo lo que usan el saludo y los atajos (los micros no hacen falta en la caché)
                    metas: m?.ok ? { ok: true, calories: m.calories, macros: m.macros } : null,
                };
                _guardar(userId, nuevo);
                setResumen(nuevo);
            } catch {
                // sin números, los atajos salen sin cifras
            }
        };
        cargar();
        window.addEventListener('mealfit:refresh-inventory', cargar);
        return () => { vivo = false; window.removeEventListener('mealfit:refresh-inventory', cargar); };
    }, [userId, activo]);
    return resumen;
}

export default useResumenDeHoy;
