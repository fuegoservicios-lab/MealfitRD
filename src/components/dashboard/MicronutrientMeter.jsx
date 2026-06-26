import { useMemo } from 'react';
import { motion } from 'framer-motion';
import styles from './MicronutrientMeter.module.css';

/* [P1-MICRO-FOCO-PANEL · 2026-06-26] Rediseño "Foco" del panel de micronutrientes.
   Reemplaza al medidor plano (muro de barras idénticas) por una vista con JERARQUÍA:
   primero lo que NECESITA ATENCIÓN (tarjetas grandes con % + sugerencia accionable),
   luego lo cumplido como chips discretos, y por último los LÍMITES a no pasar.

   Movimientos clave (del rediseño aprobado por el owner):
   - Color solo donde importa: lo cumplido se calma (gris/teal + ✓); el calor (naranja)
     se reserva para lo que falta.
   - % domado: la barra topa a 100% — el 754% deja de gritar.
   - Conteo honesto: "X de N metas al día · Y por mejorar · Z límites bajo control".

   Wired a datos REALES (no hardcode): las tarjetas "por mejorar" muestran la sugerencia
   clínica del backend — `advice.items[].primero_alimentos` (alimentos) + `dosis_sugerida`
   (dosis sex/edad-aware). Fallback a `entry.nota` (_SUPPLEMENT_NOTE) si no hay item.

   Data:
   - report.panel[] = {nutriente, key, valor, unidad, piso|techo, status, nota?}  (17 micros)
   - advice.items[] = {nutriente, key, suplemento, dosis_sugerida, primero_alimentos, ...}
   - advice.disclaimer = caveat médico (orientativo, no prescripción).

   Consolida el antiguo MicronutrientMeter (todos los micros) + MicronutrientPanel (gaps +
   suplementos) en un solo panel: las tarjetas "por mejorar" ya traen la sugerencia inline.
   Cada tarjeta es tocable → preguntarle al coach IA cómo subir ese micro (via onAsk). */

function _fmtN(n) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return '';
    const v = Number(n);
    // sin decimales para valores grandes; 1 decimal para chicos (< 10).
    return String(Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
}
const _round1 = (v) => Math.round(Number(v) * 10) / 10;

// Clasifica una fila del panel → % (topado a 100% para la barra), met/over, tono.
function classifyRow(e) {
    const isCeil = e.techo !== undefined && e.techo !== null;
    const target = isCeil ? e.techo : e.piso;
    const valor = Number(e.valor) || 0;
    const pct = target ? Math.round((valor / target) * 100) : 0;
    const estimado = typeof e.status === 'string' && e.status.startsWith('estimado');
    if (isCeil) {
        const over = e.status === 'alto' || pct > 100;
        return { isCeil, pct, fill: Math.min(Math.max(pct, 3), 100), tone: over ? 'over' : 'ok', target, valor, met: !over, over, estimado };
    }
    const met = e.status === 'ok' || pct >= 100;
    // Calor graduado para lo que falta: amber cerca de la meta, naranja si está muy bajo.
    const tone = met ? 'ok' : (pct >= 50 ? 'amber' : 'far');
    const statusWord = pct >= 50 ? 'Bajo' : 'Muy bajo';
    return { isCeil, pct, fill: Math.min(Math.max(pct, 3), 100), tone, target, valor, met, over: false, estimado, statusWord };
}

// Busca la sugerencia clínica del backend para una fila (por key, luego por nombre).
function findAdvice(e, items) {
    if (!items || !items.length) return null;
    if (e.key) {
        const byKey = items.find((it) => it.key === e.key);
        if (byKey) return byKey;
    }
    const nm = (e.nutriente || '').toLowerCase();
    return items.find((it) => (it.nutriente || '').toLowerCase() === nm) || null;
}

// — Tarjeta "Por mejorar hoy": % grande + barra + brecha + sugerencia accionable —
function AttentionCard({ e, adviceItem, onAsk }) {
    const s = classifyRow(e);
    const food = adviceItem?.primero_alimentos || e.nota || '';
    const dose = adviceItem?.dosis_sugerida || '';
    const Tag = onAsk ? 'button' : 'div';
    return (
        <Tag
            type={onAsk ? 'button' : undefined}
            onClick={onAsk}
            className={`${styles.att} ${styles[s.tone]} ${onAsk ? styles.clickable : ''}`}
            title={onAsk ? `Preguntarle al coach cómo subir tu ${(e.nutriente || '').toLowerCase()}` : undefined}
        >
            <div className={styles.attTop}>
                <span className={styles.attName}>{e.nutriente}</span>
                <span className={styles.pill}>
                    <ArrowDown />{s.estimado ? 'Estimado' : s.statusWord}
                </span>
                <span className={styles.bigPct}>{s.pct}%</span>
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
                <b>{_fmtN(s.valor)}</b> / {_fmtN(s.target)} {e.unidad}
                {' · '}<span className={styles.miss}>faltan {_fmtN(_round1(s.target - s.valor))} {e.unidad}</span>
            </div>
            {food && (
                <div className={styles.sugg}>
                    <span className={styles.suggIco} aria-hidden="true"><BoltIcon /></span>
                    <span>
                        {food}
                        {dose && <span className={styles.dose}>Suplir: {dose}</span>}
                    </span>
                </div>
            )}
            {onAsk && <span className={styles.improve}><ChatIcon /> Cómo subirlo</span>}
        </Tag>
    );
}

export default function MicronutrientMeter({ report, advice, onAsk }) {
    const panel = report?.panel;
    const adviceItems = advice?.items || [];

    const { attention, reached, limits, nReached, nAtt, nLimitsOk } = useMemo(() => {
        const att = [];
        const rch = [];
        const lim = [];
        for (const e of (panel || [])) {
            const isCeil = e.techo !== undefined && e.techo !== null;
            if (isCeil) { lim.push(e); continue; }
            if (e.status === 'ok' || (Number(e.valor) || 0) >= (e.piso || 0)) rch.push(e);
            else att.push(e);
        }
        // las que más faltan, primero (% ascendente).
        att.sort((a, b) => {
            const pa = a.piso ? (Number(a.valor) || 0) / a.piso : 0;
            const pb = b.piso ? (Number(b.valor) || 0) / b.piso : 0;
            return pa - pb;
        });
        const limOk = lim.filter((e) => !(e.status === 'alto')).length;
        return { attention: att, reached: rch, limits: lim, nReached: rch.length, nAtt: att.length, nLimitsOk: limOk };
    }, [panel]);

    if (!panel || !panel.length) return null;
    const nFloors = nReached + nAtt;
    const coverage = typeof report?.coverage === 'number' ? Math.round(report.coverage * 100) : null;
    const hasSuggestion = attention.some((e) => findAdvice(e, adviceItems) || e.nota);

    return (
        <motion.section
            className={styles.panel}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            role="region"
            aria-label="Tu panel de micronutrientes"
        >
            <header className={styles.head}>
                <span className={styles.badge} aria-hidden="true"><FlaskIcon /></span>
                <div className={styles.headText}>
                    <h3 className={styles.title}>Tu panel de micronutrientes</h3>
                    <span className={styles.sub}>
                        <b>{nReached}</b> de {nFloors} metas al día
                        {nAtt > 0 && <> · <span className={styles.warn}><b>{nAtt}</b> por mejorar</span></>}
                    </span>
                </div>
            </header>

            {/* Chips de resumen */}
            <div className={styles.stats}>
                <div className={`${styles.stat} ${styles.ok}`}>
                    <span className={styles.num}>{nReached}</span>
                    <span className={styles.lbl}>metas<b>al día</b></span>
                </div>
                <div className={`${styles.stat} ${nAtt > 0 ? styles.far : styles.ok}`}>
                    <span className={styles.num}>{nAtt}</span>
                    <span className={styles.lbl}>por<b>mejorar</b></span>
                </div>
                {limits.length > 0 && (
                    <div className={`${styles.stat} ${styles.ok}`}>
                        <span className={styles.num}>{nLimitsOk}</span>
                        <span className={styles.lbl}>límites<b>bajo control</b></span>
                    </div>
                )}
            </div>

            {/* Por mejorar hoy */}
            {attention.length > 0 ? (
                <>
                    <div className={`${styles.eye} ${styles.hot}`}>
                        <span className={styles.dotpulse} aria-hidden="true" />Por mejorar hoy<span className={styles.ln} />
                    </div>
                    {attention.map((e, i) => (
                        <AttentionCard
                            key={`att-${e.key || i}`}
                            e={e}
                            adviceItem={findAdvice(e, adviceItems)}
                            onAsk={onAsk ? () => onAsk(buildQuestion(e), e.nutriente) : undefined}
                        />
                    ))}
                    {hasSuggestion && (advice?.disclaimer || report?.disclaimer) && (
                        <p className={styles.disclaimer}>{advice?.disclaimer || report?.disclaimer}</p>
                    )}
                </>
            ) : (
                <div className={`${styles.eye} ${styles.allgood}`}>
                    <CheckIcon />Todas tus metas del día están cubiertas<span className={styles.ln} />
                </div>
            )}

            {/* Al día */}
            {reached.length > 0 && (
                <>
                    <div className={styles.eye}>Al día <span className={styles.ct}>· {nReached}</span><span className={styles.ln} /></div>
                    <div className={styles.grid2}>
                        {reached.map((e, i) => (
                            <div key={`r-${e.key || i}`} className={styles.q}>
                                <span className={styles.chk}><CheckIcon /></span>
                                <span className={styles.qName}>{e.nutriente}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* Límites */}
            {limits.length > 0 && (
                <>
                    <div className={styles.eye}>Mantener bajo el límite<span className={styles.ln} /></div>
                    <div className={styles.lim2}>
                        {limits.map((e, i) => {
                            const s = classifyRow(e);
                            return (
                                <div key={`l-${e.key || i}`} className={`${styles.lim} ${styles[s.tone]}`}>
                                    <div className={styles.limTop}>
                                        <span className={styles.limName}>{e.nutriente}</span>
                                        <span className={styles.limOk}>
                                            <ShieldIcon />{s.over ? 'Sobre el límite' : 'Bajo control'}
                                        </span>
                                    </div>
                                    <div className={`${styles.bar} ${styles.thin}`}>
                                        <i style={{ width: `${s.fill}%` }} />
                                    </div>
                                    <div className={styles.limVal}>
                                        <b>{_fmtN(s.valor)}</b> / {_fmtN(s.target)} {e.unidad}
                                        {' · '}<span className={styles.mg}>
                                            {s.over
                                                ? `te pasaste ${_fmtN(_round1(s.valor - s.target))} ${e.unidad}`
                                                : `margen ${_fmtN(_round1(s.target - s.valor))} ${e.unidad}`}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
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

// Pregunta natural y accionable para el coach IA, con los números reales del gap.
function buildQuestion(e) {
    const n = (e.nutriente || '').toLowerCase();
    return `Mi plan se queda corto en ${n} (${_fmtN(e.valor)}${e.unidad} de ${_fmtN(e.piso)}${e.unidad}). ¿Qué alimentos o ajustes me recomiendas para subirlo?`;
}

/* — Iconos (línea, currentColor) — */
const FlaskIcon = () => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 2v7.5L4.6 18.2A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.7-2.8L14 9.5V2" /><path d="M8.5 2h7" /><path d="M7 15h10" />
    </svg>
);
const CheckIcon = () => (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>
);
const ArrowDown = () => (
    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
);
const BoltIcon = () => (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" stroke="none" aria-hidden="true"><path d="M13 2 4 13h6l-1 9 9-12h-6l1-8z" /></svg>
);
const ShieldIcon = () => (
    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z" /><path d="M9 12l2 2 4-4" /></svg>
);
const ChatIcon = () => (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-11.9 7.6L3 21l1.9-6.1A8.4 8.4 0 1 1 21 11.5Z" /></svg>
);
