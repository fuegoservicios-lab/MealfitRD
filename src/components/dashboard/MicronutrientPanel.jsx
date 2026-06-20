import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FlaskConical, X, Pill, Info, ArrowDown, ArrowUp, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from '../../utils/safeLocalStorage';
// [P3-NOTIF-CENTER · 2026-06-16] Al descartar el panel, en vez de perderlo lo
// archivamos en el centro de notificaciones (queda releíble + borrable allí).
import { addNotification } from '../../utils/notifications';
import styles from './MicronutrientPanel.module.css';

// [P3-MICROS-RESTORE · 2026-06-19] "Desocultar" desde el centro de notificaciones.
// El centro llama a `restoreMicrosPanel(sig)`: (1) limpia la dismissal persistida
// —cubre el caso en que el panel NO está montado (el usuario está en /agente u
// otra ruta del dashboard); (2) dispara un evento para que un panel YA montado
// re-aparezca al instante. `sig` = firma de contenido (del id `micros_c_<sig>`).
export const MICROS_RESTORE_EVENT = 'mealfit:micros-restore';

export function restoreMicrosPanel(sig) {
    if (sig) {
        safeLocalStorageRemove(`mealfit_micros_dismissed_c_${sig}`);
        safeLocalStorageRemove(`mealfit_micros_notif_backfilled_c_${sig}`);
    }
    try {
        window.dispatchEvent(new CustomEvent(MICROS_RESTORE_EVENT, { detail: { sig: sig || null } }));
    } catch {
        /* SSR / sin window */
    }
}

/* [P3-MICRONUTRIENT-PANEL · 2026-06-15] Rediseño del panel "Micronutrientes a
   vigilar". Antes era texto plano (bullets). Ahora cada gap es un MEDIDOR de
   progreso (actual vs objetivo) con %, color por severidad y pill de estado —
   el lenguaje de las plataformas de salud modernas. Dismissible (X, persistido
   por plan_id). Las barras se renderizan ESTÁTICAS (sin animación de llenado)
   para no leerse como "cargando" — el feel moderno lo dan gradiente/glow/layout.

   Data del backend (FS4/FS8): report.gaps[] = {nutriente, valor, unidad, piso,
   techo, status}; advice.items[] = {nutriente, suplemento, dosis_sugerida,
   primero_alimentos}; disclaimer en cualquiera de los dos. */

// [P3-NOTIF-CENTER-CONTENT-DISMISS · 2026-06-16] Firma ESTABLE del contenido del
// reporte para la clave de descarte del panel. El bug: la clave anterior usaba la
// identidad del plan (plan_id/id/sig), que en planes solo-localStorage es null o
// cambia entre remontajes (al navegar agente↔dashboard la ruta se desmonta) → la
// dismissal no se encontraba y el panel REAPARECÍA. El contenido (nutrientes +
// valores) es idéntico entre navegaciones del mismo plan → clave estable → la X
// aguanta de verdad. Cambia sólo si el reporte cambia (recalc/regen) = correcto.
function _hashStr(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
}
export function microsContentSig(report, advice) {
    const parts = [];
    (report?.gaps || []).forEach((g) => parts.push(`${g.nutriente}=${g.valor}/${g.piso ?? g.techo ?? ''}`));
    (advice?.items || []).forEach((it) => parts.push(`s:${it.nutriente}`));
    const raw = parts.join('|');
    return raw ? _hashStr(raw) : '';
}

// Clasifica un gap → fracción de barra (0..100), % real, tono y etiqueta.
// [P3-NOTIF-CENTER · 2026-06-16] Exportado para que la vista expandida del
// centro de notificaciones dibuje las MISMAS mini-barras (SSOT del cálculo).
export function classify(g) {
    const isCeil = g.techo !== undefined && g.techo !== null;
    if (isCeil) {
        const pct = g.techo ? Math.round((g.valor / g.techo) * 100) : 0;
        return { kind: 'ceil', pct, fill: Math.min(pct, 100), over: pct > 100, tone: pct > 100 ? 'over' : 'near', label: 'sobre el techo', target: g.techo };
    }
    const pct = g.piso ? Math.round((g.valor / g.piso) * 100) : 0;
    const tone = pct >= 90 ? 'near' : pct >= 70 ? 'low' : 'far';
    const label = g.status === 'estimado_bajo' ? 'estimado bajo' : 'por debajo';
    return { kind: 'floor', pct, fill: Math.min(pct, 100), over: false, tone, label, target: g.piso };
}

// [P3-NOTIF-CENTER · 2026-06-16] Construye el payload de notificación del panel
// de micros (resumen compacto de los gaps / sugerencias). SSOT compartido entre
// el descarte del panel (X) y el backfill del Dashboard (para descartes hechos
// ANTES de que existiera el archivado) → contenido idéntico, cero drift.
// Devuelve null si no hay nada accionable.
export function buildMicrosNotification({ report, advice }) {
    const gaps = report?.gaps || [];
    const supplements = advice?.items || [];
    if (!gaps.length && !supplements.length) return null;
    const microSummary = gaps.length
        ? gaps.map((g) => {
            const s = classify(g);
            return `${g.nutriente} ${g.valor}/${s.target}${g.unidad || ''}`;
        }).join('  ·  ')
        : `${supplements.length} ${supplements.length === 1 ? 'sugerencia' : 'sugerencias'} de suplementación`;
    // [P3-NOTIF-CENTER-CONTENT-DISMISS · 2026-06-16] id ESTABLE por contenido
    // (no por planId, que es null/inestable en planes solo-localStorage). Espeja
    // la clave de dismissal → archive del panel y backfill del Dashboard producen
    // el MISMO id → reconcileBackfill lo trata como existente (cero duplicados).
    const sig = microsContentSig(report, advice);
    return {
        id: sig ? `micros_c_${sig}` : undefined,
        kind: 'micros',
        title: 'Micronutrientes a vigilar',
        message: microSummary,
        severity: 'info',
        // Payload estructurado para la vista expandida (info completa + acción).
        data: {
            gaps,
            supplements,
            disclaimer: advice?.disclaimer || report?.disclaimer || null,
        },
    };
}

// Pregunta natural y accionable para el coach IA, con los números reales del gap.
function buildQuestion(g) {
    const isCeil = g.techo !== undefined && g.techo !== null;
    const n = (g.nutriente || '').toLowerCase();
    if (isCeil) {
        return `En mi plan, el ${n} quedó por encima del objetivo (${g.valor}${g.unidad}, techo ${g.techo}${g.unidad}). ¿Cómo lo reduzco sin afectar mis otras metas?`;
    }
    return `Mi plan se queda corto en ${n} (${g.valor}${g.unidad} de ${g.piso}${g.unidad}). ¿Qué alimentos o ajustes me recomiendas para subirlo?`;
}

export default function MicronutrientPanel({ report, advice, planId, onAsk }) {
    const gaps = report?.gaps || [];
    const supplements = advice?.items || [];
    const disclaimer = advice?.disclaimer || report?.disclaimer;
    // [P3-MICRO-SUBTITLE-ACCURACY · 2026-06-19] Subtítulo honesto: "por debajo del
    // objetivo" SOLO si todos los gaps son floor (déficit). Si hay un techo excedido
    // (ej. sodio alto a 136%), el neutro "fuera de rango" es lo correcto — antes decía
    // "por debajo" incluso para los nutrientes que iban POR ENCIMA del límite.
    const _hasCeilGap = gaps.some((g) => g.techo !== undefined && g.techo !== null);
    const _gapNoun = gaps.length === 1 ? 'nutriente' : 'nutrientes';
    // Clave de descarte por CONTENIDO (estable entre navegaciones). Leemos
    // también la clave legacy por planId para respetar descartes previos (sin
    // forzar una reaparición extra), pero ESCRIBIMOS siempre la de contenido.
    const _contentSig = microsContentSig(report, advice);
    const _contentKey = _contentSig ? `mealfit_micros_dismissed_c_${_contentSig}` : null;
    const _legacyKey = planId ? `mealfit_micros_dismissed_${planId}` : null;
    const dismissKey = _contentKey || _legacyKey;

    const _readDismissed = () =>
        (!!_contentKey && safeLocalStorageGet(_contentKey, '') === '1')
        || (!!_legacyKey && safeLocalStorageGet(_legacyKey, '') === '1');

    const [visible, setVisible] = useState(() => !_readDismissed());

    // Re-evalúa al cambiar las claves (timing de hidratación, o contenido nuevo
    // por recalc/regen). Refleja SIEMPRE si el contenido ACTUAL fue descartado:
    // ya descartado → oculto; contenido nuevo → visible. No pelea con la X
    // (descartar no cambia la key del mismo contenido → no re-corre).
    useEffect(() => {
        setVisible(!_readDismissed());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [_contentKey, _legacyKey]);

    // [P3-MICROS-RESTORE · 2026-06-19] El centro de notificaciones puede pedir
    // "desocultar" este panel. Si el evento es para ESTE contenido (o genérico,
    // sin sig), limpiamos su dismissal y lo volvemos a mostrar al instante.
    useEffect(() => {
        const onRestore = (e) => {
            const sig = e?.detail?.sig;
            if (sig && _contentSig && sig !== _contentSig) return; // no es para este contenido
            if (_contentKey) safeLocalStorageRemove(_contentKey);
            if (_legacyKey) safeLocalStorageRemove(_legacyKey);
            if (_contentSig) safeLocalStorageRemove(`mealfit_micros_notif_backfilled_c_${_contentSig}`);
            setVisible(true);
        };
        window.addEventListener(MICROS_RESTORE_EVENT, onRestore);
        return () => window.removeEventListener(MICROS_RESTORE_EVENT, onRestore);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [_contentKey, _legacyKey, _contentSig]);

    if (!gaps.length && !supplements.length) return null;

    const dismiss = () => {
        // [P3-NOTIF-CENTER · 2026-06-16] Archivar en el centro de notificaciones
        // antes de ocultar (resumen vía SSOT buildMicrosNotification, id estable
        // por contenido → re-descartar no duplica). Marca el backfill como hecho
        // (clave content-based, espeja la dismissal) para que el Dashboard no
        // re-cree esta notificación si luego la borras.
        const notif = buildMicrosNotification({ report, advice });
        if (notif) {
            addNotification(notif);
            if (_contentSig) safeLocalStorageSet(`mealfit_micros_notif_backfilled_c_${_contentSig}`, '1');
        }
        setVisible(false);
        if (dismissKey) safeLocalStorageSet(dismissKey, '1');
        // [P3-MICROS-RESTORE · 2026-06-19] Descubribilidad: avisar que NO se perdió
        // y que se puede volver a mostrar desde Notificaciones (la campana).
        toast('Panel oculto', {
            description: 'Quedó guardado en Notificaciones — ábrelas (campana) para volver a mostrarlo.',
        });
    };

    return (
        <AnimatePresence initial={false}>
            {visible && (
                <motion.section
                    className={styles.panel}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, marginBottom: 0, transition: { duration: 0.2 } }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    role="region"
                    aria-label="Micronutrientes a vigilar"
                >
                    <header className={styles.head}>
                        <span className={styles.badge} aria-hidden="true">
                            <FlaskConical size={16} strokeWidth={2.25} />
                        </span>
                        <div className={styles.headText}>
                            <h3 className={styles.title}>Micronutrientes a vigilar</h3>
                            {gaps.length > 0 && (
                                <span className={styles.sub}>
                                    <strong className={styles.subCount}>{gaps.length}</strong>{' '}
                                    {_gapNoun} {_hasCeilGap ? 'fuera de rango' : 'por debajo del objetivo'}
                                </span>
                            )}
                        </div>
                        <button
                            type="button"
                            className={styles.close}
                            onClick={dismiss}
                            aria-label="Ocultar este panel"
                            title="Ocultar"
                        >
                            <X size={16} strokeWidth={2.5} />
                        </button>
                    </header>

                    {gaps.length > 0 && (
                        <div className={styles.meters}>
                            {gaps.map((g, i) => {
                                const s = classify(g);
                                const ask = onAsk ? () => onAsk(buildQuestion(g), g.nutriente) : undefined;
                                const Tag = ask ? 'button' : 'div';
                                return (
                                    <Tag
                                        key={`mn-${i}`}
                                        type={ask ? 'button' : undefined}
                                        onClick={ask}
                                        className={`${styles.meter} ${styles[s.tone]} ${ask ? styles.clickable : ''}`}
                                        title={ask ? `Preguntarle al coach cómo mejorar tu ${(g.nutriente || '').toLowerCase()}` : undefined}
                                    >
                                        <div className={styles.meterTop}>
                                            <span className={styles.nutrient}>{g.nutriente}</span>
                                            <span className={styles.values}>
                                                <span className={styles.cur}>{g.valor}</span>
                                                <span className={styles.sep}>/ {s.target}{g.unidad}</span>
                                                {ask && (
                                                    <MessageCircle
                                                        size={14}
                                                        strokeWidth={2.25}
                                                        className={styles.askIcon}
                                                        aria-hidden="true"
                                                    />
                                                )}
                                            </span>
                                        </div>
                                        <div className={styles.barRow}>
                                            <div className={styles.track}>
                                                <div className={styles.fill} style={{ width: `${s.fill}%` }} />
                                            </div>
                                            <span className={styles.pill}>
                                                {s.kind === 'ceil'
                                                    ? <ArrowUp size={11} strokeWidth={2.75} aria-hidden="true" />
                                                    : <ArrowDown size={11} strokeWidth={2.75} aria-hidden="true" />}
                                                {s.pct}%
                                            </span>
                                        </div>
                                    </Tag>
                                );
                            })}
                        </div>
                    )}

                    {supplements.length > 0 && (
                        <div className={styles.supps}>
                            <span className={styles.suppsLabel}>
                                Sugerencias
                            </span>
                            {supplements.map((it, i) => (
                                <div key={`sup-${i}`} className={styles.supp}>
                                    <Pill size={13} strokeWidth={2.25} className={styles.suppIcon} aria-hidden="true" />
                                    <div className={styles.suppBody}>
                                        <div className={styles.suppMain}>
                                            <span className={styles.suppName}>{it.nutriente}</span>
                                            {it.dosis_sugerida && (
                                                <span className={styles.suppDose}>{it.dosis_sugerida}</span>
                                            )}
                                        </div>
                                        {(it.suplemento || it.primero_alimentos) && (
                                            <p className={styles.suppHint}>
                                                {it.suplemento && (
                                                    <>Como <span className={styles.suppForm}>{it.suplemento}</span></>
                                                )}
                                                {it.suplemento && it.primero_alimentos && ', o desde la comida: '}
                                                {!it.suplemento && it.primero_alimentos && 'Primero, desde la comida: '}
                                                {it.primero_alimentos}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {disclaimer && (
                        <p className={styles.foot}>
                            <Info size={12} strokeWidth={2.25} aria-hidden="true" />
                            <span>{disclaimer}</span>
                        </p>
                    )}
                </motion.section>
            )}
        </AnimatePresence>
    );
}
