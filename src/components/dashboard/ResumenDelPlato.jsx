// [P1-PLAN-LOTE-1154 · 2026-11-21] El total del plato escaneado, de un vistazo.
//
// El dueño: «mejora el diseño de la pantalla de revisar plato». Las calorías del plato vivían en el primero de
// cuatro campos de texto, debajo de la porción: lo más importante de la pantalla era lo más difícil de encontrar.
// Esto es lo mismo que «Tu plato» en «Registrar comida» (lote 1147): un anillo con el reparto de proteína,
// carbohidratos y grasa, el número grande y las tres cifras. Se mueve solo con las dudas, la porción y los
// ingredientes, porque lee las mismas macros que se van a registrar (`macrosDelPlato`).
import PropTypes from 'prop-types';
import { useT, formatNumber } from '../../i18n';
import styles from './ResumenDelPlato.module.css';

const R = 30;
const LARGO = 2 * Math.PI * R;

/** Pura. Los tramos del anillo: kcal de cada macro (4/4/9) repartidas sobre la circunferencia. */
export function tramosDelAnillo({ protein = 0, carbs = 0, healthy_fats = 0 } = {}) {
    const partes = [['p', Math.max(0, protein) * 4], ['c', Math.max(0, carbs) * 4], ['g', Math.max(0, healthy_fats) * 9]];
    const suma = partes.reduce((s, [, v]) => s + v, 0);
    if (suma <= 0) return [];
    let desde = 0;
    return partes.filter(([, v]) => v > 0).map(([k, v]) => {
        const tramo = { k, desde, largo: (v / suma) * LARGO };
        desde += tramo.largo;
        return tramo;
    });
}

export default function ResumenDelPlato({ macros }) {
    const t = useT();
    const m = macros || {};
    const tramos = tramosDelAnillo(m);
    const cifra = (v) => formatNumber(Math.round(Number(v) || 0));
    return (
        <div className={styles.resumen} role="group" aria-label={t('Total del plato')}>
            <div className={styles.anilloCaja}>
                <svg className={styles.anillo} viewBox="0 0 72 72" aria-hidden="true">
                    <circle className={styles.fondo} cx="36" cy="36" r={R} />
                    {tramos.map((s) => (
                        <circle key={s.k} className={`${styles.parte} ${styles[`parte_${s.k}`]}`} cx="36" cy="36" r={R}
                            strokeDasharray={`${Math.max(0, s.largo - 2)} ${LARGO}`} strokeDashoffset={-s.desde} />
                    ))}
                </svg>
            </div>
            <div className={styles.cifras}>
                <span className={styles.etiqueta}>{t('Total del plato')}</span>
                <span className={styles.kcal}><b>{cifra(m.calories)}</b> kcal</span>
                <div className={styles.macros}>
                    <span className={`${styles.macro} ${styles.macro_p}`}><b>{cifra(m.protein)} g</b> {t('proteína')}</span>
                    <span className={`${styles.macro} ${styles.macro_c}`}><b>{cifra(m.carbs)} g</b> {t('carbs')}</span>
                    <span className={`${styles.macro} ${styles.macro_g}`}><b>{cifra(m.healthy_fats)} g</b> {t('grasas')}</span>
                </div>
            </div>
        </div>
    );
}

ResumenDelPlato.propTypes = {
    macros: PropTypes.shape({
        calories: PropTypes.number,
        protein: PropTypes.number,
        carbs: PropTypes.number,
        healthy_fats: PropTypes.number,
    }),
};
