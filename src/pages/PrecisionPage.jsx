import { useEffect, useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    Gauge, Target, Cpu, ListChecks, ShieldCheck, ScanSearch, Scale,
    Check, Minus, X, ChevronRight, ArrowRight, Info,
} from 'lucide-react';
import styles from './Engine.module.css';

/* [P3-DETAIL-PAGES · 2026-06-29] Página de detalle de "Precisión": metodología y
   benchmark, ampliando la consola del landing. Cifras REALES y honestas (benchmark
   A/B N=8 jun 2026, motor P3-MACRO-REBALANCE). «LLM solo» = mismo pipeline con el
   motor apagado, NO un competidor con nombre. Precisión de MACROS, no clínica. */

const HERO_STATS = [
    { num: '98.5%', label: 'Precisión de proteína' },
    { num: '91.7%', label: 'Planes con 4 macros en banda' },
    { num: '100%', label: 'Cálculo determinista' },
    { num: '±3.2%', label: 'Error máximo por macro' },
];

const PER_MACRO = [
    { num: '98.0%', label: 'Calorías · ±2.0% error' },
    { num: '96.9%', label: 'Grasas · ±3.1% error' },
    { num: '96.8%', label: 'Carbohidratos · ±3.2% error' },
    { num: '98.5%', label: 'Proteína · ±1.5% error' },
];

const VERSUS = [
    { metric: 'Precisión de proteína', sub: 'el macro más difícil de cuadrar', mealfit: '98.5%', llm: '84%' },
    { metric: 'Planes con los 4 macros en banda', sub: 'kcal + proteína + carbos + grasas', mealfit: '91.7%', llm: '24%' },
    { metric: 'Cálculo determinista', sub: 'macros calculados, no a ojo', mealfit: '100%', llm: '55%' },
];

const CAPS = [
    { metric: 'Se ajusta a tus condiciones', sub: 'DM2 · renal · HTA · alergias', mealfit: 'check', llm: 'partial' },
    { metric: 'Lista de compras + Nevera', sub: 'automática, sin que la armes tú', mealfit: 'check', llm: 'x' },
    { metric: 'Coach que ajusta tu plan', sub: 'cambia comidas, registra, responde', mealfit: 'check', llm: 'partial' },
];

const HOW = [
    { Icon: Cpu, title: 'Motor determinista', text: 'Tras la generación con IA, un motor calcula los macros — no los estima a ojo. El 0% de fallback significa que el plan siempre se cuadra.' },
    { Icon: Target, title: 'Rebalanceo de macros', text: 'Re-apunta las tres macros tras cuantizar las porciones. Gracias a esto la proteína pasó de ser el macro MÁS incumplido al MÁS preciso.' },
    { Icon: ShieldCheck, title: 'Piso de proteína', text: 'Una guarda garantiza que nunca quedes por debajo de tu mínimo, incluso después de aplicar topes clínicos.' },
    { Icon: Scale, title: 'Cuantización realista', text: 'Las porciones se redondean a cantidades que de verdad se sirven, y luego se re-equilibran los números.' },
    { Icon: ListChecks, title: 'Coherencia receta ↔ lista', text: 'Si una receta pide 200 g de pollo, la lista tiene ≈200 g × tu hogar. Sin ingredientes fantasma ni magnitudes a la mitad.' },
    { Icon: ScanSearch, title: 'Solo ingredientes verificados', text: 'El motor usa únicamente alimentos del catálogo con datos nutricionales reales — base de que los números sean confiables.' },
];

const Mark = ({ v }) => {
    if (v === 'check') return <Check size={17} strokeWidth={3} style={{ color: 'var(--primary)' }} aria-label="Sí" />;
    if (v === 'x') return <X size={15} strokeWidth={2.5} style={{ color: 'var(--text-muted)' }} aria-label="No" />;
    return <Minus size={15} strokeWidth={3} style={{ color: 'var(--text-muted)' }} aria-label="Parcial" />;
};

const PrecisionPage = () => {
    useLayoutEffect(() => { window.scrollTo(0, 0); }, []);
    useEffect(() => {
        const prev = document.title;
        document.title = 'Precisión de MealfitRD — la metodología que medimos';
        return () => { document.title = prev; };
    }, []);

    return (
        <div className={styles.page}>
            <section className={styles.intro}>
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
            </section>

            {/* Qué medimos */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Qué medimos exactamente</h2>
                <p className={styles.sectionLead}>
                    «Precisión» aquí significa qué tan cerca queda tu plato de tus números objetivo — no
                    es una afirmación clínica. Lo medimos con dos definiciones concretas:
                </p>
                <ul className={styles.bullets}>
                    <li className={styles.bullet}>
                        <Check size={16} strokeWidth={3} className={styles.bulletIcon} />
                        <span><strong>MAPE (error absoluto porcentual medio):</strong> el promedio de
                        |entregado − objetivo| ÷ objetivo en cada macro. 0% sería exacto; nuestra proteína
                        ronda 1.5% de error.</span>
                    </li>
                    <li className={styles.bullet}>
                        <Check size={16} strokeWidth={3} className={styles.bulletIcon} />
                        <span><strong>«En banda»:</strong> el plan cae dentro del 90–112% del objetivo en
                        proteína, carbos y grasas (95–105% en calorías).</span>
                    </li>
                    <li className={styles.bullet}>
                        <Check size={16} strokeWidth={3} className={styles.bulletIcon} />
                        <span><strong>Medición continua:</strong> son métricas sobre planes reales, no un
                        número de marketing fijo — se recalculan con el baseline vivo.</span>
                    </li>
                </ul>
            </section>

            {/* Versus */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Mealfit vs un LLM solo</h2>
                <p className={styles.sectionLead}>
                    El mismo plan, con y sin nuestro motor determinista. Es una prueba A/B del mismo
                    pipeline — comparamos enfoques, no productos con nombre.
                </p>
                <div className={styles.cmpTableWrap}>
                    <table className={styles.cmpTable}>
                        <thead>
                            <tr>
                                <th>Métrica</th>
                                <th className={styles.cmpColHi}>Mealfit V1</th>
                                <th>LLM solo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {VERSUS.map((r) => (
                                <tr key={r.metric}>
                                    <td>{r.metric}<br /><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{r.sub}</span></td>
                                    <td className={styles.cmpColHi}><span className={styles.cmpGood}>{r.mealfit}</span></td>
                                    <td><span className={styles.cmpBad}>{r.llm}</span></td>
                                </tr>
                            ))}
                            {CAPS.map((r) => (
                                <tr key={r.metric}>
                                    <td>{r.metric}<br /><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{r.sub}</span></td>
                                    <td className={styles.cmpColHi}><Mark v={r.mealfit} /></td>
                                    <td><Mark v={r.llm} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Por macro */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Precisión por macro</h2>
                <p className={styles.sectionLead}>
                    El desglose por cada macronutriente — y su error medio. La proteína, antes el macro
                    más incumplido, es hoy el más preciso.
                </p>
                <div className={styles.stats}>
                    {PER_MACRO.map((s) => (
                        <div key={s.label} className={styles.stat}>
                            <div className={styles.statNum}>{s.num}</div>
                            <div className={styles.statLabel}>{s.label}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Cómo lo logramos */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Cómo lo logramos</h2>
                <p className={styles.sectionLead}>
                    La IA propone; el motor determinista dispone. Estas son las piezas que convierten un
                    borrador en un plan que cuadra.
                </p>
                <div className={styles.cards}>
                    {HOW.map(({ Icon, title, text }) => (
                        <div key={title} className={styles.card}>
                            <div className={styles.cardIcon}><Icon size={24} strokeWidth={2} /></div>
                            <div className={styles.cardTitle}>{title}</div>
                            <div className={styles.cardText}>{text}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Honestidad */}
            <section className={styles.section}>
                <div className={styles.disclaimer}>
                    <Info size={22} strokeWidth={2.25} className={styles.disclaimerIcon} />
                    <div className={styles.disclaimerText}>
                        <strong>Metodología y honestidad.</strong> «Sin motor (LLM solo)» es lo que obtienes
                        al pedirle el plan directamente a un modelo de lenguaje, sin nada que cuadre tus
                        macros. Son métricas de <strong>precisión de macros</strong> —qué tan cerca queda el
                        plan de tus números—, no de corrección clínica, y no constituyen consejo médico.
                        ¿Quieres ver el mecanismo? Mira <Link to="/motor">el motor por dentro</Link>.
                    </div>
                </div>
            </section>

            <section className={styles.finalCta}>
                <h2 className={styles.finalTitle}>Mira tus propios números cuadrar</h2>
                <p className={styles.finalText}>Crea un plan y comprueba la precisión sobre tus objetivos reales.</p>
                <div className={styles.ctaRow}>
                    <Link to="/assessment" className={styles.ctaPrimary}>Crear mi Plan <ChevronRight size={19} strokeWidth={2.5} /></Link>
                    <Link to="/funciones" className={styles.ctaGhost}>Ver funciones <ArrowRight size={18} strokeWidth={2.25} /></Link>
                </div>
            </section>
        </div>
    );
};

export default PrecisionPage;
