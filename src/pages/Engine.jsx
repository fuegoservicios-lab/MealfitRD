import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    Cpu, ShieldCheck, Activity, ScanSearch, Refrigerator,
    HeartPulse, Droplets, Scale, Baby, FlaskConical, Pill, Egg,
    Gauge, ListChecks, ArrowRight, ChevronRight, Sparkles, Info,
    BrainCircuit, Lock,
} from 'lucide-react';
import styles from './Engine.module.css';

/**
 * [P3-ENGINE-INFO-PAGE · 2026-06-28 · rediseño abstracto P3-ENGINE-MODEL-DIAGRAM 2026-06-30]
 * Página pública del motor de MealfitRD (v1.0.0). Rediseñada con un lenguaje visual PROPIO
 * — distinto al line-art sobre dot-grid del resto de páginas de detalle: estética "blueprint"
 * (rejilla de líneas finas + marcas de calibración) y UNA sola imagen abstracta grande al
 * inicio que representa el MODELO: entrada de datos → núcleo de generación → capas de
 * validación (guardas) → plan. Contenido REAL, honesto, con disclaimer. Marketing (dark-only).
 */

// [P3-ENGINE-MODEL-IMAGE · 2026-07-01] Fecha de publicación del modelo (editable).
const RELEASE_DATE = '1 de julio de 2026';

const CX = 390;
const CY = 238;
const D2R = (d) => (d * Math.PI) / 180;
const onC = (r, a) => [CX + r * Math.cos(D2R(a)), CY + r * Math.sin(D2R(a))];
const fmt = ([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`;

/* ─────────── imagen abstracta del modelo v1.0 (SVG blueprint) ───────────
   Composición con márgenes deliberados: eje de datos horizontal (ENTRADA →
   núcleo → PLAN); nodos de las órbitas DESFASADOS para que nunca se alineen
   entre capas; anotaciones lejos de anillos y nodos. */
function ModelDiagram() {
    const R_CAL = 176;   // anillo de calibración (exterior)
    const R_GUARD = 142; // órbita de guardas (validación)
    const R_PIPE = 90;   // anillo del pipeline (5 etapas)
    const pipeline = [0, 1, 2, 3, 4].map((i) => onC(R_PIPE, -90 + i * 72));
    const guards = Array.from({ length: 8 }, (_, i) => onC(R_GUARD, -90 + 22.5 + i * 45));
    const hexOuter = Array.from({ length: 6 }, (_, i) => onC(44, -90 + i * 60));
    const hexInner = Array.from({ length: 6 }, (_, i) => onC(25, -60 + i * 60));
    const fans = [-56, 0, 56];   // 3 flujos de entrada (fan izquierdo)
    const intakeX = 178;         // punto de convergencia de la entrada
    const arrowX = 604;          // punta de la flecha de salida
    const planX = 626;           // tarjeta del plan (con holgura vs la flecha)
    const corners = [[24, 24], [756, 24], [24, 476], [756, 476]];
    const hiGuard = 2;           // guarda destacada (spot despejado, abajo-derecha)

    return (
        <svg viewBox="0 0 780 500" className={styles.modelSvg} role="img"
            aria-label="Diagrama abstracto del modelo MealfitRD v1.0: los datos de tu perfil entran al núcleo de generación, pasan por capas de validación y salen como tu plan.">
            <defs>
                <radialGradient id="mCoreGlow" cx="0.5" cy="0.5" r="0.5">
                    <stop offset="0" stopColor="#818CF8" stopOpacity="0.5" />
                    <stop offset="1" stopColor="#818CF8" stopOpacity="0" />
                </radialGradient>
            </defs>

            {/* marco blueprint: ticks en las 4 esquinas */}
            {corners.map(([x, y], i) => {
                const sx = x < 390 ? 1 : -1;
                const sy = y < 250 ? 1 : -1;
                return (
                    <g key={`c${i}`} className={styles.mFrame}>
                        <line x1={x} y1={y} x2={x + sx * 22} y2={y} />
                        <line x1={x} y1={y} x2={x} y2={y + sy * 22} />
                    </g>
                );
            })}

            {/* glow del núcleo */}
            <circle cx={CX} cy={CY} r="140" fill="url(#mCoreGlow)" className={styles.mCoreGlow} />

            {/* anillo de calibración exterior + ticks radiales */}
            <circle cx={CX} cy={CY} r={R_CAL} className={styles.mCalRing} />
            {Array.from({ length: 72 }, (_, i) => {
                const a = i * 5;
                const long = i % 3 === 0;
                const [x1, y1] = onC(R_CAL, a);
                const [x2, y2] = onC(long ? R_CAL - 9 : R_CAL - 5, a);
                return <line key={`t${i}`} x1={x1} y1={y1} x2={x2} y2={y2} className={long ? styles.mTickLong : styles.mTick} />;
            })}

            {/* capa de validación (guardas) — órbita punteada que rota */}
            <g className={styles.mSpinCcw}>
                <circle cx={CX} cy={CY} r={R_GUARD} className={styles.mDash} />
                {guards.map((p, i) => (
                    <circle key={`g${i}`} cx={p[0]} cy={p[1]} r={i === hiGuard ? 4.2 : 3} className={i === hiGuard ? styles.mNodeHi : styles.mNode} />
                ))}
            </g>

            {/* eje de datos: entrada → (núcleo) → salida, una sola línea limpia con flujo */}
            <line x1={intakeX} y1={CY} x2={arrowX} y2={CY} className={styles.mAxis} />
            <line x1={intakeX} y1={CY} x2={arrowX} y2={CY} className={styles.mFlow} />

            {/* flujos de entrada (fan izquierdo) que convergen al eje */}
            {fans.map((oy, i) => {
                const y = CY + oy;
                const d = `M 52 ${y} C 112 ${y}, 140 ${CY + oy * 0.25}, ${intakeX} ${CY}`;
                return <path key={`in${i}`} d={d} className={styles.mInput} />;
            })}
            <circle cx="52" cy={CY - 56} r="2.6" className={styles.mNode} />
            <circle cx="52" cy={CY} r="2.6" className={styles.mNode} />
            <circle cx="52" cy={CY + 56} r="2.6" className={styles.mNode} />
            <circle cx={intakeX} cy={CY} r="3.4" className={styles.mNode} />

            {/* pipeline (5 etapas) — anillo interior con nodos que brillan en secuencia */}
            <circle cx={CX} cy={CY} r="62" className={styles.mRingInner} />
            <circle cx={CX} cy={CY} r={R_PIPE} className={styles.mRing} />
            <polygon points={pipeline.map(fmt).join(' ')} className={styles.mRingPoly} />
            {pipeline.map((p, i) => (
                <g key={`p${i}`} className={styles.mSeq} style={{ animationDelay: `${i * 0.5}s` }}>
                    <circle cx={p[0]} cy={p[1]} r="8.5" className={styles.mStageHalo} />
                    <circle cx={p[0]} cy={p[1]} r="4.5" className={styles.mStage} />
                </g>
            ))}

            {/* núcleo: retícula hexagonal que rota + centro brillante */}
            <g className={styles.mSpinCw}>
                <polygon points={hexOuter.map(fmt).join(' ')} className={styles.mHex} />
                <polygon points={hexInner.map(fmt).join(' ')} className={styles.mHexInner} />
                {hexOuter.map((p, i) => (
                    <line key={`s${i}`} x1={CX} y1={CY} x2={p[0]} y2={p[1]} className={styles.mSpoke} />
                ))}
            </g>
            <circle cx={CX} cy={CY} r="14" className={styles.mCorePulse} />
            <circle cx={CX} cy={CY} r="6.5" className={styles.mCore} />

            {/* salida (derecha): flecha + tarjeta del plan */}
            <path d={`M ${arrowX - 12} ${CY - 6} L ${arrowX} ${CY} L ${arrowX - 12} ${CY + 6} Z`} className={styles.mArrow} />
            <g className={styles.mPlanGlyph}>
                <rect x={planX} y={CY - 17} width="34" height="34" rx="6" className={styles.mPlanCard} />
                <line x1={planX + 8} y1={CY - 7} x2={planX + 26} y2={CY - 7} className={styles.mPlanLine} />
                <line x1={planX + 8} y1={CY} x2={planX + 26} y2={CY} className={styles.mPlanLine} />
                <line x1={planX + 8} y1={CY + 7} x2={planX + 20} y2={CY + 7} className={styles.mPlanLine} />
            </g>

            {/* anotaciones tipo esquema (lejos de anillos y nodos) */}
            <text x="32" y="46" className={styles.mAnno}>MODELO · MEALFITRD</text>
            <text x="32" y="63" className={styles.mAnnoDim}>v1.0.0 · deepseek-v4</text>
            <text x="52" y={CY - 74} className={styles.mAnnoDim}>ENTRADA</text>
            <text x={planX + 17} y={CY - 26} className={styles.mAnnoMidPlan}>PLAN</text>
            <text x={CX} y="474" className={styles.mAnnoMid}>núcleo de generación + validación determinista</text>
        </svg>
    );
}

/* ───────────────────────────────── datos ───────────────────────────────── */

const STATS = [
    { num: '200+', label: 'Alimentos verificados' },
    { num: '17', label: 'Micronutrientes vs DRI' },
    { num: '100%', label: 'Ingredientes verificados' },
    { num: 'V4', label: 'Motor DeepSeek' },
];

const PIPELINE = [
    { title: 'Tu perfil', text: 'Objetivo, datos biométricos, condiciones de salud, alergias, presupuesto y lo que te gusta (o no). Todo entra al motor.' },
    { title: 'Cálculo de objetivos', text: 'Estimamos tus calorías diarias (gasto energético) y tus macros — proteína, carbohidratos y grasas — según tu meta.' },
    { title: 'Generación con IA', text: 'DeepSeek V4 arma los platos día por día usando SOLO alimentos del catálogo verificado. El motor nunca inventa comida que no exista.' },
    { title: 'Validación', text: 'Cada comida pasa por guardas: piso de proteína, banda de macros, variedad, coherencia receta↔lista y la capa clínica según tu perfil.' },
    { title: 'Entrega', text: 'Tu plan completo + una lista de compras costeada con precios reales de supermercado dominicano (RD$).' },
];

const CLINICAL = [
    { Icon: Droplets, title: 'Diabetes (DM2)', text: 'Control de índice glucémico y fibra mínima por caloría, siguiendo criterios tipo ADA.' },
    { Icon: FlaskConical, title: 'Enfermedad renal', text: 'Tope de proteína según KDIGO (0.8 g/kg, 1.2 si hay diálisis), ajustado a tu peso.' },
    { Icon: HeartPulse, title: 'Hipertensión', text: 'Control del sodio a lo largo de todo el plan.' },
    { Icon: Activity, title: 'Dislipidemia', text: 'Sustituye grasas saturadas por opciones más magras.' },
    { Icon: Scale, title: 'Cirugía bariátrica', text: 'Reglas anti-dumping, tope de porciones y de volumen por comida.' },
    { Icon: Baby, title: 'Embarazo y lactancia', text: 'Cuida el mercurio de los pescados y evita el déficit calórico.' },
    { Icon: ShieldCheck, title: 'Alergias (IgE)', text: 'Elimina el alérgeno por completo — incluidos derivados — y sustituye de forma segura.' },
    { Icon: Pill, title: 'Medicamentos', text: 'Considera interacciones como warfarina ↔ vitamina K según tu tratamiento.' },
    { Icon: Egg, title: 'Seguridad alimentaria', text: 'Sin huevo crudo ni mariscos crudos de riesgo: prioriza cocción segura.' },
];

const PRECISION = [
    { Icon: Gauge, title: 'Macros en banda', text: 'Proteína, carbohidratos, grasas y calorías dentro de un rango objetivo. Medido, no a ojo.' },
    { Icon: ScanSearch, title: '17 micronutrientes', text: 'Comparamos tu plan contra las referencias diarias (DRI) con un medidor de cobertura.' },
    { Icon: ListChecks, title: 'Coherencia receta↔lista', text: 'Si una receta pide 200 g de pollo, la lista de compras tiene ≈200 g × tu hogar. Sin ingredientes fantasma.' },
];

// [P3-ENGINE-COMPARISON · 2026-07-01] Datos REALES del A/B interno (motor on vs off),
// mismos números que BenchmarkShowcase. N=8, jun 2026. "LLM solo" = pedirle el plan al
// modelo sin el motor determinista. Precisión = 100 − MAPE. "En banda" = 90-112% (95-105% kcal).
const VERSUS = [
    { label: 'Proteína', full: 'Precisión de proteína', mealfit: 98.5, llm: 84 },
    { label: '4 macros', full: 'Los 4 macros en banda', mealfit: 91.7, llm: 24 },
    { label: 'Recalcular', full: 'Cuadran al recalcular', mealfit: 100, llm: 0 },
];

const MACROS_PREC = [
    { label: 'Calorías', mape: 2.0 },
    { label: 'Grasas', mape: 3.1 },
    { label: 'Carbos', mape: 3.2 },
    { label: 'Proteína', mape: 1.5 },
];

const DIFF = [
    { m: 'Catálogo verificado', llm: 'x', mf: 'Solo alimentos catalogados con precio real; nunca inventa comida.' },
    { m: 'Motor de macros', llm: 'parcial', mf: 'Recalcula desde los gramos reales y reescala porciones para clavar el objetivo.' },
    { m: 'Piso de proteína', llm: 'x', mf: 'Rechaza y reintenta si un día cae por debajo de tu mínimo.' },
    { m: 'Banda de macros', llm: 'parcial', mf: 'Marca y reintenta las comidas fuera del rango objetivo.' },
    { m: 'Coherencia receta↔lista', llm: 'x', mf: 'La lista de compras siempre cuadra con las recetas.' },
    { m: 'Reglas clínicas (código)', llm: 'parcial', mf: 'Reescribe o bloquea el plan: KDIGO, ADA, anti-dumping, mercurio, alergias.' },
    { m: 'Micronutrientes vs DRI', llm: 'x', mf: 'Panel de 17 nutrientes con medidor de cobertura (informativo).' },
    { m: 'A prueba de fallos', llm: 'x', mf: 'Si el modelo falla, cae a un plan matemático — no se cuelga ni se cae.' },
];

/* Gráfico comparativo (barras agrupadas): MealfitRD vs LLM solo */
function ComparisonChart() {
    const W = 640;
    const H = 340;
    const padL = 46;
    const padR = 18;
    const padT = 44;
    const padB = 64;
    const plotH = H - padT - padB;
    const baseY = padT + plotH;
    const plotW = W - padL - padR;
    const groupW = plotW / VERSUS.length;
    const bw = 40;
    const gap = 12;
    const yOf = (v) => baseY - (v / 100) * plotH;
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className={styles.chartSvg} role="img"
            aria-label="Comparación de precisión de macros: MealfitRD frente a un LLM solo, en tres métricas.">
            {[0, 25, 50, 75, 100].map((v) => (
                <g key={v}>
                    <line x1={padL} y1={yOf(v)} x2={W - padR} y2={yOf(v)} className={styles.chartGrid} />
                    <text x={padL - 8} y={yOf(v) + 3.5} className={styles.chartYLabel}>{v}</text>
                </g>
            ))}
            {VERSUS.map((d, i) => {
                const gx = padL + groupW * i + groupW / 2;
                const x1 = gx - bw - gap / 2;
                const x2 = gx + gap / 2;
                return (
                    <g key={d.label}>
                        <rect x={x1} y={yOf(d.mealfit)} width={bw} height={baseY - yOf(d.mealfit)} rx="3.5" className={styles.chartBarMf} />
                        <rect x={x2} y={yOf(d.llm)} width={bw} height={Math.max(0.5, baseY - yOf(d.llm))} rx="3.5" className={styles.chartBarLlm} />
                        <text x={x1 + bw / 2} y={yOf(d.mealfit) - 7} className={styles.chartVal}>{d.mealfit}%</text>
                        <text x={x2 + bw / 2} y={yOf(d.llm) - 7} className={styles.chartValDim}>{d.llm}%</text>
                        <text x={gx} y={baseY + 22} className={styles.chartXLabel}>{d.label}</text>
                    </g>
                );
            })}
            <g>
                <rect x={padL} y={14} width={12} height={12} rx="2.5" className={styles.chartBarMf} />
                <text x={padL + 18} y={24} className={styles.chartLegend}>MealfitRD</text>
                <rect x={padL + 122} y={14} width={12} height={12} rx="2.5" className={styles.chartBarLlm} />
                <text x={padL + 140} y={24} className={styles.chartLegend}>LLM solo</text>
            </g>
        </svg>
    );
}

const Engine = () => {
    useEffect(() => {
        const prev = document.title;
        document.title = 'El motor de MealfitRD — el modelo v1.0 por dentro';
        return () => { document.title = prev; };
    }, []);

    return (
        <div className={styles.page}>
            {/* ---- intro + imagen abstracta del modelo ---- */}
            <section className={styles.intro}>
                <span className={styles.eyebrow}>
                    <Cpu size={14} strokeWidth={2.5} /> Motor
                </span>
                <h1 className={styles.title}>
                    No adivinamos tu plato.<br />
                    Lo <span className={styles.accent}>calculamos</span>.
                </h1>
                <div className={styles.releaseMeta}>
                    <span className={styles.releaseTag}>MealfitRD v1.0.0</span>
                    <span className={styles.releaseDate}>{RELEASE_DATE}</span>
                </div>

                {/* imagen del modelo v1.0 (emblema) */}
                <figure className={styles.modelFigure}>
                    <div className={styles.modelImgWrap}>
                        <picture>
                            <source srcSet="/model-v1.webp" type="image/webp" />
                            <img
                                src="/model-v1.jpeg"
                                alt="Emblema del modelo MealfitRD v1.0: un mandala de alimentos y botánicos dominicanos alrededor del logotipo «v1.0»."
                                className={styles.modelImg}
                                width="671"
                                height="671"
                                loading="eager"
                                decoding="async"
                            />
                        </picture>
                    </div>
                    <figcaption className={styles.modelCaption}>
                        El modelo MealfitRD v1.0 — nutrición dominicana, calculada.
                    </figcaption>
                </figure>

                <p className={styles.lead}>
                    Cada plan pasa por un pipeline de generación con IA y una capa de
                    validación clínica y de coherencia. Esto es lo que ocurre por dentro —
                    contado con honestidad.
                </p>

                <div className={styles.stats}>
                    {STATS.map((s) => (
                        <div key={s.label} className={styles.stat}>
                            <div className={styles.statNum}>{s.num}</div>
                            <div className={styles.statLabel}>{s.label}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ---- pipeline ---- */}
            <section className={styles.section}>
                <span className={styles.kicker}>01 / pipeline</span>
                <h2 className={styles.sectionTitle}>Cómo nace tu plan</h2>
                <p className={styles.sectionLead}>
                    Del formulario a tu lista de compras, en cinco pasos. Cada uno con su
                    propia capa de control de calidad.
                </p>
                {/* diagrama esquemático del flujo (entrada → núcleo → validación → plan) */}
                <figure className={styles.modelFigure}>
                    <div className={`${styles.modelCanvas} ${styles.blueprint}`}>
                        <ModelDiagram />
                    </div>
                    <figcaption className={styles.modelCaption}>
                        Fig. — flujo del motor: entrada → núcleo → validación → plan
                    </figcaption>
                </figure>
                <div className={styles.steps}>
                    {PIPELINE.map((step, i) => (
                        <div key={step.title} className={styles.step}>
                            <div className={styles.stepRail}>
                                <div className={styles.stepNum}>{i + 1}</div>
                                <div className={styles.stepLine} />
                            </div>
                            <div className={styles.stepBody}>
                                <div className={styles.stepTitle}>{step.title}</div>
                                <div className={styles.stepText}>{step.text}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ---- capa clínica ---- */}
            <section className={styles.section}>
                <span className={styles.kicker}>02 / capa clínica</span>
                <h2 className={styles.sectionTitle}>La capa clínica</h2>
                <p className={styles.sectionLead}>
                    Si declaras una condición o una alergia, el motor aplica reglas
                    específicas sobre cada comida — no es solo un prompt, son guardas
                    deterministas que se ejecutan sobre el plan.
                </p>
                <div className={styles.cards}>
                    {CLINICAL.map(({ Icon, title, text }) => (
                        <div key={title} className={styles.card}>
                            <div className={styles.cardIcon}><Icon size={24} strokeWidth={2} /></div>
                            <div className={styles.cardTitle}>{title}</div>
                            <div className={styles.cardText}>{text}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ---- precisión ---- */}
            <section className={styles.section}>
                <span className={styles.kicker}>03 / precisión</span>
                <h2 className={styles.sectionTitle}>La precisión que medimos</h2>
                <p className={styles.sectionLead}>
                    No basta con que se vea bien: el motor verifica que los números cuadren.
                </p>
                <div className={styles.cards}>
                    {PRECISION.map(({ Icon, title, text }) => (
                        <div key={title} className={styles.card}>
                            <div className={styles.cardIcon}><Icon size={24} strokeWidth={2} /></div>
                            <div className={styles.cardTitle}>{title}</div>
                            <div className={styles.cardText}>{text}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ---- comparativa vs un LLM solo ---- */}
            <section className={styles.section}>
                <span className={styles.kicker}>04 / vs un LLM solo</span>
                <h2 className={styles.sectionTitle}>Por qué no es «un LLM y ya»</h2>
                <p className={styles.sectionLead}>
                    Le medimos al motor lo que aporta: encendemos y apagamos su capa determinista
                    sobre el mismo modelo. En precisión de macros, la diferencia es directa.
                </p>
                <figure className={styles.chartFigure}>
                    <div className={`${styles.modelCanvas} ${styles.blueprint}`}>
                        <ComparisonChart />
                    </div>
                    <figcaption className={styles.modelCaption}>
                        Precisión de macros — A/B interno (motor encendido vs apagado)
                    </figcaption>
                </figure>
                <p className={styles.chartNote}>
                    Medición continua sobre planes reales (N=8, jun 2026). «LLM solo» = pedirle el
                    plan al modelo sin el motor. Precisión = 100 − error medio (MAPE); «en banda» =
                    90-112% del objetivo (95-105% en calorías). Compara enfoques, no productos con
                    nombre — y son métricas de precisión, no de corrección clínica.
                </p>

                {/* precisión por macro */}
                <div className={styles.macroBars}>
                    {MACROS_PREC.map((mp) => {
                        const prec = +(100 - mp.mape).toFixed(1);
                        return (
                            <div key={mp.label} className={styles.macroBar}>
                                <div className={styles.macroBarLabel}>{mp.label}</div>
                                <div className={styles.macroBarTrack}>
                                    <span className={styles.macroBarFill} style={{ width: `${prec}%` }} />
                                </div>
                                <div className={styles.macroBarVal}>{prec}%</div>
                            </div>
                        );
                    })}
                </div>

                {/* tabla de diferenciadores */}
                <div className={styles.cmpTableWrap}>
                    <table className={styles.cmpTable}>
                        <thead>
                            <tr>
                                <th>Mecanismo determinista</th>
                                <th>LLM solo</th>
                                <th className={styles.cmpColHi}>MealfitRD</th>
                            </tr>
                        </thead>
                        <tbody>
                            {DIFF.map((d) => (
                                <tr key={d.m}>
                                    <td>{d.m}</td>
                                    <td className={styles.cmpBad}>{d.llm === 'x' ? '✗ no lo hace' : '~ parcial'}</td>
                                    <td className={styles.cmpColHi}>{d.mf}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* ---- aprendizaje a largo plazo ---- */}
            <section className={styles.section}>
                <span className={styles.kicker}>05 / memoria</span>
                <h2 className={styles.sectionTitle}>Aprendizaje a largo plazo</h2>
                <p className={styles.sectionLead}>
                    En los planes de pago (Básico, Plus y Ultra), el coach no empieza de cero cada
                    vez: construye una memoria de tus preferencias que persiste entre conversaciones.
                </p>
                <div className={styles.cards}>
                    <div className={styles.card}>
                        <div className={styles.cardIcon}><BrainCircuit size={24} strokeWidth={2} /></div>
                        <div className={styles.cardTitle}>Memoria semántica</div>
                        <div className={styles.cardText}>
                            Mientras conversas, el coach destila «hechos» permanentes — lo que te
                            gusta, lo que rechazas, tus hábitos — y los guarda con un embedding
                            vectorial (Cohere Embed v4, 1536 dimensiones). Al volver, recupera los
                            más relevantes por <strong>significado</strong>, no por palabra exacta.
                        </div>
                    </div>
                    <div className={styles.card}>
                        <div className={styles.cardIcon}><Lock size={24} strokeWidth={2} /></div>
                        <div className={styles.cardTitle}>Privada y tuya</div>
                        <div className={styles.cardText}>
                            La memoria vive por cuenta: nunca se cruza con otros usuarios y no se usa
                            para entrenar modelos de terceros. Puedes pausarla cuando quieras desde
                            Ajustes.
                        </div>
                    </div>
                    <div className={styles.card}>
                        <div className={styles.cardIcon}><Sparkles size={24} strokeWidth={2} /></div>
                        <div className={styles.cardTitle}>Consolidación (en despliegue)</div>
                        <div className={styles.cardText}>
                            Un proceso offline — el «Dreaming» — que de-duplica, prioriza y ordena tu
                            memoria con el tiempo, con salvaguardas que nunca degradan tus alergias
                            ni condiciones. Está construido y se activa por fases.
                        </div>
                    </div>
                </div>
            </section>

            {/* ---- catálogo + nevera ---- */}
            <section className={styles.section}>
                <span className={styles.kicker}>06 / catálogo</span>
                <h2 className={styles.sectionTitle}>Catálogo real y Nevera Inteligente</h2>
                <div className={styles.cards}>
                    <div className={styles.card}>
                        <div className={styles.cardIcon}><Sparkles size={24} strokeWidth={2} /></div>
                        <div className={styles.cardTitle}>200+ alimentos verificados</div>
                        <div className={styles.cardText}>
                            Productos dominicanos con datos nutricionales reales (curados desde
                            USDA). El motor solo usa alimentos de este catálogo: nada inventado.
                        </div>
                    </div>
                    <div className={styles.card}>
                        <div className={styles.cardIcon}><ListChecks size={24} strokeWidth={2} /></div>
                        <div className={styles.cardTitle}>Lista costeada de verdad</div>
                        <div className={styles.cardText}>
                            La lista de compras se calcula por tamaño de envase con precios reales
                            de supermercado RD$ — para que el plan quepa en tu presupuesto.
                        </div>
                    </div>
                    <div className={styles.card}>
                        <div className={styles.cardIcon}><Refrigerator size={24} strokeWidth={2} /></div>
                        <div className={styles.cardTitle}>Nevera Inteligente</div>
                        <div className={styles.cardText}>
                            Marcas “ya compré la lista” y, al renovar, el motor reusa lo que te
                            sobró y te pide SOLO lo que falta para tener tu nevera al 100%.
                        </div>
                    </div>
                </div>
            </section>

            {/* ---- honestidad ---- */}
            <section className={styles.section}>
                <div className={styles.disclaimer}>
                    <Info size={22} strokeWidth={2.25} className={styles.disclaimerIcon} />
                    <div className={styles.disclaimerText}>
                        <strong>Con los pies en la tierra.</strong> MealfitRD es una herramienta
                        de apoyo nutricional, no un sustituto de un nutricionista o médico. El motor
                        aplica criterios fundamentados en evidencia, pero recomendamos revisión
                        profesional cuando tu condición lo amerita. Las cantidades y micronutrientes
                        son estimaciones, no mediciones de laboratorio.
                    </div>
                </div>
            </section>

            {/* ---- CTA final ---- */}
            <section className={styles.finalCta}>
                <h2 className={styles.finalTitle}>¿List@ para tu plan calculado?</h2>
                <p className={styles.finalText}>
                    Responde unas preguntas y deja que el motor haga el resto — en minutos.
                </p>
                <div className={styles.ctaRow}>
                    <Link to="/assessment" className={styles.ctaPrimary}>
                        Crear mi Plan <ChevronRight size={19} strokeWidth={2.5} />
                    </Link>
                    <Link to="/" className={styles.ctaGhost}>
                        Volver al inicio <ArrowRight size={18} strokeWidth={2.25} />
                    </Link>
                </div>
            </section>
        </div>
    );
};

export default Engine;
