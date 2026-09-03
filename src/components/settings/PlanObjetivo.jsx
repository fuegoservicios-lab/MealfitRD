import PropTypes from 'prop-types';
import { ArrowLeft, ArrowRight, Menu } from 'lucide-react';
import styles from './PlanObjetivo.module.css';
import Wordmark from '../common/Wordmark';
// [P1-I18N-DASHBOARD · 2026-08-15] `tModulo` es la `t` de módulo y se usa SOLO en
// el valor por defecto de `evaluateLabel`. No es la trampa del `t()` en ámbito de
// módulo: un parámetro por defecto se evalúa en cada LLAMADA —o sea, en cada
// render— así que lee el catálogo ya cargado. En el cuerpo va `useT()`, que
// además suscribe el componente al cambio de idioma.
import { useT, t as tModulo, formatNumber } from '../../i18n';

/* [P3-PLANOBJETIVO-MOBILE · 2026-06-29] Pantalla móvil inmersiva de "Plan & Objetivo".
   Presentacional puro: recibe objetivo + kcal + macros + handlers. La barra superior
   (logo + menú) y el botón "Volver" son opcionales (`topBar` / `backButton`) para
   poder reusar el chrome existente cuando se monta dentro del DashboardLayout, sin
   duplicar logo/hamburguesa. La barra de macros es proporcional a los gramos. */

// Función y no constante: `key` y `color` son datos, pero `label` es copy y una
// tabla de copy evaluada al importar se queda en español para siempre.
const getMacroMeta = (t) => [
    { key: 'protein', label: t('Proteína'), color: '#818CF8' },
    { key: 'carbs', label: t('Carbos'), color: '#34D399' },
    { key: 'fat', label: t('Grasas'), color: '#FBBF24' },
];

export default function PlanObjetivo({
    goal,
    kcal,
    macros,
    onBack,
    onMenu,
    onEvaluate,
    topBar = true,
    backButton = true,
    evaluateDisabled = false,
    evaluateLabel = tModulo('Evaluar de nuevo'),
    // [P2-PLAN-LIMIT-BLOCK · 2026-09-03] Contenido que SUSTITUYE al botón (estado «sin créditos»).
    ctaSlot = null,
}) {
    const t = useT();
    const MACRO_META = getMacroMeta(t);
    const grams = {
        protein: Number(macros?.protein) || 0,
        carbs: Number(macros?.carbs) || 0,
        fat: Number(macros?.fat) || 0,
    };
    const total = grams.protein + grams.carbs + grams.fat;
    // Si no hay macros aún, reparte en tercios para no romper la barra.
    const pct = (g) => (total > 0 ? (g / total) * 100 : 100 / 3);

    return (
        <div className={styles.screen}>
            {topBar && (
                <header className={styles.topBar}>
                    <div className={styles.logo}>
                        <Wordmark />
                    </div>
                    <button
                        type="button"
                        className={styles.menuBtn}
                        onClick={onMenu}
                        aria-label={t('Abrir menú')}
                    >
                        <Menu size={22} strokeWidth={2.25} />
                    </button>
                </header>
            )}

            {backButton && (
                <button type="button" className={styles.backBtn} onClick={onBack} aria-label={t('Volver')}>
                    <ArrowLeft size={20} strokeWidth={2.5} />
                    <span>{t('Volver')}</span>
                </button>
            )}

            <h1 className={styles.title}>{t('Plan & Objetivo')}</h1>
            <p className={styles.subtitle}>{t('Meta principal y calorías')}</p>

            <div className={styles.sectionLabel}>{t('Tu objetivo actual')}</div>

            <div className={styles.metaLabel}>{t('Meta principal')}</div>
            <h2 className={styles.goal}>{goal}</h2>

            <div className={styles.kcalValue}>
                {/* [P1-I18N-DASHBOARD · 2026-08-15] `formatNumber` sigue al idioma
                    activo; el `'es-DO'` clavado dejaba el separador español en una
                    pantalla en inglés, donde ese punto se lee como decimal. */}
                {formatNumber(Number(kcal || 0))}
                <span className={styles.kcalUnit}>kcal</span>
            </div>
            <div className={styles.kcalCaption}>{t('Calorías diarias objetivo')}</div>

            {/* Barra de macros (proporcional a gramos) */}
            <div className={styles.macroBar} role="img"
                aria-label={t('Proteína {proteina}g, Carbos {carbos}g, Grasas {grasas}g', { proteina: grams.protein, carbos: grams.carbs, grasas: grams.fat })}>
                {MACRO_META.map((m) => (
                    <span
                        key={m.key}
                        className={styles.macroSeg}
                        style={{ width: `${pct(grams[m.key])}%`, background: m.color }}
                    />
                ))}
            </div>

            <div className={styles.macroCols}>
                {MACRO_META.map((m) => (
                    <div className={styles.macroCol} key={m.key}>
                        <div className={styles.macroColTop}>
                            <span className={styles.macroDot} style={{ background: m.color }} />
                            <span className={styles.macroColLabel}>{m.label}</span>
                        </div>
                        <div className={styles.macroColValue}>{grams[m.key]}g</div>
                    </div>
                ))}
            </div>

            <div className={styles.spacer} />

            {ctaSlot || (
                <button
                    type="button"
                    className={styles.cta}
                    onClick={onEvaluate}
                    disabled={evaluateDisabled}
                >
                    {evaluateLabel}
                    {!evaluateDisabled && <ArrowRight size={19} strokeWidth={2.25} className={styles.ctaArrow} />}
                </button>
            )}
        </div>
    );
}

PlanObjetivo.propTypes = {
    ctaSlot: PropTypes.node,
    goal: PropTypes.string.isRequired,
    kcal: PropTypes.number,
    macros: PropTypes.shape({
        protein: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
        carbs: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
        fat: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    }),
    onBack: PropTypes.func,
    onMenu: PropTypes.func,
    onEvaluate: PropTypes.func,
    topBar: PropTypes.bool,
    backButton: PropTypes.bool,
    evaluateDisabled: PropTypes.bool,
    evaluateLabel: PropTypes.string,
};
