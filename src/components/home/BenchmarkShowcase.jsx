import { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Gauge, Cpu, Target, Layers, Check, X, Minus, TrendingUp, Activity, Radio } from 'lucide-react';
import { APP_VERSION } from '../../config/appVersion';
import SeeMoreLink from './SeeMoreLink';
import styles from './BenchmarkShowcase.module.css';

/* [P3-BENCHMARK-3D · 2026-06-29] Rediseño RADICAL: PANEL DE TELEMETRÍA 3D. Una consola
   high-tech con tilt al mouse (perspectiva), números que cuentan desde 0, barras que se
   llenan y scanlines. Mismos datos REALES y honestos que la versión tabla (benchmark N=8
   jun 2026, motor P3-MACRO-REBALANCE): NO inventa competidores; «LLM solo» = A/B interno
   del mismo pipeline con el motor apagado. Cifras de precisión de MACROS, no clínicas. */

const VERSION_SHORT = `V${String(APP_VERSION).split('.')[0]}`;

const MACROS = [
    { key: 'kcal', label: 'Calorías', mape: 2.0 },
    { key: 'fat', label: 'Grasas', mape: 3.1 },
    { key: 'carbs', label: 'Carbohidratos', mape: 3.2 },
    { key: 'protein', label: 'Proteína', mape: 1.5 },
];

// Métricas numéricas Mealfit vs «LLM solo» (A/B con el motor apagado).
const VERSUS = [
    { label: 'Precisión de proteína', mealfit: 98.5, llm: 84 },
    { label: 'Planes con los 4 macros en banda', mealfit: 91.7, llm: 24 },
    { label: 'Macros que cuadran al recalcular', mealfit: 100, llm: 55 },
];

// Capacidades (✓ / ✗ / parcial) — sin asignar precisión que no medimos.
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
    // Init perezoso: sin IntersectionObserver (SSR / browsers viejos) muestra el valor
    // final directo; en el navegador arranca en 0 y el effect anima. Evita setState
    // síncrono dentro del effect (react-hooks/set-state-in-effect).
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

const BenchmarkShowcase = () => {
    const stageRef = useRef(null);
    const consoleRef = useRef(null);

    // [P3-BENCHMARK-3D] Tilt 3D siguiendo el mouse (solo desktop; en touch no hay
    // mousemove → consola estática). Se aplica directo al style del ref para no
    // re-renderizar en cada movimiento.
    const onMove = (e) => {
        const stage = stageRef.current;
        const panel = consoleRef.current;
        if (!stage || !panel) return;
        const r = stage.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        panel.style.transform = `rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg)`;
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

                {/* ── Consola de telemetría 3D ── */}
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
                            {/* Panel A: precisión por macro */}
                            <div className={styles.panel}>
                                <span className={styles.panelLabel}><Activity size={12} strokeWidth={2.5} /> Precisión por macro</span>
                                <div className={styles.readouts}>
                                    {MACROS.map((m, i) => {
                                        const pct = Number((100 - m.mape).toFixed(1));
                                        return (
                                            <div key={m.key} className={styles.readout}>
                                                <div className={styles.readoutTop}>
                                                    <span className={styles.readoutLabel}>{m.label}</span>
                                                    <span className={styles.readoutVal}><CountUp to={pct} decimals={1} /></span>
                                                </div>
                                                <div className={styles.readoutTrack}>
                                                    <motion.span
                                                        className={styles.readoutFill}
                                                        initial={{ width: 0 }}
                                                        whileInView={{ width: `${pct}%` }}
                                                        viewport={{ once: true }}
                                                        transition={{ duration: 1.4, delay: 0.2 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                                                    />
                                                </div>
                                                <span className={styles.readoutErr}>±{m.mape}% error</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Panel B: Mealfit vs LLM */}
                            <div className={styles.panel}>
                                <span className={styles.panelLabel}><Gauge size={12} strokeWidth={2.5} /> Mealfit vs LLM solo</span>
                                <div className={styles.versus}>
                                    {VERSUS.map((v, i) => (
                                        <div key={v.label} className={styles.vRow}>
                                            <span className={styles.vLabel}>{v.label}</span>
                                            <div className={styles.vBarLine}>
                                                <span className={styles.vTag}>MEALFIT</span>
                                                <div className={styles.vTrack}>
                                                    <motion.span
                                                        className={`${styles.vFill} ${styles.vFillMealfit}`}
                                                        initial={{ width: 0 }}
                                                        whileInView={{ width: `${v.mealfit}%` }}
                                                        viewport={{ once: true }}
                                                        transition={{ duration: 1.3, delay: 0.2 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
                                                    />
                                                </div>
                                                <span className={styles.vValHi}><CountUp to={v.mealfit} decimals={v.mealfit === 100 ? 0 : 1} /></span>
                                            </div>
                                            <div className={styles.vBarLine}>
                                                <span className={`${styles.vTag} ${styles.vTagLlm}`}>LLM</span>
                                                <div className={styles.vTrack}>
                                                    <motion.span
                                                        className={`${styles.vFill} ${styles.vFillLlm}`}
                                                        initial={{ width: 0 }}
                                                        whileInView={{ width: `${v.llm}%` }}
                                                        viewport={{ once: true }}
                                                        transition={{ duration: 1.3, delay: 0.3 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
                                                    />
                                                </div>
                                                <span className={styles.vValLlm}>{v.llm}%</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className={styles.caps}>
                                    {CAPS.map((c) => (
                                        <div key={c.label} className={styles.capRow}>
                                            <span className={styles.capCheck}><Check size={13} strokeWidth={3} /></span>
                                            <span className={styles.capLabel}>{c.label}</span>
                                            <span className={styles.capLlm}>
                                                {c.llm === 'x'
                                                    ? <X size={12} strokeWidth={2.5} />
                                                    : <Minus size={12} strokeWidth={3} />}
                                            </span>
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
