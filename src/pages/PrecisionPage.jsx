import { useEffect, useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
    Gauge, Cpu, Target, ListChecks, ShieldCheck, ScanSearch, Scale,
    Check, Minus, X, ChevronRight, ArrowRight, Info,
} from 'lucide-react';
// Marco minimalista-científico compartido con /como-funciona y /funciones.
import styles from './HowItWorksPage.module.css';
// Estilos específicos de esta página (tabla comparativa + barras por macro).
import t from './PrecisionPage.module.css';

/* [P3-PRECISION-PAGE-SCIENTIFIC · 2026-06-30] Rediseño de "Precisión" en la clave
   minimalista-científica del set de detalle, pero SIN figuras abstractas (decisión del
   owner): el dato es el protagonista — tabla benchmark pulida + barras por macro.
   Cifras REALES del benchmark A/B N=8 jun 2026 (motor P3-MACRO-REBALANCE), sin cambios
   (consistentes con la consola del landing). Auditoría de contenido P3-PRECISION-AUDIT:
   «error máximo»→«error medio» (MAPE es media, no máximo); métrica «cálculo determinista»
   reformulada a «macros que cuadran al recalcular» (un LLM no calcula determinista);
   «0% fallback = siempre» suavizado a «tiende a 0% en operación normal». «LLM solo» =
   mismo pipeline con el motor apagado, NO un competidor. Precisión de MACROS, no clínica. */

const HERO_STATS = [
    { num: '98.5%', label: 'Precisión de proteína' },
    { num: '91.7%', label: 'Planes con 4 macros en banda' },
    { num: '100%', label: 'Cálculo determinista' },
    { num: '±3.2%', label: 'Error medio · peor macro' },
];

const PER_MACRO = [
    { label: 'Proteína', pct: 98.5, err: '±1.5%' },
    { label: 'Calorías', pct: 98.0, err: '±2.0%' },
    { label: 'Grasas', pct: 96.9, err: '±3.1%' },
    { label: 'Carbohidratos', pct: 96.8, err: '±3.2%' },
];

const VERSUS = [
    { metric: 'Precisión de proteína', sub: 'el macro más difícil de cuadrar', mealfit: 98.5, llm: 84 },
    { metric: 'Planes con los 4 macros en banda', sub: 'kcal + proteína + carbos + grasas', mealfit: 91.7, llm: 24 },
    { metric: 'Macros que cuadran al recalcular', sub: 'calculados de los ingredientes, no estimados a ojo', mealfit: 100, llm: 55 },
];

const CAPS = [
    { metric: 'Se ajusta a tus condiciones', sub: 'DM2 · renal · HTA · alergias', llm: 'partial' },
    { metric: 'Lista de compras + Nevera', sub: 'automática, sin que la armes tú', llm: 'x' },
    { metric: 'Coach que ajusta tu plan', sub: 'cambia comidas, registra, responde', llm: 'partial' },
];

const HOW = [
    { Icon: Cpu, title: 'Motor determinista', text: 'Tras la generación con IA, un motor calcula los macros — no los estima a ojo. En operación normal el fallback tiende a 0%, así el plan se cuadra de forma consistente.' },
    { Icon: Target, title: 'Rebalanceo de macros', text: 'Re-apunta las tres macros tras cuantizar las porciones. Gracias a esto la proteína pasó de ser el macro MÁS incumplido al MÁS preciso.' },
    { Icon: ShieldCheck, title: 'Piso de proteína', text: 'Una guarda garantiza que nunca quedes por debajo de tu mínimo, incluso después de aplicar topes clínicos.' },
    { Icon: Scale, title: 'Cuantización realista', text: 'Las porciones se redondean a cantidades que de verdad se sirven, y luego se re-equilibran los números.' },
    { Icon: ListChecks, title: 'Coherencia receta ↔ lista', text: 'Si una receta pide 200 g de pollo, la lista tiene ≈200 g × tu hogar. Sin ingredientes fantasma ni magnitudes a la mitad.' },
    { Icon: ScanSearch, title: 'Solo ingredientes verificados', text: 'El motor usa únicamente alimentos del catálogo con datos nutricionales reales — base de que los números sean confiables.' },
];

/* marca de capacidad para «LLM solo» (Mealfit siempre cumple) */
const Mark = ({ v }) => {
    if (v === 'x') return <X size={16} strokeWidth={2.5} className={t.capNo} aria-label="No" />;
    return <Minus size={16} strokeWidth={3} className={t.capPartial} aria-label="Parcial" />;
};

function Reveal({ children, className, delay = 0 }) {
    const reduce = useReducedMotion();
    if (reduce) return <div className={className}>{children}</div>;
    return (
        <motion.div
            className={className}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, delay, ease: 'easeOut' }}
        >
            {children}
        </motion.div>
    );
}

const PrecisionPage = () => {
    useLayoutEffect(() => { window.scrollTo(0, 0); }, []);
    useEffect(() => {
        const prev = document.title;
        document.title = 'Precisión de MealfitRD — la metodología que medimos';
        return () => { document.title = prev; };
    }, []);

    return (
        <div className={styles.page}>
            {/* ───────────────── hero ───────────────── */}
            <header className={styles.hero}>
                <span className={styles.eyebrow}><Gauge size={14} strokeWidth={2.5} /> Precisión</span>
                <h1 className={styles.title}>
                    Precisión que <span className={styles.accent}>puedes medir</span>.
                </h1>
                <p className={styles.lead}>
                    No prometemos números — los medimos, y te enseñamos cómo. Esta es la metodología
                    detrás de la precisión de macros de MealfitRD, contada con honestidad.
                </p>
                <div className={styles.stats}>
                    {HERO_STATS.map((s) => (
                        <div key={s.label} className={styles.stat}>
                            <div className={styles.statNum}>{s.num}</div>
                            <div className={styles.statLabel}>{s.label}</div>
                        </div>
                    ))}
                </div>
            </header>

            {/* ───────────────── layout: contenido centrado ───────────────── */}
            <div className={styles.layout}>
                <div className={styles.content}>
                    {/* (01) qué medimos */}
                    <section className={styles.block}>
                        <Reveal>
                            <span className={styles.secKicker}>01 — Definiciones</span>
                            <h2 className={styles.secTitle}>Qué medimos exactamente</h2>
                            <p className={styles.secLead}>
                                «Precisión» aquí significa qué tan cerca queda tu plato de tus números objetivo
                                — no es una afirmación clínica. Lo medimos con definiciones concretas:
                            </p>
                            <ul className={styles.bullets}>
                                <li className={styles.bullet}>
                                    <Check size={15} strokeWidth={3} className={styles.bulletIcon} />
                                    <span><strong>MAPE (error absoluto porcentual medio):</strong> el promedio de
                                    |entregado − objetivo| ÷ objetivo en cada macro. 0% sería exacto; nuestra
                                    proteína ronda 1.5% de error medio.</span>
                                </li>
                                <li className={styles.bullet}>
                                    <Check size={15} strokeWidth={3} className={styles.bulletIcon} />
                                    <span><strong>«En banda»:</strong> el plan cae dentro del 90–112% del objetivo
                                    en proteína, carbos y grasas (95–105% en calorías).</span>
                                </li>
                                <li className={styles.bullet}>
                                    <Check size={15} strokeWidth={3} className={styles.bulletIcon} />
                                    <span><strong>Medición continua:</strong> son métricas sobre una muestra de
                                    planes reales generados por el pipeline, no un número de marketing fijo — se
                                    recalculan con el baseline vivo.</span>
                                </li>
                            </ul>
                        </Reveal>
                    </section>

                    {/* (02) benchmark — tabla pulida */}
                    <section className={styles.block}>
                        <Reveal>
                            <span className={styles.secKicker}>02 — A/B del pipeline</span>
                            <h2 className={styles.secTitle}>Mealfit vs un LLM solo</h2>
                            <p className={styles.secLead}>
                                El mismo plan, con y sin nuestro motor determinista. Es una prueba A/B del mismo
                                pipeline — comparamos enfoques, no productos con nombre.
                            </p>
                        </Reveal>
                        <Reveal className={t.cmpWrap}>
                            <table className={t.cmpTable}>
                                <thead>
                                    <tr>
                                        <th className={t.headCell}>Métrica</th>
                                        <th className={`${t.headCell} ${t.headHi} ${t.colHi}`}>Mealfit V1</th>
                                        <th className={t.headCell}>LLM solo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {VERSUS.map((r) => (
                                        <tr key={r.metric}>
                                            <td>
                                                <span className={t.metric}>{r.metric}</span>
                                                <span className={t.metricSub}>{r.sub}</span>
                                            </td>
                                            <td className={`${t.numCell} ${t.colHi}`}>
                                                <span className={`${t.numVal} ${t.numHi}`}>{r.mealfit}%</span>
                                                <span className={t.bar}><span className={`${t.barFill} ${t.barHi}`} style={{ width: `${r.mealfit}%` }} /></span>
                                            </td>
                                            <td className={t.numCell}>
                                                <span className={`${t.numVal} ${t.numLo}`}>{r.llm}%</span>
                                                <span className={t.bar}><span className={`${t.barFill} ${t.barLo}`} style={{ width: `${r.llm}%` }} /></span>
                                            </td>
                                        </tr>
                                    ))}
                                    {CAPS.map((r) => (
                                        <tr key={r.metric}>
                                            <td>
                                                <span className={t.metric}>{r.metric}</span>
                                                <span className={t.metricSub}>{r.sub}</span>
                                            </td>
                                            <td className={`${t.capCell} ${t.colHi}`}><Check size={17} strokeWidth={3} className={t.capCheck} aria-label="Sí" /></td>
                                            <td className={t.capCell}><Mark v={r.llm} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Reveal>
                    </section>

                    {/* (03) por macro */}
                    <section className={styles.block}>
                        <Reveal>
                            <span className={styles.secKicker}>03 — Desglose</span>
                            <h2 className={styles.secTitle}>Precisión por macro</h2>
                            <p className={styles.secLead}>
                                El desglose por cada macronutriente y su error medio. La proteína, antes el macro
                                más incumplido, es hoy el más preciso.
                            </p>
                        </Reveal>
                        <Reveal className={t.macros}>
                            {PER_MACRO.map((m) => (
                                <div key={m.label} className={t.macroRow}>
                                    <span className={t.macroLabel}>{m.label}</span>
                                    <span className={t.macroTrack}><span className={t.macroFill} style={{ width: `${m.pct}%` }} /></span>
                                    <span className={t.macroMeta}>
                                        <span className={t.macroPct}>{m.pct}%</span>
                                        <span className={t.macroErr}>{m.err} error</span>
                                    </span>
                                </div>
                            ))}
                        </Reveal>
                    </section>

                    {/* (04) cómo lo logramos */}
                    <section className={styles.block}>
                        <Reveal>
                            <span className={styles.secKicker}>04 — Mecanismo</span>
                            <h2 className={styles.secTitle}>Cómo lo logramos</h2>
                            <p className={styles.secLead}>
                                La IA propone; el motor determinista dispone. Estas son las piezas que convierten
                                un borrador en un plan que cuadra.
                            </p>
                        </Reveal>
                        <Reveal className={`${styles.cards} ${styles.cardsThree}`}>
                            {HOW.map(({ Icon, title, text }) => (
                                <div key={title} className={styles.card}>
                                    <div className={styles.cardHead}>
                                        <Icon size={19} strokeWidth={2} className={styles.cardIcon} />
                                        <div className={styles.cardTitle}>{title}</div>
                                    </div>
                                    <div className={styles.cardText}>{text}</div>
                                </div>
                            ))}
                        </Reveal>
                    </section>
                </div>
            </div>

            {/* ───────────────── cierre: honestidad + CTA ───────────────── */}
            <div className={styles.closing}>
                <Reveal className={styles.disclaimer}>
                    <Info size={20} strokeWidth={2.25} className={styles.disclaimerIcon} />
                    <div className={styles.disclaimerText}>
                        <strong>Metodología y honestidad.</strong> «Sin motor (LLM solo)» es lo que obtienes al
                        pedirle el plan directamente a un modelo de lenguaje, sin nada que cuadre tus macros. Son
                        métricas de <strong>precisión de macros</strong> —qué tan cerca queda el plan de tus
                        números—, medidas sobre una muestra de planes reales; no son corrección clínica ni
                        consejo médico. ¿Quieres ver el mecanismo? Mira <Link to="/motor">el motor por dentro</Link>.
                    </div>
                </Reveal>

                <Reveal className={styles.finalCta}>
                    <h2 className={styles.finalTitle}>Mira tus propios números cuadrar</h2>
                    <p className={styles.finalText}>Crea un plan y comprueba la precisión sobre tus objetivos reales.</p>
                    <div className={styles.ctaRow}>
                        <Link to="/assessment" className={styles.ctaPrimary}>Crear mi Plan <ChevronRight size={19} strokeWidth={2.5} /></Link>
                        <Link to="/funciones" className={styles.ctaGhost}>Ver funciones <ArrowRight size={18} strokeWidth={2.25} /></Link>
                    </div>
                </Reveal>
            </div>
        </div>
    );
};

export default PrecisionPage;
