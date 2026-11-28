// [P1-PLAN-LOTE-411 · 2026-09-27] Lo que llevas hoy y tus metas, para los atajos del chat. Las mismas lecturas que la
// pestaña de Progreso (`/api/diary/consumed/{id}` y `/api/nutrition/targets`): cero IA, fuera de la cuota del coach.
// Se pide solo mientras los atajos se ven (`activo`) y se refresca con el mismo evento que el resto de la app
// (`mealfit:refresh-inventory`, que emiten el escáner, el componedor y el coach al registrar).
import { useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '../config/api';
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/safeLocalStorage';
import { getBiologicalDateStr } from '../utils/diaBiologico';

let _hoySeg = 0;
let _hoyVal = '';
const _hoy = () => {
    const s = Math.floor(Date.now() / 1000);
    if (s !== _hoySeg) {
        _hoySeg = s;
        _hoyVal = getBiologicalDateStr(new Date());
    }
    return _hoyVal;
};
const _RESUMEN_VACIO = { totales: null, comidas: null, metas: null };

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
const _guardar = (userId, fecha, resumen) => safeLocalStorageSet(CLAVE, { uid: userId, fecha, resumen });

export function useResumenDeHoy(userId, activo) {
    const [estado, setEstado] = useState(() => ({
        uid: userId,
        fecha: _hoy(),
        resumen: leerResumenDeHoy(userId) || _RESUMEN_VACIO,
    }));
    const fechaCargadaRef = useRef(estado.fecha);
    const lastFetchAtRef = useRef(0);

    useEffect(() => {
        if (!activo || !userId || userId === 'guest') {
            fechaCargadaRef.current = _hoy();
            return undefined;
        }
        let vivo = true;
        fechaCargadaRef.current = _hoy();

        const limpiarParaDia = (hoyDia) => {
            fechaCargadaRef.current = hoyDia;
            setEstado((prev) => ({
                uid: userId,
                fecha: hoyDia,
                resumen: {
                    totales: null,
                    comidas: null,
                    metas: prev?.uid === userId ? (prev.resumen?.metas || null) : null,
                },
            }));
        };

        const cargar = async () => {
            const fechaReq = _hoy();
            lastFetchAtRef.current = Date.now();
            try {
                const tz = new Date().getTimezoneOffset();
                const [rc, rt] = await Promise.all([
                    fetchWithAuth(`/api/diary/consumed/${userId}?date=${fechaReq}&tzOffset=${tz}`),
                    fetchWithAuth('/api/nutrition/targets'),
                ]);
                const c = await rc.json().catch(() => null);
                const m = await rt.json().catch(() => null);
                if (!vivo || _hoy() !== fechaReq) return;
                const tot = c?.totals;
                const nuevo = {
                    totales: tot ? { calories: tot.calories, protein: tot.protein, carbs: tot.carbs, fats: tot.healthy_fats ?? tot.fats } : null,
                    comidas: Array.isArray(c?.meals) ? c.meals.map((x) => String(x.meal_type || '').toLowerCase()) : null,
                    nombresComidas: Array.isArray(c?.meals) ? c.meals.map((x) => String(x.meal_name || '').trim()).filter(Boolean) : [],
                    // solo lo que usan el saludo y los atajos (los micros no hacen falta en la caché)
                    metas: m?.ok ? { ok: true, calories: m.calories, macros: m.macros } : null,
                };
                fechaCargadaRef.current = fechaReq;
                _guardar(userId, fechaReq, nuevo);
                setEstado({ uid: userId, fecha: fechaReq, resumen: nuevo });
            } catch {
                // sin números, los atajos salen sin cifras
            }
        };

        const alVolver = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
            const hoyAhora = _hoy();
            if (hoyAhora !== fechaCargadaRef.current) {
                limpiarParaDia(hoyAhora);
                cargar();
                return;
            }
            if (Date.now() - lastFetchAtRef.current > 15000) cargar();
        };

        const timer = setInterval(() => {
            const hoyAhora = _hoy();
            if (hoyAhora !== fechaCargadaRef.current) {
                limpiarParaDia(hoyAhora);
                cargar();
            }
        }, 30000);

        cargar();
        window.addEventListener('mealfit:refresh-inventory', cargar);
        window.addEventListener('focus', alVolver);
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', alVolver);
        return () => {
            vivo = false;
            clearInterval(timer);
            window.removeEventListener('mealfit:refresh-inventory', cargar);
            window.removeEventListener('focus', alVolver);
            if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', alVolver);
        };
    }, [userId, activo]);

    if (!activo || !userId || userId === 'guest') return _RESUMEN_VACIO;
    const hoy = _hoy();
    if (estado.uid !== userId) return leerResumenDeHoy(userId) || _RESUMEN_VACIO;
    if (estado.fecha !== hoy) {
        return { totales: null, comidas: null, metas: estado.resumen?.metas || null };
    }
    return estado.resumen;
}

export default useResumenDeHoy;
