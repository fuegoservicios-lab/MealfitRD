// [P1-PLAN-LOTE-688 · 2026-09-29] El contador que SUBE a la vista cuando el coach anota una comida. El dueño: «si le
// digo que me comí 2 huevos con pan integral… cuando lo agregue lo pueda ver en directo cómo sube el contador».
// Las barras ya crecían con transición (TrackingProgress.module.css); los números saltaban.
//
// Solo se animan las SUBIDAS después de la carga inicial. Todo lo demás se ve en el MISMO render: la primera carga
// (abrir Progreso no debe tardar ~1 s en «llenarse»), las bajadas (deshacer un registro «baja de inmediato»: contar
// hacia atrás parecería un error) y cualquier cambio si el sistema pide menos movimiento.
//
// Sin `setState` síncrono en el efecto (el techo de `react-hooks/set-state-in-effect` está al límite, ver lint-count):
// las actualizaciones salen de callbacks (fotograma o temporizador) y lo que no se anima se deriva en el render.
import { useEffect, useRef, useState } from 'react';

export const NUMERO_ANIMADO_MS = 700;
export const NUMERO_ANIMADO_TRAS_CARGA_MS = 1200;

const reducirMovimiento = () => {
    try { return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches); } catch { return false; }
};
const alSiguienteFotograma = (fn) => (typeof requestAnimationFrame === 'function'
    ? { raf: requestAnimationFrame(fn) }
    : { to: setTimeout(() => fn(Date.now()), 16) });
const cancelar = (h) => {
    if (!h) return;
    if (h.raf != null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(h.raf);
    if (h.to != null) clearTimeout(h.to);
};

export function useNumeroAnimado(valor, { duracionMs = NUMERO_ANIMADO_MS } = {}) {
    const objetivo = Number(valor) || 0;
    const [anim, setAnim] = useState(() => ({ hacia: objetivo, valor: objetivo }));
    const [cargado, setCargado] = useState(false);          // pasó la carga inicial
    const [quieto] = useState(reducirMovimiento);           // el sistema pide menos movimiento
    const mostradoRef = useRef(objetivo);                   // lo último pintado: de ahí arranca la subida
    const pendienteRef = useRef(null);
    const anima = cargado && !quieto;

    useEffect(() => {
        const to = setTimeout(() => setCargado(true), NUMERO_ANIMADO_TRAS_CARGA_MS);
        return () => clearTimeout(to);
    }, []);

    useEffect(() => {
        cancelar(pendienteRef.current);
        const desde = mostradoRef.current;
        if (!anima || objetivo <= desde) {
            mostradoRef.current = objetivo;
            pendienteRef.current = alSiguienteFotograma(() => setAnim({ hacia: objetivo, valor: objetivo }));
            return () => cancelar(pendienteRef.current);
        }
        const redondear = Number.isInteger(objetivo) ? Math.round : (v) => Math.round(v * 10) / 10;
        let t0 = null;
        const paso = (ahora) => {
            if (t0 === null) t0 = ahora;
            const k = Math.min(1, (ahora - t0) / duracionMs);
            const v = k >= 1 ? objetivo : redondear(desde + (objetivo - desde) * (1 - (1 - k) ** 3));
            mostradoRef.current = v;
            setAnim({ hacia: objetivo, valor: v });
            if (k < 1) pendienteRef.current = alSiguienteFotograma(paso);
        };
        pendienteRef.current = alSiguienteFotograma(paso);
        return () => cancelar(pendienteRef.current);
    }, [objetivo, duracionMs, anima]);

    if (!anima) return objetivo;                                          // carga inicial o menos movimiento
    if (anim.hacia !== objetivo && objetivo <= anim.valor) return objetivo; // bajada: salta ya
    return anim.valor;   // subiendo (o el valor nuevo aún sin tomar: se ve el último pintado, sin parpadeo)
}
