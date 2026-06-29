import PropTypes from 'prop-types';
import { ArrowLeft, ArrowRight, Menu } from 'lucide-react';
import styles from './PlanObjetivo.module.css';

/* [P3-PLANOBJETIVO-MOBILE · 2026-06-29] Pantalla móvil inmersiva de "Plan & Objetivo".
   Presentacional puro: recibe objetivo + kcal + macros + handlers. La barra superior
   (logo + menú) y el botón "Volver" son opcionales (`topBar` / `backButton`) para
   poder reusar el chrome existente cuando se monta dentro del DashboardLayout, sin
   duplicar logo/hamburguesa. La barra de macros es proporcional a los gramos. */

const MACRO_META = [
    { key: 'protein', label: 'Proteína', color: '#818CF8' },
    { key: 'carbs', label: 'Carbos', color: '#34D399' },
    { key: 'fat', label: 'Grasas', color: '#FBBF24' },
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
    evaluateLabel = 'Evaluar de nuevo',
}) {
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
                        Mealfit<span style={{ color: 'var(--primary)' }}>R</span><span style={{ color: 'var(--accent)' }}>D</span>
                    </div>
                    <button
                        type="button"
                        className={styles.menuBtn}
                        onClick={onMenu}
                        aria-label="Abrir menú"
                    >
                        <Menu size={22} strokeWidth={2.25} />
                    </button>
                </header>
            )}

            {backButton && (
                <button type="button" className={styles.backBtn} onClick={onBack} aria-label="Volver">
                    <ArrowLeft size={20} strokeWidth={2.5} />
                    <span>Volver</span>
                </button>
            )}

            <h1 className={styles.title}>Plan &amp; Objetivo</h1>
            <p className={styles.subtitle}>Meta principal y calorías</p>

            <div className={styles.sectionLabel}>Tu objetivo actual</div>

            <div className={styles.metaLabel}>Meta principal</div>
            <h2 className={styles.goal}>{goal}</h2>

            <div className={styles.kcalValue}>
                {Number(kcal || 0).toLocaleString('es-DO')}
                <span className={styles.kcalUnit}>kcal</span>
            </div>
            <div className={styles.kcalCaption}>Calorías diarias objetivo</div>

            {/* Barra de macros (proporcional a gramos) */}
            <div className={styles.macroBar} role="img"
                aria-label={`Proteína ${grams.protein}g, Carbos ${grams.carbs}g, Grasas ${grams.fat}g`}>
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

            <button
                type="button"
                className={styles.cta}
                onClick={onEvaluate}
                disabled={evaluateDisabled}
            >
                {evaluateLabel}
                {!evaluateDisabled && <ArrowRight size={19} strokeWidth={2.25} className={styles.ctaArrow} />}
            </button>
        </div>
    );
}

PlanObjetivo.propTypes = {
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
