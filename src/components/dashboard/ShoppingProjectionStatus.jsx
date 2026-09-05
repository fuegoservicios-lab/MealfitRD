// [P1-ARQ25-F5-UI-STATES · 2026-09-05] Estado de la proyección de compras (Fase 5 del roadmap 2.5,
// «estados UI pending/ready/failed/stale»). Lee `GET /api/plans/{plan_id}/projections` (cero LLM,
// exento de cuota) y pinta UNA línea discreta debajo de las acciones de la lista. Con `pending`
// sondea cada 30 s (tope 20) y solo con la pestaña visible; con `none` no pinta nada.
// La línea la decide `utils/projectionLine.js` (puro).
import React, { useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '../../config/api';
import { projectionLine } from '../../utils/projectionLine';
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from '../../utils/safeLocalStorage';
import styles from './ShoppingProjectionStatus.module.css';

const POLL_MS = 30_000;
const POLL_MAX = 20;

// [P2-PROJECTION-LINE-NO-FLICKER · 2026-09-05] Al refrescar, la línea nacía vacía (snap=null) hasta que volvía
// el fetch y REAPARECÍA unos milisegundos después: un salto de layout en cada recarga. Último snapshot por plan
// en localStorage (stale-while-revalidate): se pinta al instante y el fetch lo actualiza. Un fallo transitorio
// del fetch tampoco la borra; solo `none` (el plan ya no tiene proyección) la quita y limpia la caché.
const _cacheKey = (planId) => `mealfit_projection_snap:${planId}`;
const _readCache = (planId) => {
    if (!planId) return null;
    try {
        const raw = safeLocalStorageGet(_cacheKey(planId), null);
        const j = raw ? JSON.parse(raw) : null;
        return j && typeof j === 'object' && j.status ? j : null;
    } catch { return null; }
};

export default function ShoppingProjectionStatus({ planId, refreshKey, enabled = true }) {
    const [snap, setSnap] = useState(null);
    const pollsRef = useRef(0);
    const active = Boolean(enabled && planId);
    // lo que se pinta: el snapshot vivo de ESTE plan o, mientras llega, el último conocido en caché
    // (derivado en render, sin setState en efecto: el techo de `react-hooks/set-state-in-effect` está al límite)
    const shown = (snap && snap.__planId === planId) ? snap : _readCache(planId);

    useEffect(() => {
        if (!active) return undefined;
        let alive = true;
        let timer = null;
        pollsRef.current = 0;
        const load = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
                timer = setTimeout(load, POLL_MS);
                return;
            }
            fetchWithAuth(`/api/plans/${encodeURIComponent(planId)}/projections`)
                .then((r) => (r && r.ok ? r.json() : null))
                .then((j) => {
                    if (!alive) return;
                    if (!j || typeof j !== 'object') return;   // respuesta rara: conservar lo último conocido
                    setSnap({ ...j, __planId: planId });
                    if (j.status === 'none') safeLocalStorageRemove(_cacheKey(planId));
                    else safeLocalStorageSet(_cacheKey(planId), j);
                    if (j.status === 'pending' && pollsRef.current < POLL_MAX) {
                        pollsRef.current += 1;
                        timer = setTimeout(load, POLL_MS);
                    }
                })
                .catch(() => { /* fallo transitorio: la línea conserva el último estado conocido */ });
        };
        load();
        return () => { alive = false; if (timer) clearTimeout(timer); };
    }, [active, planId, refreshKey]);

    const line = active ? projectionLine(shown) : null;
    if (!line) return null;
    return (
        <p className={`${styles.line} ${styles[line.tone] || ''}`} data-projection-status={shown?.status} aria-live="polite">
            <span className={styles.dot} aria-hidden="true" />
            {line.text}
        </p>
    );
}
