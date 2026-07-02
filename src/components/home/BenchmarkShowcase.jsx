import { useRef, useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, X, Minus, FlaskConical } from 'lucide-react';
import { APP_VERSION } from '../../config/appVersion';
import SeeMoreLink from './SeeMoreLink';
import styles from './BenchmarkShowcase.module.css';

/* [P3-BENCHMARK-LAB · 2026-07-02] Rediseño: LÁMINA DE LABORATORIO. Reemplaza la consola
   3D (radar + tilt + scanlines) por una lámina científica en el lenguaje minimalista
   aprobado (hairlines, papel milimetrado, indigo único, pies "Fig. —"):
   A · blanco de dispersión del error — el cluster de Mealfit (4 macros, ±1.5–3.2%)
       apretado al centro vs el LLM solo en la zona achurada "fuera de banda". Es la
       metáfora canónica de precisión (agrupación de impactos sobre diana calibrada).
   B · barras A/B duales con los números exactos + tabla de capacidades.
   C · regla de error por macro (MAPE) con marcadores tipo instrumento.
   MISMOS datos reales del benchmark (N=8 jun 2026, sincronizados con /precision —
   regla: las cifras viven en DOS sitios, cambiarlas en ambos). */

const VERSION_SHORT = `V${String(APP_VERSION).split('.')[0]}`;

const MACROS = [
    { key: 'protein', label: 'Proteína', mape: 1.5 },
    { key: 'kcal', label: 'Calorías', mape: 2.0 },
    { key: 'fat', label: 'Grasas', mape: 3.1 },
    { key: 'carbs', label: 'Carbohidratos', mape: 3.2 },
];

const VERSUS = [
    { label: 'Precisión de proteína', mealfit: 98.5, llm: 84 },
    { label: 'Los 4 macros en banda', mealfit: 91.7, llm: 24 },
    { label: 'Macros que cuadran al recalcular', mealfit: 100, llm: 0 },
];

const CAPS = [
    { label: 'Se ajusta a tus condiciones (DM2 · renal · HTA)', llm: 'partial' },
    { label: 'Lista de compras + Nevera automática', llm: 'x' },
    { label: 'Coach que ajusta tu plan', llm: 'partial' },
];

const STATS = [
    { value: '3.8×', label: 'más precisos que un LLM solo' },
    { value: '100%', label: 'planes con macros calculados, no a ojo' },
    { value: '±3.2%', label: 'error medio en el peor macro' },
    { value: '4', label: 'macros calibrados a la vez en cada comida' },
];

/* Contador que sube de 0 al valor cuando entra en pantalla (IntersectionObserver +
   requestAnimationFrame, sin dependencias). easeOutCubic. */
function CountUp({ to, decimals = 1, suffix = '%', duration = 1600 }) {
    const ref = useRef(null);
    const [text, setText] = useState(() => (
        typeof IntersectionObserver === 'undefined' ? to.toFixed(decimals) : (0).toFixed(decimals)
    ));
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof IntersectionObserver === 'undefined') return undefined;
        let raf;
        let started = false;
        const obs = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !started) {
                started = true;
                obs.disconnect();
                const t0 = performance.now();
                const tick = (now) => {
                    const p = Math.min(1, (now - t0) / duration);
                    const eased = 1 - Math.pow(1 - p, 3);
                    setText((to * eased).toFixed(decimals));
                    if (p < 1) raf = requestAnimationFrame(tick);
                };
                raf = requestAnimationFrame(tick);
            }
        }, { threshold: 0.4 });
        obs.observe(el);
        return () => { obs.disconnect(); if (raf) cancelAnimationFrame(raf); };
    }, [to, decimals, duration]);
    return <span ref={ref}>{text}{suffix}</span>;
}

/* ── Fig. 01 — blanco de dispersión del error ──
   Escala radial NO lineal (raíz cuadrada, 0–±20%) para que el cluster de ±1.5–3.2%
   sea legible junto al ±16% del LLM. Anillos en ±2/±5/±10/±20; la corona achurada
   (>±10%) es la zona "fuera de banda" (banda = 90–112% del objetivo). */
const CX = 180;
const CY = 160;
const R_MAX = 130;
const ERR_MAX = 20;
const rOf = (err) => R_MAX * Math.sqrt(err / ERR_MAX);
const at = (err, deg) => {
    const rad = (deg * Math.PI) / 180;
    return [CX + rOf(err) * Math.cos(rad), CY + rOf(err) * Math.sin(rad)];
};

// Posiciones angulares fijas (deterministas) de los 4 macros de Mealfit sobre la diana.
const MEALFIT_SHOTS = [
    { err: 1.5, deg: -68 },   // proteína
    { err: 2.0, deg: 160 },   // calorías
    { err: 3.1, deg: 40 },    // grasas
    { err: 3.2, deg: 250 },   // carbohidratos
];
const LLM_SHOT = at(16, 205); // proteína LLM solo: 100 − 84 = ±16% (medido)

function DispersionTarget() {
    const rings = [2, 5, 10, 20];
    const bandMid = (rOf(10) + R_MAX) / 2;
    const bandWidth = R_MAX - rOf(10);
    return (
        <svg
            viewBox="0 0 360 320"
            className={styles.figSvg}
            role="img"
            aria-label="Blanco de dispersión: los 4 macros de Mealfit agrupados al centro (error ±1.5 a ±3.2%); el LLM solo cae en la zona fuera de banda (±16% en proteína)."
        >
            <defs>
                <pattern id="bmLabHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="6" className={styles.figHatch} />
                </pattern>
            </defs>

            {/* corona "fuera de banda" (>±10%) */}
            <circle cx={CX} cy={CY} r={bandMid} fill="none" stroke="url(#bmLabHatch)" strokeWidth={bandWidth} opacity="0.5" />
            <text x="256" y="80" className={styles.figNote}>fuera de banda</text>

            {/* ejes + anillos + escala */}
            <line x1={CX - R_MAX - 12} y1={CY} x2={CX + R_MAX + 12} y2={CY} className={styles.figDash} />
            <line x1={CX} y1={CY - R_MAX - 12} x2={CX} y2={CY + R_MAX + 12} className={styles.figDash} />
            {rings.map((e) => <circle key={e} cx={CX} cy={CY} r={rOf(e)} className={styles.figLine} />)}
            {rings.map((e) => (
                <text key={`t${e}`} x={CX + 4} y={CY - rOf(e) - 4} className={styles.figTick}>±{e}%</text>
            ))}

            {/* cluster Mealfit: círculo del peor macro + impactos */}
            <circle cx={CX} cy={CY} r={rOf(3.2)} className={styles.figCluster} />
            <text x={CX + 56} y={CY - 42} className={styles.figClusterLabel}>±3.2%</text>
            {MEALFIT_SHOTS.map((s) => {
                const [x, y] = at(s.err, s.deg);
                return <circle key={s.deg} cx={x} cy={y} r="4.5" className={styles.figShot} />;
            })}

            {/* impacto del LLM solo (proteína, medido) */}
            <circle cx={LLM_SHOT[0]} cy={LLM_SHOT[1]} r="4" className={styles.figShotLlm} />
            <text x={LLM_SHOT[0] + 11} y={LLM_SHOT[1] - 5} className={styles.figNote}>
                <tspan x={LLM_SHOT[0] + 11}>LLM solo</tspan>
                <tspan x={LLM_SHOT[0] + 11} dy="11">proteína ±16%</tspan>
            </text>
        </svg>
    );
}

/* Barra horizontal del duelo A/B (respeta prefers-reduced-motion). */
function Bar({ value, llm = false, delay = 0 }) {
    const reduce = useReducedMotion();
    const cls = llm ? `${styles.duelFill} ${styles.duelFillLlm}` : styles.duelFill;
    return (
        <div className={styles.duelTrack}>
            {reduce ? (
                <div className={cls} style={{ width: `${value}%` }} />
            ) : (
                <motion.div
                    className={cls}
                    initial={{ width: 0 }}
                    whileInView={{ width: `${value}%` }}
                    viewport={{ once: true, amount: 0.6 }}
                    transition={{ duration: 0.8, delay, ease: 'easeOut' }}
                />
            )}
        </div>
    );
}

const Mark = ({ v }) => (v === 'x'
    ? <X size={12} strokeWidth={2.5} />
    : <Minus size={12} strokeWidth={3} />);

const RULER_MAX = 4; // escala de la regla C: 0 → ±4%

const BenchmarkShowcase = () => (
    <section className={styles.section} id="benchmarks">
        <div className={styles.bgGrid} aria-hidden="true" />

        <div className={styles.container}>
            <div className={styles.header}>
                <span className={styles.eyebrow}>
                    <span className={styles.eyeDot} aria-hidden="true" />
                    Benchmark · Mealfit {VERSION_SHORT}
                </span>
                <h2 className={styles.title}>
                    Precisión que <span className={styles.titleAccent}>puedes medir</span>
                </h2>
                <p className={styles.subtitle}>
                    No prometemos números — los medimos. Y los comparamos contra lo que hay afuera:
                    pedirle un plan a un LLM, sin un motor que cuadre tus macros.
                </p>
            </div>

            {/* ── Lámina de laboratorio ── */}
            <div className={styles.plate}>
                <div className={styles.plateHead}>
                    <span className={styles.plateKicker}>
                        <span className={styles.plateDot} aria-hidden="true" />
                        Banco de pruebas — A/B con y sin motor
                    </span>
                    <span className={styles.plateVer}>Motor v{APP_VERSION} · medición continua</span>
                </div>

                <div className={styles.plateGrid}>
                    {/* A · dispersión del error */}
                    <figure className={styles.panel}>
                        <span className={styles.panelKicker}>A · Dispersión del error</span>
                        <div className={`${styles.figCanvas} ${styles.gridPaper}`}>
                            <DispersionTarget />
                        </div>
                        <div className={styles.figLegend}>
                            <span className={styles.legendItem}><span className={styles.swatchMealfit} /> Mealfit · 4 macros</span>
                            <span className={styles.legendItem}><span className={styles.swatchLlm} /> LLM solo</span>
                            <span className={styles.legendItem}><span className={styles.swatchBand} /> fuera de banda</span>
                        </div>
                        <figcaption className={styles.figCaption}>
                            Fig. 01 — Error medio por macro sobre diana calibrada (escala radial no lineal)
                        </figcaption>
                    </figure>

                    {/* B · resultados del A/B */}
                    <div className={`${styles.panel} ${styles.panelRight}`}>
                        <span className={styles.panelKicker}>B · Mealfit vs LLM solo</span>
                        <div className={styles.duels}>
                            {VERSUS.map((v, i) => (
                                <div key={v.label} className={styles.duel}>
                                    <span className={styles.duelLabel}>{v.label}</span>
                                    <div className={styles.duelRow}>
                                        <Bar value={v.mealfit} delay={0.1 + i * 0.08} />
                                        <span className={styles.duelVal}>
                                            <CountUp to={v.mealfit} decimals={v.mealfit === 100 ? 0 : 1} />
                                        </span>
                                    </div>
                                    <div className={styles.duelRow}>
                                        <Bar value={Math.max(v.llm, 1)} llm delay={0.18 + i * 0.08} />
                                        <span className={`${styles.duelVal} ${styles.duelValLlm}`}>{v.llm}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* capacidades */}
                        <div className={styles.caps}>
                            <div className={styles.capsHead}>
                                <span className={styles.panelKicker}>Capacidades</span>
                                <span className={styles.capsLlmHead}>LLM solo</span>
                            </div>
                            {CAPS.map((c) => (
                                <div key={c.label} className={styles.capRow}>
                                    <span className={styles.capCheck}><Check size={13} strokeWidth={3} /></span>
                                    <span className={styles.capLabel}>{c.label}</span>
                                    <span className={styles.capLlm}><Mark v={c.llm} /></span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* C · regla de error por macro */}
                <div className={styles.rulerBlock}>
                    <span className={styles.panelKicker}>C · Error medio por macro (MAPE)</span>
                    <div className={styles.ruler}>
                        <div className={styles.rulerLine} aria-hidden="true" />
                        {[0, 1, 2, 3, 4].map((t) => (
                            <span key={t} className={styles.rulerTick} style={{ left: `${(t / RULER_MAX) * 100}%` }}>
                                <i aria-hidden="true" /><b>±{t}%</b>
                            </span>
                        ))}
                        {MACROS.map((m, i) => (
                            <span
                                key={m.key}
                                className={`${styles.marker} ${i % 2 ? styles.markerDown : styles.markerUp}`}
                                style={{ left: `${(m.mape / RULER_MAX) * 100}%` }}
                            >
                                <span className={styles.markerLabel}>{m.label} ±{m.mape}%</span>
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* tira de lectura */}
            <div className={styles.stats}>
                {STATS.map((s) => (
                    <div key={s.label} className={styles.stat}>
                        <span className={styles.statNum}>{s.value}</span>
                        <span className={styles.statLabel}>{s.label}</span>
                    </div>
                ))}
            </div>

            <div className={styles.footnote}>
                <FlaskConical size={15} strokeWidth={2.25} className={styles.footnoteIcon} aria-hidden="true" />
                <p className={styles.footnoteText}>
                    <strong>Metodología.</strong> Es una prueba A/B del mismo pipeline de generación, con y sin
                    nuestro motor de optimización determinista — comparamos <strong>enfoques</strong>, no productos
                    con nombre. «Sin motor (LLM solo)» es lo que obtienes al pedirle el plan directamente a un
                    modelo de lenguaje, sin nada que cuadre tus macros. La precisión se mide con el{' '}
                    <strong>MAPE</strong> (error absoluto porcentual medio); «en banda» = dentro del 90–112% del
                    objetivo (95–105% en calorías). Son métricas de <strong>precisión de macros</strong> —qué tan
                    cerca queda el plan de tus números—, no de corrección clínica, y no constituyen consejo médico.
                    Medición continua sobre planes reales.
                </p>
            </div>

            <SeeMoreLink to="/precision">Ver la metodología completa</SeeMoreLink>
        </div>
    </section>
);

export default BenchmarkShowcase;
