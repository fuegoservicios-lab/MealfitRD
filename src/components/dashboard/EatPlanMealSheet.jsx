// [P1-EAT-PLAN-MEAL-TRUTH · 2026-09-04] La pregunta de un toque antes de «Me lo comí» cuando algo no
// cuadra: la hora (almuerzo a las 9:04) o la Nevera (0 de 6 ingredientes). No es una advertencia:
// cada respuesta es información que hoy se perdía. «Fue ayer» registra con fecha de ayer; «Comí otra
// cosa» abre el registro manual y deja el plato del plan como no seguido (adherencia real, que
// alimenta al coach y al bloque siguiente); «Todavía no» cancela y lleva a la lista.
import { useState } from 'react';
import PropTypes from 'prop-types';
import { Clock, Refrigerator, X } from 'lucide-react';
import { useT } from '../../i18n';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import styles from './EatPlanMealSheet.module.css';

const fmtHour = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export default function EatPlanMealSheet({ mealName, timing, coverage, now = new Date(), busy = false, onConfirm, onAteOther, onNotYet, onClose }) {
    const t = useT();
    const { containerRef } = useModalAccessibility({ isOpen: true, onClose });
    const [pending, setPending] = useState(null);
    const run = (key, fn) => async () => {
        if (busy || pending) return;
        setPending(key);
        try { await fn(); } finally { setPending(null); }
    };
    const slotLabel = timing ? {
        desayuno: t('un desayuno'), almuerzo: t('un almuerzo'), merienda: t('una merienda'), cena: t('una cena'),
    }[timing.slot] : null;

    return (
        <div className={styles.backdrop} role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div ref={containerRef} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="eat-sheet-title" tabIndex={-1}>
                <button type="button" className={`ui-close ${styles.close}`} onClick={onClose} aria-label={t('Cerrar')}><X size={18} /></button>
                <p className={styles.eyebrow}>{t('Me lo comí')}</p>
                <h2 id="eat-sheet-title" className={styles.title}>{t('¿Registrar {plato}?', { plato: mealName })}</h2>

                <div className={styles.facts}>
                    {timing && (
                        <p className={styles.fact}>
                            <span className={styles.factIcon}><Clock size={17} aria-hidden="true" /></span>
                            <span>{t('Son las {hora} y esto es {slot}.', { hora: fmtHour(now), slot: slotLabel })}</span>
                        </p>
                    )}
                    {coverage && (
                        <p className={styles.fact}>
                            <span className={styles.factIcon}><Refrigerator size={17} aria-hidden="true" /></span>
                            <span>{t('Tu Nevera tiene {n} de {total} ingredientes de este plato.', { n: coverage.present, total: coverage.total })}</span>
                        </p>
                    )}
                </div>

                <div className={styles.actions}>
                    <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={busy || !!pending} onClick={run('now', () => onConfirm({ daysAgo: 0 }))}>
                        {coverage && !timing ? t('Lo cociné igual, regístralo') : t('Lo comí ahora')}
                    </button>
                    {timing && (
                        <button type="button" className={`${styles.btn} ${styles.ghost}`} disabled={busy || !!pending} onClick={run('yesterday', () => onConfirm({ daysAgo: 1 }))}>
                            {t('Fue ayer')}
                        </button>
                    )}
                    {coverage && (
                        <>
                            <button type="button" className={`${styles.btn} ${styles.ghost}`} disabled={busy || !!pending} onClick={run('other', onAteOther)}>
                                {t('Comí otra cosa')}
                            </button>
                            <button type="button" className={`${styles.btn} ${styles.quiet}`} disabled={busy || !!pending} onClick={run('notyet', onNotYet)}>
                                {t('Todavía no lo comí')}
                            </button>
                        </>
                    )}
                </div>
                <p className={styles.hint}>
                    {coverage
                        ? t('Si comiste otra cosa, lo anotas en un momento y el plan aprende de ti; si lo cocinaste, marca también «Ya compré» para que la Nevera se ponga al día.')
                        : t('Registrar por adelantado confunde tu diario; si aún no lo comiste, vuelve cuando lo hagas.')}
                </p>
            </div>
        </div>
    );
}

EatPlanMealSheet.propTypes = {
    mealName: PropTypes.string.isRequired,
    timing: PropTypes.shape({ slot: PropTypes.string, start: PropTypes.number }),
    coverage: PropTypes.shape({ present: PropTypes.number, total: PropTypes.number }),
    now: PropTypes.instanceOf(Date),
    busy: PropTypes.bool,
    onConfirm: PropTypes.func.isRequired,
    onAteOther: PropTypes.func.isRequired,
    onNotYet: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
};
