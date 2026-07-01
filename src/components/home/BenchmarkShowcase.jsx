import { useRef, useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Cpu, Target, Layers, Check, X, Minus, TrendingUp, Activity, Gauge, Radio } from 'lucide-react';
import { APP_VERSION } from '../../config/appVersion';
import SeeMoreLink from './SeeMoreLink';
import styles from './BenchmarkShowcase.module.css';

/* [P3-BENCHMARK-RADAR · 2026-06-30] Rediseño RADICAL: RADAR DE PRECISIÓN. El corazón es
   un radar/telaraña donde el polígono de Mealfit casi llena el gráfico y el de «LLM solo»
   colapsa (sobre todo el 24% de planes-en-banda) — la brecha se ve de un vistazo. Ejes =
   las 3 métricas del A/B (con dato real de AMBOS lados, honesto). Alrededor: los números
   exactos + precisión por macro + capacidades + highlights. Mantiene el shell "instrumento"
   (tilt 3D + scanlines) high-tech. Mismos datos REALES (benchmark N=8 jun 2026, motor
   P3-MACRO-REBALANCE). «LLM solo» = A/B interno con el motor apagado. Precisión de MACROS. */

const VERSION_SHORT = `V${String(APP_VERSION).split('.')[0]}`;

const MACROS = [
    { key: 'kcal', label: 'Calorías', mape: 2.0 },
    { key: 'fat', label: 'Grasas', mape: 3.1 },
    { key: 'carbs', label: 'Carbohidratos', mape: 3.2 },
    { key: 'protein', label: 'Proteína', mape: 1.5 },
];

// Ejes del radar = métricas Mealfit vs «LLM solo» (A/B con el motor apagado). Cada eje
// tiene dato REAL de ambos lados. `axis` = etiqueta corta para el vértice.
const VERSUS = [
    { label: 'Precisión de proteína', axis: 'Proteína', mealfit: 98.5, llm: 84 },
    { label: 'Los 4 macros en banda', axis: '4 macros', mealfit: 91.7, llm: 24 },
    { label: 'Macros que cuadran al recalcular', axis: 'Recalcular', mealfit: 100, llm: 0 },
];

const CAPS = [
    { label: 'Se ajusta a tus condiciones (DM2 · renal · HTA)', llm: 'partial' },
    { label: 'Lista de compras + Nevera automática', llm: 'x' },
    { label: 'Coach que ajusta tu plan', llm: 'partial' },
];

const HIGHLIGHTS = [
    { icon: Cpu, value: '100%', label: 'planes con macros calculados, no a ojo' },
    { icon: Target, value: '±3.2%', label: 'error medio en el peor macro' },
    { icon: Layers, value: '4', label: 'macros calibrados a la vez en cada comida' },
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

/* ── Radar de precisión (3 ejes = las 3 métricas del versus) ── */
function PrecisionRadar() {
    const reduce = useReducedMotion();
    const cx = 210;
    const cy = 176;
    const R = 138;
    const ang = (i) => ((-90 + i * 120) * Math.PI) / 180; // 0=arriba, +120 horario
    const pt = (i, frac) => [cx + R * frac * Math.cos(ang(i)), cy + R * frac * Math.sin(ang(i))];
    const ptA = (a, frac) => [cx + R * frac * Math.cos(a), cy + R * frac * Math.sin(a)];
    const poly = (fracs) => fracs.map((f, i) => pt(i, f).join(',')).join(' ');
    // barrido tipo scanner: cono de 52° desde el eje superior, gira sobre el radar.
    const sweepLead = pt(0, 1);
    const sweepTrail = ptA(ang(0) - (52 * Math.PI) / 180, 1);

    const mealfit = VERSUS.map((v) => v.mealfit / 100);
    const llm = VERSUS.map((v) => v.llm / 100);
    const rings = [0.25, 0.5, 0.75, 1];

    const grow = reduce
        ? {}
        : {
            initial: { opacity: 0, scale: 0.4 },
            whileInView: { opacity: 1, scale: 1 },
            viewport: { once: true, amount: 0.5 },
            style: { transformBox: 'fill-box', transformOrigin: 'center' },
        };

    return (
        <svg viewBox="0 0 420 384" className={styles.radarSvg} role="img"
            aria-label="Radar de precisión: el polígono de Mealfit casi llena el gráfico; el de un LLM solo colapsa.">
            {/* grid concéntrico + ejes */}
            {rings.map((g) => <polygon key={g} points={poly([g, g, g])} className={styles.radarGrid} />)}
            {[0, 1, 2].map((i) => {
                const [x, y] = pt(i, 1);
                return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className={styles.radarSpoke} />;
            })}

            {/* LLM (atrás, colapsado) */}
            <motion.polygon points={poly(llm)} className={styles.radarLlm}
                {...grow} transition={reduce ? undefined : { duration: 0.9, delay: 0.45, ease: 'easeOut' }} />
            {/* Mealfit (adelante, casi lleno) */}
            <motion.polygon points={poly(mealfit)} className={styles.radarMealfit}
                {...grow} transition={reduce ? undefined : { duration: 0.9, delay: 0.15, ease: [0.16, 1, 0.3, 1] }} />

            {/* barrido tipo radar (scanner) que gira sobre el gráfico */}
            {!reduce && (
                <g>
                    <defs>
                        <radialGradient id="hiwRadarSweep" cx={cx} cy={cy} r={R} gradientUnits="userSpaceOnUse">
                            <stop offset="0" stopColor="#2DD4BF" stopOpacity="0.32" />
                            <stop offset="1" stopColor="#2DD4BF" stopOpacity="0" />
                        </radialGradient>
                    </defs>
                    <polygon points={`${cx},${cy} ${sweepLead.join(',')} ${sweepTrail.join(',')}`} fill="url(#hiwRadarSweep)" />
                    <line x1={cx} y1={cy} x2={sweepLead[0]} y2={sweepLead[1]} className={styles.radarSweepEdge} />
                    <animateTransform attributeName="transform" attributeType="XML" type="rotate"
                        from={`0 ${cx} ${cy}`} to={`360 ${cx} ${cy}`} dur="4.5s" repeatCount="indefinite" />
                </g>
            )}

            {/* vértices */}
            {llm.map((f, i) => { const [x, y] = pt(i, f); return <circle key={`l${i}`} cx={x} cy={y} r="3.5" className={styles.radarDotLlm} />; })}
            {mealfit.map((f, i) => { const [x, y] = pt(i, f); return <circle key={`m${i}`} cx={x} cy={y} r="4.5" className={styles.radarDotMealfit} />; })}

            {/* etiquetas de eje */}
            {VERSUS.map((v, i) => {
                const [x, y] = pt(i, 1.14);
                const anchor = Math.abs(x - cx) < 6 ? 'middle' : (x > cx ? 'start' : 'end');
                return (
                    <text key={v.axis} x={x} y={y} className={styles.radarAxisLabel}
                        textAnchor={anchor} dominantBaseline={y < cy ? 'auto' : 'hanging'}>
                        {v.axis}
                    </text>
                );
            })}
        </svg>
    );
}

const Mark = ({ v }) => (v === 'x'
    ? <X size={12} strokeWidth={2.5} />
    : <Minus size={12} strokeWidth={3} />);

const BenchmarkShowcase = () => {
    const stageRef = useRef(null);
    const consoleRef = useRef(null);

    // Tilt 3D siguiendo el mouse (solo desktop; touch → estático).
    const onMove = (e) => {
        const stage = stageRef.current;
        const panel = consoleRef.current;
        if (!stage || !panel) return;
        const r = stage.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        panel.style.transform = `rotateX(${(-y * 4).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg)`;
    };
    const onLeave = () => {
        if (consoleRef.current) consoleRef.current.style.transform = 'rotateX(0deg) rotateY(0deg)';
    };

    return (
        <section className={styles.section} id="benchmarks">
            <div className={styles.bgGlow} aria-hidden="true" />

            <div className={styles.container}>
                <div className={styles.header}>
                    <span className={styles.modelBadge}>
                        <span className={styles.modelDot} aria-hidden="true" />
                        Mealfit {VERSION_SHORT}
                    </span>
                    <h2 className={styles.title}>
                        Precisión que <span className={styles.gradientText}>puedes medir</span>
                    </h2>
                    <p className={styles.subtitle}>
                        No prometemos números — los medimos. Y los comparamos contra lo que hay afuera:
                        pedirle un plan a un LLM, sin un motor que cuadre tus macros.
                    </p>
                </div>

                {/* ── Consola de telemetría (radar) ── */}
                <div className={styles.stage} ref={stageRef} onMouseMove={onMove} onMouseLeave={onLeave}>
                    <div className={styles.console} ref={consoleRef}>
                        <div className={styles.scanlines} aria-hidden="true" />

                        <div className={styles.consoleHead}>
                            <span className={styles.live}>
                                <span className={styles.liveDot} aria-hidden="true" /> MEDICIÓN EN VIVO
                            </span>
                            <span className={styles.consoleVer}><Radio size={11} strokeWidth={2.5} /> Motor v{APP_VERSION}</span>
                            <span className={styles.consoleBadge}>
                                <TrendingUp size={12} strokeWidth={2.75} /> 3.8× más precisos
                            </span>
                        </div>

                        <div className={styles.consoleBody}>
                            {/* Radar (izquierda) */}
                            <div className={styles.radarCol}>
                                <span className={styles.panelLabel}><Gauge size={12} strokeWidth={2.5} /> Mealfit vs LLM solo</span>
                                <div className={styles.radarWrap}>
                                    <PrecisionRadar />
                                </div>
                                <div className={styles.legend}>
                                    <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.legendMealfit}`} /> Mealfit</span>
                                    <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.legendLlm}`} /> LLM solo</span>
                                </div>
                            </div>

                            {/* Datos (derecha) */}
                            <div className={styles.dataCol}>
                                {/* versus — números exactos */}
                                <div className={styles.versus}>
                                    {VERSUS.map((v) => (
                                        <div key={v.label} className={styles.vRow}>
                                            <span className={styles.vLabel}>{v.label}</span>
                                            <span className={styles.vVals}>
                                                <span className={styles.vMealfit}><CountUp to={v.mealfit} decimals={v.mealfit === 100 ? 0 : 1} /></span>
                                                <span className={styles.vVs}>vs</span>
                                                <span className={styles.vLlm}>{v.llm}%</span>
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {/* precisión por macro */}
                                <span className={styles.panelLabelSub}><Activity size={12} strokeWidth={2.5} /> Precisión por macro</span>
                                <div className={styles.macroGrid}>
                                    {MACROS.map((m) => {
                                        const pct = Number((100 - m.mape).toFixed(1));
                                        return (
                                            <div key={m.key} className={styles.macroCell}>
                                                <span className={styles.macroVal}><CountUp to={pct} decimals={1} /></span>
                                                <span className={styles.macroLabel}>{m.label}</span>
                                                <span className={styles.macroErr}>±{m.mape}%</span>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* capacidades */}
                                <div className={styles.caps}>
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

                        <div className={styles.highlights}>
                            {HIGHLIGHTS.map((h) => {
                                const Icon = h.icon;
                                return (
                                    <div key={h.label} className={styles.highlight}>
                                        <span className={styles.highlightIcon} aria-hidden="true"><Icon size={16} strokeWidth={2.5} /></span>
                                        <div className={styles.highlightText}>
                                            <strong>{h.value}</strong>
                                            <span>{h.label}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <p className={styles.footnote}>
                    <strong>Metodología.</strong> Es una prueba A/B del mismo pipeline de generación, con y sin
                    nuestro motor de optimización determinista — comparamos <strong>enfoques</strong>, no productos
                    con nombre. «Sin motor (LLM solo)» es lo que obtienes al pedirle el plan directamente a un
                    modelo de lenguaje, sin nada que cuadre tus macros. La precisión se mide con el{' '}
                    <strong>MAPE</strong> (error absoluto porcentual medio); «en banda» = dentro del 90–112% del
                    objetivo (95–105% en calorías). Son métricas de <strong>precisión de macros</strong> —qué tan
                    cerca queda el plan de tus números—, no de corrección clínica, y no constituyen consejo médico.
                    Medición continua sobre planes reales.
                </p>

                <SeeMoreLink to="/precision">Ver la metodología completa</SeeMoreLink>
            </div>
        </section>
    );
};

export default BenchmarkShowcase;
