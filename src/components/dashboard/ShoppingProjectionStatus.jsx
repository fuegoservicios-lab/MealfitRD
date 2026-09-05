// [P1-ARQ25-F5-UI-STATES · 2026-09-05] Estado de la proyección de compras (Fase 5 del roadmap 2.5,
// «estados UI pending/ready/failed/stale»). Lee `GET /api/plans/{plan_id}/projections` (cero LLM,
// exento de cuota) y pinta UNA línea discreta debajo de las acciones de la lista. Con `pending`
// sondea cada 30 s (tope 20) y solo con la pestaña visible; con `none` no pinta nada.
// La línea la decide `utils/projectionLine.js` (puro).
import React, { useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '../../config/api';
import { projectionLine } from '../../utils/projectionLine';
import styles from './ShoppingProjectionStatus.module.css';

const POLL_MS = 30_000;
const POLL_MAX = 20;

export default function ShoppingProjectionStatus({ planId, refreshKey, enabled = true }) {
    const [snap, setSnap] = useState(null);
    const pollsRef = useRef(0);
    const active = Boolean(enabled && planId);

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
                    setSnap(j && typeof j === 'object' ? j : null);
                    if (j && j.status === 'pending' && pollsRef.current < POLL_MAX) {
                        pollsRef.current += 1;
                        timer = setTimeout(load, POLL_MS);
                    }
                })
                .catch(() => { if (alive) setSnap(null); });
        };
        load();
        return () => { alive = false; if (timer) clearTimeout(timer); };
    }, [active, planId, refreshKey]);

    const line = active ? projectionLine(snap) : null;
    if (!line) return null;
    return (
        <p className={`${styles.line} ${styles[line.tone] || ''}`} data-projection-status={snap?.status} aria-live="polite">
            <span className={styles.dot} aria-hidden="true" />
            {line.text}
        </p>
    );
}
