import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FlaskConical, X, Pill, Info, ArrowDown, ArrowUp, Sparkles } from 'lucide-react';
import { safeLocalStorageGet, safeLocalStorageSet } from '../../utils/safeLocalStorage';
import styles from './MicronutrientPanel.module.css';

/* [P3-MICRONUTRIENT-PANEL · 2026-06-15] Rediseño del panel "Micronutrientes a
   vigilar". Antes era texto plano (bullets). Ahora cada gap es un MEDIDOR de
   progreso (actual vs objetivo) con %, color por severidad y pill de estado —
   el lenguaje de las plataformas de salud modernas. Dismissible (X, persistido
   por plan_id). Las barras se renderizan ESTÁTICAS (sin animación de llenado)
   para no leerse como "cargando" — el feel moderno lo dan gradiente/glow/layout.

   Data del backend (FS4/FS8): report.gaps[] = {nutriente, valor, unidad, piso,
   techo, status}; advice.items[] = {nutriente, suplemento, dosis_sugerida,
   primero_alimentos}; disclaimer en cualquiera de los dos. */

// Clasifica un gap → fracción de barra (0..100), % real, tono y etiqueta.
function classify(g) {
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

export default function MicronutrientPanel({ report, advice, planId }) {
    const gaps = report?.gaps || [];
    const supplements = advice?.items || [];
    const disclaimer = advice?.disclaimer || report?.disclaimer;
    const dismissKey = planId ? `mealfit_micros_dismissed_${planId}` : null;

    const [visible, setVisible] = useState(
        () => !(dismissKey && safeLocalStorageGet(dismissKey, '') === '1')
    );

    if (!gaps.length && !supplements.length) return null;

    const dismiss = () => {
        setVisible(false);
        if (dismissKey) safeLocalStorageSet(dismissKey, '1');
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
                                    {gaps.length} {gaps.length === 1 ? 'nutriente por debajo del objetivo' : 'nutrientes por debajo del objetivo'}
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
                                return (
                                    <div key={`mn-${i}`} className={`${styles.meter} ${styles[s.tone]}`}>
                                        <div className={styles.meterTop}>
                                            <span className={styles.nutrient}>{g.nutriente}</span>
                                            <span className={styles.values}>
                                                <span className={styles.cur}>{g.valor}</span>
                                                <span className={styles.sep}>/ {s.target}{g.unidad}</span>
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
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {supplements.length > 0 && (
                        <div className={styles.supps}>
                            <span className={styles.suppsLabel}>
                                <Sparkles size={11} strokeWidth={2.5} aria-hidden="true" />
                                Sugerencias
                            </span>
                            {supplements.map((it, i) => (
                                <div key={`sup-${i}`} className={styles.supp}>
                                    <Pill size={13} strokeWidth={2.25} className={styles.suppIcon} aria-hidden="true" />
                                    <span className={styles.suppText}>
                                        <strong>{it.nutriente}</strong> · {it.suplemento} {it.dosis_sugerida}
                                        {it.primero_alimentos && (
                                            <span className={styles.suppHint}> — primero alimentos: {it.primero_alimentos}</span>
                                        )}
                                    </span>
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
