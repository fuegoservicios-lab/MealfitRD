import { useMemo } from 'react';
import { motion } from 'framer-motion';
import styles from './MicronutrientMeter.module.css';

/* [P1-FOOD-DB-EXTENDED-MICROS · 2026-06-25] "Medidor de micronutrientes": panel PROFESIONAL que
   muestra TODOS los micros del plan (no solo los gaps), para que el usuario vea cuánto avanza hacia
   cada meta. Lee `report.panel[]` = {nutriente, key, valor, unidad, piso|techo, status}.

   Diseño clave (lección de P3-MICRO-PLAIN-LANGUAGE): separa METAS A ALCANZAR (pisos → barra llena = BIEN,
   verde al llegar) de LÍMITES A NO PASAR (techos sodio/azúcar → barra llena = MAL, rojo si se excede).
   Mezclarlos haría que "barra casi llena" significara cosas opuestas. Cada barra es un % del objetivo,
   color por estado, con un resumen "X de N metas alcanzadas". NO es dismissible: es un panel de estado. */

function _fmtN(n) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return '';
    const v = Number(n);
    // sin decimales para valores grandes; 1 decimal para chicos (< 10).
    return String(Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
}

// Clasifica una fila del panel → % + tono. Maneja el caso "alcanzado" (verde), ausente en el
// classify de gaps (que solo veía nutrientes fuera de rango).
function classifyRow(e) {
    const isCeil = e.techo !== undefined && e.techo !== null;
    const target = isCeil ? e.techo : e.piso;
    const valor = Number(e.valor) || 0;
    const pct = target ? Math.round((valor / target) * 100) : 0;
    const estimado = typeof e.status === 'string' && e.status.startsWith('estimado');
    if (isCeil) {
        const over = pct > 100;
        return { isCeil, pct, fill: Math.min(Math.max(pct, 3), 100), tone: over ? 'over' : 'ok', target, valor, met: !over, estimado };
    }
    let tone;
    if (pct >= 100) tone = 'ok';
    else if (pct >= 90) tone = 'near';
    else if (pct >= 70) tone = 'low';
    else tone = 'far';
    return { isCeil, pct, fill: Math.min(Math.max(pct, 3), 100), tone, target, valor, met: pct >= 100, estimado };
}

function Row({ e }) {
    const s = classifyRow(e);
    return (
        <div className={`${styles.row} ${styles[s.tone]}`}>
            <div className={styles.rowHead}>
                <span className={styles.name}>{e.nutriente}</span>
                <span className={styles.pct}>
                    {s.met && !s.isCeil && <CheckIcon />}
                    {s.pct}%
                </span>
            </div>
            <div
                className={styles.bar}
                role="progressbar"
                aria-valuenow={s.pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${e.nutriente}: ${_fmtN(s.valor)} de ${_fmtN(s.target)} ${e.unidad}`}
            >
                <i style={{ width: `${s.fill}%` }} className={s.estimado ? styles.estim : undefined} />
            </div>
            <div className={styles.vals}>
                <b>{_fmtN(s.valor)}</b>
                <span className={styles.unit}> / {_fmtN(s.target)} {e.unidad}</span>
                {s.estimado && <span className={styles.est} title="Estimado: algunos ingredientes no traen este dato en el catálogo">≈ est.</span>}
            </div>
        </div>
    );
}

export default function MicronutrientMeter({ report }) {
    const panel = report?.panel || [];
    const { floors, ceilings, metCount } = useMemo(() => {
        const fl = [];
        const ce = [];
        let met = 0;
        for (const e of panel) {
            const isCeil = e.techo !== undefined && e.techo !== null;
            (isCeil ? ce : fl).push(e);
            // "en meta": floor alcanzado (ok) o techo no excedido.
            if (e.status === 'ok') met += 1;
        }
        return { floors: fl, ceilings: ce, metCount: met };
    }, [panel]);

    if (!panel.length) return null;
    const coverage = typeof report?.coverage === 'number' ? Math.round(report.coverage * 100) : null;

    return (
        <motion.section
            className={styles.panel}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            role="region"
            aria-label="Medidor de micronutrientes"
        >
            <header className={styles.head}>
                <span className={styles.badge} aria-hidden="true"><FlaskIcon /></span>
                <div className={styles.headText}>
                    <h3 className={styles.title}>Tu panel de micronutrientes</h3>
                    <span className={styles.sub}>
                        <b>{metCount}</b> de <b>{floors.length}</b> metas alcanzadas
                    </span>
                </div>
            </header>

            {floors.length > 0 && (
                <>
                    <div className={styles.groupLabel}>Metas del día</div>
                    <div className={styles.grid}>
                        {floors.map((e, i) => <Row key={`f-${e.key || i}`} e={e} />)}
                    </div>
                </>
            )}

            {ceilings.length > 0 && (
                <>
                    <div className={styles.groupLabel}>Mantener por debajo del límite</div>
                    <div className={styles.grid}>
                        {ceilings.map((e, i) => <Row key={`c-${e.key || i}`} e={e} />)}
                    </div>
                </>
            )}

            <p className={styles.foot}>
                Estimado de lo que aportan las comidas de tu plan al día vs. lo recomendado
                {coverage !== null && <> · cobertura del catálogo {coverage}%</>}. No mide lo que comes por fuera ni suplementos.
            </p>
        </motion.section>
    );
}

/* — Iconos (línea, currentColor) — */
const FlaskIcon = () => (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 2v7.5L4.6 18.2A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.7-2.8L14 9.5V2" /><path d="M8.5 2h7" /><path d="M7 15h10" />
    </svg>
);
const CheckIcon = () => (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
);
