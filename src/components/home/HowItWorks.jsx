import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ClipboardList, Cpu, Salad, LineChart } from 'lucide-react';
import styles from './HowItWorks.module.css';

/* [P3-HOWITWORKS-AUTOCYCLE · 2026-06-29] Cadencia del auto-avance del paso activo. */
const AUTO_ADVANCE_MS = 4500;

/* [P3-HOWITWORKS-REDESIGN · 2026-06-29] Panel interactivo (acordeón): a la izquierda
   un visual que cambia según el paso activo; a la derecha la lista de pasos (el activo
   se expande). Copy más científico pero honesto (sin prometer resultados). Animación
   media (reveal on-scroll + estados animados + hover). */

const STEPS = [
    {
        icon: ClipboardList,
        title: 'Perfil clínico-metabólico',
        desc: 'Más que tu peso: composición, gasto energético, condiciones, alergias IgE, presupuesto y estilo de vida. Es el sustrato de cada decisión del motor.',
        tag: '20+ variables de entrada',
        color: '#60A5FA',
    },
    {
        icon: Cpu,
        title: 'Motor de inferencia',
        desc: 'DeepSeek V4 resuelve tu plan contra el catálogo verificado, optimizando macronutrientes, coste y adherencia — en segundos, no a ojo.',
        tag: 'DeepSeek V4 · segundos',
        color: '#A78BFA',
    },
    {
        icon: Salad,
        title: 'Calibración nutricional',
        desc: 'Cada plato se ajusta a tus macronutrientes objetivo y a 17 micronutrientes (vs DRI), con coherencia receta↔lista validada.',
        tag: '17 micronutrientes · DRI',
        color: '#34D399',
    },
    {
        icon: LineChart,
        title: 'Adaptación longitudinal',
        desc: 'El plan se recalcula con tu progreso semana a semana, ajustando porciones para sortear la meseta metabólica.',
        tag: 'recálculo semanal',
        color: '#FB923C',
    },
];

/* ───────────────────────────────────── visuales por paso ─────────────────── */

function ProfileVisual() {
    const rows = [
        { label: 'Composición corporal', w: '74%' },
        { label: 'Condiciones clínicas', w: '48%' },
        { label: 'Presupuesto', w: '62%' },
        { label: 'Estilo de vida', w: '85%' },
    ];
    return (
        <div className={styles.vProfile}>
            {rows.map((r, i) => (
                <motion.div className={styles.vRow} key={r.label}
                    initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * i, duration: 0.4 }}>
                    <span className={styles.vRowLabel}>{r.label}</span>
                    <span className={styles.vRowTrack}>
                        <motion.span className={styles.vRowFill}
                            initial={{ width: 0 }} animate={{ width: r.w }}
                            transition={{ delay: 0.12 + 0.05 * i, duration: 0.6, ease: 'easeOut' }} />
                    </span>
                </motion.div>
            ))}
        </div>
    );
}

function EngineVisual() {
    return (
        <div className={styles.vEngine}>
            <span className={styles.vEngineRing} />
            <span className={styles.vEngineRing2} />
            <span className={styles.vEngineCore}><Cpu size={38} strokeWidth={1.6} /></span>
            {[0, 1, 2, 3, 4, 5].map((i) => (
                <span key={i} className={styles.vToken} style={{ '--i': i }} />
            ))}
        </div>
    );
}

function Ring({ pct, color, label }) {
    const r = 28;
    const c = 2 * Math.PI * r;
    return (
        <div className={styles.vRingItem}>
            <svg width="78" height="78" viewBox="0 0 78 78">
                <circle cx="39" cy="39" r={r} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="6.5" />
                <motion.circle cx="39" cy="39" r={r} fill="none" stroke={color} strokeWidth="6.5"
                    strokeLinecap="round" strokeDasharray={c} transform="rotate(-90 39 39)"
                    initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - pct / 100) }}
                    transition={{ duration: 0.85, ease: 'easeOut' }} />
            </svg>
            <span className={styles.vRingPct}>{pct}%</span>
            <span className={styles.vRingLabel}>{label}</span>
        </div>
    );
}

function MacroVisual() {
    return (
        <div className={styles.vMacros}>
            <Ring pct={94} color="#818CF8" label="Proteína" />
            <Ring pct={89} color="#34D399" label="Carbos" />
            <Ring pct={96} color="#FB7185" label="Grasas" />
        </div>
    );
}

function ChartVisual() {
    const pts = [[8, 76], [54, 62], [100, 66], [146, 44], [192, 30], [232, 16]];
    const poly = pts.map((p) => p.join(',')).join(' ');
    return (
        <div className={styles.vChart}>
            <svg width="100%" height="150" viewBox="0 0 240 90" preserveAspectRatio="none">
                <motion.polyline points={poly} fill="none" stroke="#FB923C" strokeWidth="2.6"
                    strokeLinecap="round" strokeLinejoin="round"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                    transition={{ duration: 1, ease: 'easeOut' }} />
                {pts.map((p, i) => (
                    <motion.circle key={i} cx={p[0]} cy={p[1]} r="3.6" fill="#FB923C"
                        initial={{ scale: 0 }} animate={{ scale: 1 }}
                        transition={{ delay: 0.12 * i + 0.3, type: 'spring', stiffness: 300 }} />
                ))}
            </svg>
            <div className={styles.vChartAxis}>
                {['S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map((s) => <span key={s}>{s}</span>)}
            </div>
        </div>
    );
}

const VISUALS = [ProfileVisual, EngineVisual, MacroVisual, ChartVisual];

/* ───────────────────────────────────── sección ──────────────────────────── */

const HowItWorks = () => {
    const [active, setActive] = useState(0);
    const [paused, setPaused] = useState(false);
    const step = STEPS[active];
    const Visual = VISUALS[active];

    /* [P3-HOWITWORKS-AUTOCYCLE · 2026-06-29] Rota el paso activo cada AUTO_ADVANCE_MS
       para un loop estético. Se pausa al interactuar (hover/focus en la lista) y se
       desactiva con prefers-reduced-motion (a11y: no auto-animar a quien no lo quiere).
       Depende de [active] → cada selección manual re-arma el timer desde cero, así no
       salta justo después de que el usuario elige un paso. */
    useEffect(() => {
        if (paused) return undefined;
        if (typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
        const id = setInterval(() => {
            setActive((a) => (a + 1) % STEPS.length);
        }, AUTO_ADVANCE_MS);
        return () => clearInterval(id);
    }, [paused, active]);

    return (
        <section className={styles.section} id="how-it-works">
            <div className={styles.bgGlow} aria-hidden="true" />
            <div className={styles.container}>
                <motion.div className={styles.header}
                    initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.6 }} transition={{ duration: 0.5 }}>
                    <span className={styles.badge}>El método</span>
                    <h2 className={styles.title}>Así funciona tu transformación</h2>
                    <p className={styles.subtitle}>
                        Simple por fuera, riguroso por dentro: del dato a tu plato, con método.
                    </p>
                </motion.div>

                <motion.div className={styles.panel}
                    initial={{ opacity: 0, y: 26 }} whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.55 }}>

                    {/* visual (cambia según el paso activo) */}
                    <div className={styles.visualCol} style={{ '--accent': step.color }}>
                        <div className={styles.visualGlow} aria-hidden="true" />
                        <AnimatePresence mode="wait">
                            <motion.div key={active} className={styles.visualInner}
                                initial={{ opacity: 0, scale: 0.96, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.98, y: -10 }}
                                transition={{ duration: 0.3 }}>
                                <Visual />
                            </motion.div>
                        </AnimatePresence>
                        <div className={styles.visualTag}>
                            <span className={styles.visualDot} /> {step.tag}
                        </div>
                    </div>

                    {/* acordeón de pasos. Hover/focus dentro pausa el auto-avance
                        (onFocus/onBlur de React burbujean → cubre teclado). */}
                    <div className={styles.steps}
                        onMouseEnter={() => setPaused(true)}
                        onMouseLeave={() => setPaused(false)}
                        onFocus={() => setPaused(true)}
                        onBlur={() => setPaused(false)}>
                        {STEPS.map((s, i) => {
                            const Icon = s.icon;
                            const isActive = i === active;
                            return (
                                <button type="button" key={s.title}
                                    className={`${styles.step} ${isActive ? styles.stepActive : ''}`}
                                    style={{ '--accent': s.color }}
                                    onClick={() => setActive(i)}
                                    onMouseEnter={() => setActive(i)}
                                    aria-expanded={isActive}>
                                    <span className={styles.stepNum}>0{i + 1}</span>
                                    <span className={styles.stepIcon}><Icon size={19} strokeWidth={2} /></span>
                                    <span className={styles.stepMain}>
                                        <span className={styles.stepTitle}>{s.title}</span>
                                        <AnimatePresence initial={false}>
                                            {isActive && (
                                                <motion.span className={styles.stepDescWrap}
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.28, ease: 'easeOut' }}>
                                                    <span className={styles.stepDesc}>{s.desc}</span>
                                                </motion.span>
                                            )}
                                        </AnimatePresence>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </motion.div>
            </div>
        </section>
    );
};

export default HowItWorks;
