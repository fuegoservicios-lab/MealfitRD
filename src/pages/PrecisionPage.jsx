import { useEffect, useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
    Gauge, Cpu, Target, ListChecks, ShieldCheck, ScanSearch, Scale,
    Check, Minus, X, Info,
} from 'lucide-react';
// [P2-PAPER-NO-INK · 2026-08-02, Task 13] Banda de cierre: última hija de las 6
// rutas papel. Componente propio, NUNCA dentro de Footer.jsx (ver ClosingBand.jsx).
// Sustituye al `.finalCta` local, que pedía el mismo clic con el mismo literal
// justo antes de la banda; `ChevronRight`/`ArrowRight` salieron con él.
import ClosingBand from '../components/home/ClosingBand';
// [P1-PAPER-BENCHMARK · 2026-08-02] Las cifras vienen del SSOT. Vivían escritas
// a mano aquí, en `components/home/BenchmarkShowcase.jsx` y en `pages/Engine.jsx`
// —tres ficheros— y ya habían drifteado: esta página decía `llm: 55` en la fila
// de «cuadran al recalcular» donde las otras dos decían `llm: 0`. El dueño fijó
// el valor el 2026-08-02: era 0, y esta página era la que mentía.
import { MACROS, VERSUS, CAPS, BANDS, HEADLINE_FIGURES, es1, SERIES, CLINICAL, CLINICAL_DELIVERY_PCT } from '../data/benchmark';
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

/* [P1-PAPER-BENCHMARK · 2026-08-02] Todo lo de abajo se DERIVA del SSOT
   (`src/data/benchmark.js`). Las ETIQUETAS siguen siendo copy de esta página
   —difieren a propósito de las del landing— pero ningún NÚMERO se escribe aquí.

   La fila «Macros que cuadran al recalcular» ya no es una fila de barras: era
   `100 vs 55` (mentira) contra `100 vs 0` (verdad), y en cualquiera de las dos
   versiones era una CAPACIDAD BINARIA dibujada en un eje 0-100 junto a un
   `100 − MAPE` y a un porcentaje de planes. Bajó a la sección de capacidades de
   esta misma tabla, donde se responde con ✓/✗ y sin diferencia inventada. */
const PROTEIN = MACROS.find((m) => m.key === 'protein');

const HERO_STATS = VERSUS.map((v) => ({
    num: `${es1(v.mealfit)}%`,
    label: v.key === 'protein' ? 'Precisión de proteína' : 'Planes con 4 macros en banda',
})).concat([
    { num: `${HEADLINE_FIGURES.deterministic}%`, label: 'Cálculo determinista' },
    { num: `±${es1(HEADLINE_FIGURES.worstMacroError)}%`, label: 'Error medio · peor macro' },
]);

const PER_MACRO = MACROS.map((m) => ({
    label: m.label,
    pct: Number((100 - m.mape).toFixed(1)),
    err: `±${es1(m.mape)}%`,
}));

/* Subtítulo por métrica: copy de esta página, no dato. Se indexa por la clave
   del SSOT para que renombrar una etiqueta no lo desemparejen en silencio. */
const VERSUS_SUB = {
    protein: 'el macro más difícil de cuadrar',
    inBand: 'kcal + proteína + carbos + grasas',
};

const HOW = [
    { Icon: Cpu, title: 'Motor determinista', text: 'Tras la generación con IA, un motor calcula los macros — no los estima a ojo. En operación normal el fallback tiende a 0%, así el plan se cuadra de forma consistente.' },
    { Icon: Target, title: 'Rebalanceo de macros', text: 'Re-apunta las tres macros tras cuantizar las porciones. Gracias a esto la proteína pasó de ser el macro MÁS incumplido al MÁS preciso.' },
    { Icon: ShieldCheck, title: 'Piso de proteína', text: 'Una guarda garantiza que nunca quedes por debajo de tu mínimo, incluso después de aplicar topes clínicos.' },
    { Icon: Scale, title: 'Cuantización realista', text: 'Las porciones se redondean a cantidades que de verdad se sirven, y luego se re-equilibran los números.' },
    { Icon: ListChecks, title: 'Coherencia receta ↔ lista', text: 'Si una receta pide 200 g de pollo, la lista tiene ≈200 g × tu hogar. Sin ingredientes fantasma ni magnitudes a la mitad.' },
    { Icon: ScanSearch, title: 'Solo ingredientes verificados', text: 'El motor usa únicamente alimentos del catálogo con datos nutricionales reales — base de que los números sean confiables.' },
];

/* Marca de capacidad. [P1-PAPER-BENCHMARK · 2026-08-02] Ahora lee los TRES
   estados del SSOT (`yes` | `partial` | `no`) en vez de asumir que la columna
   de Bioboros siempre cumple: con la fila binaria bajada aquí desde el
   gráfico, esa suposición dejó de ser gratis. */
const Mark = ({ v }) => {
    if (v === 'no') return <X size={16} strokeWidth={2.5} className={t.capNo} aria-label="No" />;
    if (v === 'partial') return <Minus size={16} strokeWidth={3} className={t.capPartial} aria-label="Parcial" />;
    return <Check size={17} strokeWidth={3} className={t.capCheck} aria-label="Sí" />;
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
        document.title = 'Precisión de Bioboros — la metodología que medimos';
        return () => { document.title = prev; };
    }, []);

    return (
        <>
        <div className={styles.page}>
            {/* ───────────────── hero ───────────────── */}
            <header className={styles.hero}>
                <span className={styles.eyebrow}><Gauge size={14} strokeWidth={2.5} /> Precisión</span>
                <h1 className={styles.title}>
                    Precisión que <span className={styles.accent}>puedes medir</span>.
                </h1>
                <p className={styles.lead}>
                    No prometemos números — los medimos, y te enseñamos cómo. Esta es la metodología
                    detrás de la precisión de macros de Bioboros, contada con honestidad.
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
                                    proteína ronda {es1(PROTEIN.mape)}% de error medio.</span>
                                </li>
                                <li className={styles.bullet}>
                                    <Check size={15} strokeWidth={3} className={styles.bulletIcon} />
                                    <span><strong>«En banda»:</strong> el plan cae dentro del{' '}
                                    {`${100 + BANDS.macros[0]}–${100 + BANDS.macros[1]}%`} del objetivo
                                    en proteína, carbos y grasas
                                    {` (${100 + BANDS.kcal[0]}–${100 + BANDS.kcal[1]}% en calorías)`}.</span>
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
                            <h2 className={styles.secTitle}>Bioboros vs un LLM solo</h2>
                            <p className={styles.secLead}>
                                El mismo plan, con y sin nuestro motor determinista. Es una prueba A/B del mismo
                                pipeline — comparamos enfoques, no productos con nombre.
                                {/* [P1-LANDING-CLINICAL-FACTS · 2026-08-09] procedencia visible de la serie:
                                    era invisible en la página y el motor ha evolucionado desde entonces. */}
                                {' '}Serie medida en {SERIES.monthLong} sobre {SERIES.n} planes dominicanos
                                reales; las cifras clínicas de la sección 05 son posteriores y del motor
                                vigente. Cuando re-midamos esta serie, actualizaremos la tabla — nunca al revés.
                            </p>
                        </Reveal>
                        <Reveal className={t.cmpWrap}>
                            <table className={t.cmpTable}>
                                <thead>
                                    <tr>
                                        <th className={t.headCell}>Métrica</th>
                                        <th className={`${t.headCell} ${t.headHi} ${t.colHi}`}>Bioboros V1</th>
                                        <th className={t.headCell}>LLM solo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {VERSUS.map((r) => (
                                        <tr key={r.key}>
                                            <td>
                                                <span className={t.metric}>{r.label}</span>
                                                <span className={t.metricSub}>{VERSUS_SUB[r.key]}</span>
                                            </td>
                                            <td className={`${t.numCell} ${t.colHi}`}>
                                                <span className={`${t.numVal} ${t.numHi}`}>{es1(r.mealfit)}%</span>
                                                <span className={t.bar}><span className={`${t.barFill} ${t.barHi}`} style={{ width: `${r.mealfit}%` }} /></span>
                                            </td>
                                            <td className={t.numCell}>
                                                <span className={`${t.numVal} ${t.numLo}`}>{es1(r.llm)}%</span>
                                                <span className={t.bar}><span className={`${t.barFill} ${t.barLo}`} style={{ width: `${r.llm}%` }} /></span>
                                            </td>
                                        </tr>
                                    ))}
                                    {CAPS.map((r) => (
                                        <tr key={r.key}>
                                            <td>
                                                <span className={t.metric}>{r.label}</span>
                                                <span className={t.metricSub}>{r.sub}</span>
                                            </td>
                                            <td className={`${t.capCell} ${t.colHi}`}><Mark v={r.mealfit} /></td>
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
                                        <span className={t.macroPct}>{es1(m.pct)}%</span>
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

                    {/* (05) seguridad clínica — matriz N=20 medida contra producción
                        [P1-LANDING-CLINICAL-FACTS · 2026-08-08] cifras del SSOT `CLINICAL`
                        (data/benchmark.js); jamás escritas a mano aquí. */}
                    <section className={styles.block}>
                        <Reveal>
                            <span className={styles.secKicker}>05 — Seguridad clínica</span>
                            <h2 className={styles.secTitle}>La matriz clínica, medida</h2>
                            <p className={styles.secLead}>
                                En {CLINICAL.monthLong} corrimos {CLINICAL.runsCount} veces la matriz completa de{' '}
                                {CLINICAL.n} perfiles clínicos más difíciles del formulario —alergias múltiples,
                                dietas vegana y vegetariana, cirugía bariátrica, diabetes, hipertensión, warfarina,
                                embarazo— contra el motor de producción real, sin selección de resultados:
                                publicamos el agregado de todas las corridas, no la mejor. Esto es lo que midió.
                            </p>
                        </Reveal>
                        <Reveal className={`${styles.cards} ${styles.cardsThree}`}>
                            <div className={styles.card}>
                                <div className={styles.cardHead}>
                                    <ShieldCheck size={19} strokeWidth={2} className={styles.cardIcon} />
                                    <div className={styles.cardTitle}>{CLINICAL.safetyPct}% seguridad en lo entregado</div>
                                </div>
                                <div className={styles.cardText}>
                                    Cero violaciones de alérgenos, dieta o condición médica en todos los
                                    planes entregados de la matriz.
                                </div>
                            </div>
                            <div className={styles.card}>
                                <div className={styles.cardHead}>
                                    <Scale size={19} strokeWidth={2} className={styles.cardIcon} />
                                    <div className={styles.cardTitle}>{CLINICAL_DELIVERY_PCT}% de entrega al primer intento</div>
                                </div>
                                <div className={styles.cardText}>
                                    {CLINICAL.delivered} de {CLINICAL.samples} corridas de perfil
                                    ({CLINICAL.runsCount} corridas × {CLINICAL.n} perfiles) reciben su plan.
                                    El resto no recibe un plan inseguro: el sistema lo rechaza y lo dice.
                                    Preferimos no entregar antes que entregar mal.
                                    {' '}Motor actual (tras las {CLINICAL.currentEngine.fixesCount} mejoras
                                    del {CLINICAL.currentEngine.dateLong}): {CLINICAL.currentEngine.delivered} de{' '}
                                    {CLINICAL.currentEngine.n} en su primera corrida — el agregado incluye
                                    versiones anteriores del motor.
                                </div>
                            </div>
                            <div className={styles.card}>
                                <div className={styles.cardHead}>
                                    <ListChecks size={19} strokeWidth={2} className={styles.cardIcon} />
                                    <div className={styles.cardTitle}>Garantías estructurales al {CLINICAL.minMealsPct}%</div>
                                </div>
                                <div className={styles.cardText}>
                                    ≥5 comidas al día con insulina o cirugía bariátrica y monitor de
                                    vitamina K con warfarina — presentes en todos los casos que los requieren.
                                </div>
                            </div>
                        </Reveal>
                        <Reveal>
                            <p className={styles.secLead}>
                                Los planes entregados de la matriz promediaron {es1(CLINICAL.qualityIndex)}/100
                                en nuestro índice interno de calidad —siete ejes: seguridad clínica, banda de
                                macros, variedad, coherencia culinaria, micronutrientes, realismo de porciones
                                y presupuesto— y un plan clínico completo tarda ~{CLINICAL.latencyP50Min} minutos
                                en generarse, con cada comida pasando por las guardas deterministas antes de
                                llegar a ti. Cada corrida queda registrada con fecha e identificador; cuando
                                corramos la matriz de nuevo, el agregado se actualiza sumando — nunca
                                sustituyendo por la mejor corrida.
                            </p>
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
                        consejo médico. ¿Quieres ver el mecanismo? Mira <Link to="/motor">el motor por
                        dentro</Link> o <Link to="/funciones">todas las funciones</Link>.
                        {/* [P2-PAPER-NO-INK fix1 · 2026-08-02] El enlace a /funciones se
                            reinstala aquí: era el CTA fantasma del `.finalCta` local que
                            retiró <ClosingBand />, y este disclaimer solo enlazaba a /motor.
                            La banda aporta /assessment y /precios, no el camino lateral. */}
                    </div>
                </Reveal>
            </div>
        </div>
        <ClosingBand />
        </>
    );
};

export default PrecisionPage;
